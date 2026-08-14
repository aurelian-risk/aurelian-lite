// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Per-entity change history with a hash-chained log, for tamper-evidence and
// accountability. Fully offline and deterministic - no crypto library needed.
// "who" is a self-declared editor name (single-user desktop; there is no auth),
// see MATURITY. The chain makes any edit to a past entry detectable: each entry's
// hash covers the previous entry's hash, so altering history breaks verification.
import type { ChangeEntry, FieldChange, FieldValue } from "./types";

// ── Compact synchronous SHA-256 (operates on a UTF-8 string) ─────────────────
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const rotr = (n: number, x: number) => (x >>> n) | (x << (32 - n));

export function sha256hex(msg: string): string {
  const bytes = new TextEncoder().encode(msg);
  const l = bytes.length;
  const withOne = l + 1;
  const k = (56 - (withOne % 64) + 64) % 64;
  const total = withOne + k + 8;
  const m = new Uint8Array(total);
  m.set(bytes);
  m[l] = 0x80;
  const bits = l * 8;
  const dv = new DataView(m.buffer);
  dv.setUint32(total - 4, bits >>> 0);
  dv.setUint32(total - 8, Math.floor(bits / 0x100000000));
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(7, w[i - 15]) ^ rotr(18, w[i - 15]) ^ (w[i - 15] >>> 3);
      const s1 = rotr(17, w[i - 2]) ^ rotr(19, w[i - 2]) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  let out = "";
  for (let i = 0; i < 8; i++) out += (H[i] >>> 0).toString(16).padStart(8, "0");
  return out;
}

// ── Change log ───────────────────────────────────────────────────────────────
const EDITOR_KEY = "aurelian.editor";
/** The self-declared editor name (persisted in localStorage). */
export function getEditor(): string { try { return localStorage.getItem(EDITOR_KEY) || ""; } catch { return ""; } }
export function setEditor(name: string): void { try { localStorage.setItem(EDITOR_KEY, name.trim()); } catch { /* ignore */ } }

/** Key-sorted JSON, so a fingerprint does not depend on property order. */
function stable(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  const o = v as Record<string, unknown>;
  return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + stable(o[k])).join(",") + "}";
}

/** Fingerprint of a record's values - what the log binds itself to. */
export const hashValues = (values: Record<string, FieldValue>): string => sha256hex(stable(values ?? {}));

/** What an entry's hash covers. The previous hash is included, so the entries form a
 *  chain; `seq` is included, so entries cannot be renumbered to hide a gap. */
const payloadOf = (e: Omit<ChangeEntry, "hash" | "prevHash">, prev: string): string =>
  stable({
    seq: e.seq, ts: e.ts, editor: e.editor, kind: e.kind, entity: e.entity,
    entityType: e.entityType, title: e.title,
    changes: e.changes ?? null, comment: e.comment ?? null, state: e.state ?? null, prev,
  });

/** Everything an entry needs except its position and hashes. */
export type LogInput = Omit<ChangeEntry, "seq" | "hash" | "prevHash">;

/** Append one entry to a (possibly empty) log. */
export function appendLog(log: ChangeEntry[] | undefined, base: LogInput): ChangeEntry[] {
  const prev = log?.length ? log[log.length - 1] : undefined;
  const body = { ...base, seq: (prev?.seq ?? 0) + 1 };
  return [...(log ?? []), { ...body, prevHash: prev?.hash ?? "", hash: sha256hex(payloadOf(body, prev?.hash ?? "")) }];
}

/** Append several entries in one go (a cascade delete, or an applied import). */
export const appendAll = (log: ChangeEntry[] | undefined, bases: LogInput[]): ChangeEntry[] =>
  bases.reduce<ChangeEntry[]>((acc, b) => appendLog(acc, b), log ?? []);

/** Re-seal a list of entries into a valid chain, renumbering from 1. Used to author a
 *  log (the sample study) and to re-establish one after a confirmed import. */
export const sealLog = (entries: LogInput[]): ChangeEntry[] => appendAll(undefined, entries);

/** Field-level diff between two value maps (only changed keys). */
export function diffValues(oldV: Record<string, FieldValue>, newV: Record<string, FieldValue>): FieldChange[] {
  const keys = new Set([...Object.keys(oldV ?? {}), ...Object.keys(newV ?? {})]);
  const out: FieldChange[] = [];
  for (const k of keys) {
    const a = oldV?.[k] ?? null, b = newV?.[k] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ field: k, from: a, to: b });
  }
  return out;
}

export interface LogVerdict {
  ok: boolean;
  /** An entry was altered, removed from the middle, reordered or renumbered. */
  chainBroken: boolean;
  /** `seq` of the first entry that does not check out. */
  brokenAt?: number;
  /** Live records whose values no longer match what the log last recorded - the
   *  signature of an edit made outside the application. */
  drifted: string[];
  /** Live records the log knows nothing about - added to the file from outside. */
  untracked: string[];
}

/** Verify a study log against the records it describes.
 *
 *  Three separate questions, because they fail for different reasons and the analyst
 *  needs to tell them apart: is the log itself intact, does it still describe the data,
 *  and does it cover all of it. */
export function verifyLog(
  log: ChangeEntry[] | undefined,
  entities: Array<{ id: string; values: Record<string, FieldValue> }> = [],
): LogVerdict {
  const last = new Map<string, ChangeEntry>();
  let prev = "";
  for (let i = 0; i < (log?.length ?? 0); i++) {
    const e = log![i];
    if (e.seq !== i + 1 || e.prevHash !== prev || e.hash !== sha256hex(payloadOf(e, prev)))
      return { ok: false, chainBroken: true, brokenAt: e.seq, drifted: [], untracked: [] };
    prev = e.hash;
    last.set(e.entity, e);
  }
  const drifted: string[] = [], untracked: string[] = [];
  for (const rec of entities) {
    const e = last.get(rec.id);
    if (!e || e.kind === "delete") untracked.push(rec.id);
    else if (e.state !== hashValues(rec.values)) drifted.push(rec.id);
  }
  return { ok: !drifted.length && !untracked.length, chainBroken: false, drifted, untracked };
}

/** A single record's history: the study log, filtered. */
export const entryOf = (log: ChangeEntry[] | undefined, entityId: string): ChangeEntry[] =>
  (log ?? []).filter((e) => e.entity === entityId);

/** Entries that describe the study itself rather than one record - an import, for
 *  instance. They carry no record id, so they never make a record look tracked. */
export const STUDY_SCOPE = "";

/** Identity of an entry by CONTENT, ignoring its position and hashes. Used to fold a
 *  colleague's entries into our chain without duplicating what we already have. */
export const entryKey = (e: Pick<ChangeEntry, "ts" | "editor" | "kind" | "entity" | "changes" | "comment">): string =>
  stable({ ts: e.ts, editor: e.editor, kind: e.kind, entity: e.entity, changes: e.changes ?? null, comment: e.comment ?? null });

/** Plain-language summary of a verdict, for the import preview and for the entry that
 *  records the import. */
export function verdictText(v: LogVerdict): string {
  if (v.ok) return "change log complete and matching";
  if (v.chainBroken) return `change log broken at entry ${v.brokenAt ?? "?"}`;
  const parts: string[] = [];
  if (v.drifted.length) parts.push(`${v.drifted.length} record${v.drifted.length === 1 ? "" : "s"} edited outside the app`);
  if (v.untracked.length) parts.push(`${v.untracked.length} record${v.untracked.length === 1 ? "" : "s"} missing from the log`);
  return parts.join(", ");
}
