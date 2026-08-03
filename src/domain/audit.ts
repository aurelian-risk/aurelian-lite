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

// ── Change-history chain ─────────────────────────────────────────────────────
const EDITOR_KEY = "aurelian.editor";
/** The self-declared editor name (persisted in localStorage). */
export function getEditor(): string { try { return localStorage.getItem(EDITOR_KEY) || ""; } catch { return ""; } }
export function setEditor(name: string): void { try { localStorage.setItem(EDITOR_KEY, name.trim()); } catch { /* ignore */ } }

// The exact bytes covered by an entry's hash (previous hash included → chain).
const payloadOf = (e: Pick<ChangeEntry, "ts" | "editor" | "kind" | "changes" | "comment">, prev: string): string =>
  JSON.stringify({ ts: e.ts, editor: e.editor, kind: e.kind, changes: e.changes ?? null, comment: e.comment ?? null, prev });

/** Append a change to a (possibly empty) history, linking it to the prior hash. */
export function appendChange(
  history: ChangeEntry[] | undefined,
  base: { editor: string; kind: ChangeEntry["kind"]; ts: string; changes?: FieldChange[]; comment?: string },
): ChangeEntry[] {
  const prevHash = history && history.length ? history[history.length - 1].hash : "";
  const entry: ChangeEntry = { ...base, prevHash, hash: sha256hex(payloadOf(base, prevHash)) };
  return [...(history ?? []), entry];
}

/** Build a valid hash chain from bare (hash-less) entries - used to seal a
 *  pre-authored history (e.g. the sample study) so it verifies correctly. */
export function sealChain(entries: Array<Omit<ChangeEntry, "hash" | "prevHash">>): ChangeEntry[] {
  let h: ChangeEntry[] = [];
  for (const e of entries) h = appendChange(h, e);
  return h;
}

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

/** Verify a hash chain: true if every entry links correctly and is unmodified. */
export function verifyChain(history: ChangeEntry[] | undefined): boolean {
  if (!history?.length) return true;
  let prev = "";
  for (const e of history) {
    if (e.prevHash !== prev || e.hash !== sha256hex(payloadOf(e, prev))) return false;
    prev = e.hash;
  }
  return true;
}
