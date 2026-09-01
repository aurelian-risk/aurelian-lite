// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Persistence + portable data-layer swap.
// Storage: IndexedDB → localStorage fallback. Portability: single-file
// export/import as JSON or YAML, as a full bundle (taxonomy + data), or
// taxonomy-only / data-only.
import yaml from "js-yaml";
import { readZip, writeZip, type ZipEntry } from "./zip";
import type { AppState, Bundle, Study, Taxonomy } from "./types";
import { encryptText, encryptToRecipients, isEncryptedBytes, type Recipient } from "./crypto";

const DB_NAME = "ebios_offline";
const STORE_NAME = "state";
const STATE_KEY = "app";
const LS_KEY = "ebios_offline_state_v2";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no IndexedDB"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("open error"));
  });
}

export let usingIndexedDB = true;

export async function loadRaw(): Promise<unknown> {
  try {
    const db = await openDB();
    const v = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(STATE_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    usingIndexedDB = true;
    if (v) return v;
  } catch {
    usingIndexedDB = false;
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveState(state: AppState): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(state, STATE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    usingIndexedDB = true;
  } catch {
    usingIndexedDB = false;
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }
}

/** Wipe all locally stored app data (IndexedDB + localStorage). */
export async function clearStorage(): Promise<void> {
  try {
    if (typeof indexedDB !== "undefined") {
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase(DB_NAME);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
    }
  } catch { /* ignore */ }
  try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
}

// ── File download / upload ─────────────────────────────────────────────
export type Format = "json" | "yaml";

/** Recursively sort object keys (arrays keep their order — it is meaningful for
 *  entities/history). Makes the export deterministic. */
function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) out[k] = sortDeep((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

// Git-friendly: sorted keys + no line-wrapping so re-exporting unchanged data is
// byte-identical and a single-field change is a single-line diff.
function serialize(obj: unknown, format: Format): string {
  const sorted = sortDeep(obj);
  return format === "yaml"
    ? yaml.dump(sorted, { noRefs: true, lineWidth: -1, sortKeys: true })
    : JSON.stringify(sorted, null, 2) + "\n";
}

function download(filename: string, content: string, format: Format): void {
  const mime = format === "yaml" ? "text/yaml" : "application/json";
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/** Hand a byte payload to the browser as a download. */
export function downloadBytes(filename: string, bytes: Uint8Array, mime: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/** A member name that survives a round trip through any unzip tool.
 *
 *  The id goes first and the original name after it: two documents may legitimately be
 *  called "report.pdf", and an archive that silently keeps one of them is worse than one
 *  with ugly names. Path separators and control characters are removed - a member called
 *  "../etc/passwd" is how an archive escapes the folder it is unpacked into. */
const memberName = (id: string, name: string): string =>
  `docs/${id}__${name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 120)}`;

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ebios";

export type ExportWhat = "bundle" | "taxonomy" | "data";

export async function exportToFile(
  state: AppState, what: ExportWhat, format: Format,
  opts?: { studies?: Study[]; nameHint?: string; documents?: Bundle["documents"]; settings?: Bundle["settings"];
    keys?: Bundle["keys"]; password?: string; recipients?: Recipient[];
    /** The exact base name to write, without extension. Takes precedence over `nameHint`,
     *  which is only a subject to derive one from - the dialog already shows the reader
     *  what the file will be called, so nothing may be added to it afterwards. */
    filename?: string },
): Promise<void> {
  let payload: Bundle;
  if (what === "taxonomy") {
    payload = { kind: "ebios-taxonomy", version: 2, taxonomy: state.taxonomy };
  } else if (what === "data") {
    payload = { kind: "ebios-data", version: 2, studies: opts?.studies ?? state.studies };
  } else {
    payload = { kind: "ebios-bundle", version: 2, taxonomy: state.taxonomy, studies: opts?.studies ?? state.studies };
  }
  // Documents + settings make the export a 100% portable session (not for a
  // taxonomy-only export). The model files themselves stay a separate .bin.
  if (what !== "taxonomy") {
    if (opts?.documents?.length) payload.documents = opts.documents;
    if (opts?.settings) payload.settings = opts.settings;
    if (opts?.keys?.length) payload.keys = opts.keys;
  }
  const base = opts?.filename?.trim() || (opts?.nameHint ? `ebios-${slug(opts.nameHint)}` : `ebios-${what}`);
  const text = serialize(payload, format);
  if (opts?.recipients?.length) {                       // addressed to keys: no shared secret
    const envelope = await encryptToRecipients(text, opts.recipients);
    download(`${base}.${format}.enc`, envelope, "json");
    return;
  }
  if (opts?.password) {                                 // strong AES-256-GCM encryption
    const envelope = await encryptText(text, opts.password);
    download(`${base}.${format}.enc`, envelope, "json");
  } else {
    download(`${base}.${format}`, text, format);
  }
}

/** Parse arbitrary JSON/YAML text into a normalized Bundle. */
/** One document as it travels in an archive. */
export interface ArchiveDoc {
  id: string; studyId: string; name: string; mime: string; size: number;
  note?: string; addedAt: string; text?: string; file?: Blob;
}

/** Everything, in one file: the bundle as readable JSON, the documents beside it.
 *
 *  Why an archive and not more JSON: a corpus measured at 40 documents of 150 kB makes a
 *  6.2 MB export against 9 kB for the references alone, and encryption adds a third on top
 *  of that. Text belongs where it compresses (to about 45% of itself, measured on real
 *  prose) and where nobody expects to read it by eye.
 *
 *  The bundle inside stays exactly the file the JSON export produces - same shape, same
 *  deterministic ordering - so an archive can be opened with any unzip tool and the study
 *  read out of it by hand. */
export async function exportArchive(
  bundle: Bundle, docs: ArchiveDoc[], nameHint?: string,
): Promise<{ bytes: Uint8Array; name: string; docs: number; bytesOfDocs: number }> {
  const enc = new TextEncoder();
  const entries: ZipEntry[] = [{ name: "bundle.json", data: enc.encode(serialize(bundle, "json")) }];
  let docBytes = 0;
  for (const d of docs) {
    if (d.file) {
      const buf = new Uint8Array(await d.file.arrayBuffer());
      entries.push({ name: memberName(d.id, d.name), data: buf });
      docBytes += buf.length;
    }
    // The extracted text travels as its own member: a reference imported from a format
    // this build cannot extract again would otherwise lose it.
    if (d.text) {
      const t = enc.encode(d.text);
      entries.push({ name: `docs/${d.id}.txt`, data: t });
      docBytes += t.length;
    }
  }
  const bytes = await writeZip(entries);
  // The caller has already shown the reader what the file will be called; adding to it
  // here would make the dialog a liar.
  const name = `${(nameHint || "ebios").trim()}.zip`;
  return { bytes, name, docs: docs.length, bytesOfDocs: docBytes };
}

/** Read an archive back: the bundle, and the documents as records ready for the store. */
export async function parseArchive(buf: ArrayBuffer): Promise<{ bundle: Bundle; docs: ArchiveDoc[] }> {
  const members = await readZip(buf);
  const bundleRaw = members.get("bundle.json");
  if (!bundleRaw) throw new Error("Not an Aurelian archive: it holds no bundle.json.");
  const bundle = parseBundle(new TextDecoder().decode(bundleRaw));
  // The references in the bundle say what SHOULD be there; the members say what is. A
  // member without a reference is ignored rather than guessed at.
  const byId = new Map((bundle.documents ?? []).map((d) => [d.id, d]));
  const docs: ArchiveDoc[] = [];
  for (const [id, meta] of byId) {
    const textPart = members.get(`docs/${id}.txt`);
    const filePart = [...members].find(([n]) => n.startsWith(`docs/${id}__`));
    docs.push({
      ...meta,
      text: textPart ? new TextDecoder().decode(textPart) : undefined,
      file: filePart ? new Blob([filePart[1] as BlobPart], { type: meta.mime || "application/octet-stream" }) : undefined,
    });
  }
  return { bundle, docs };
}

/** Does this look like a ZIP? Its first four bytes say so. */
export function isArchive(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 4) return false;
  const u = new Uint8Array(buf, 0, 4);
  return u[0] === 0x50 && u[1] === 0x4b && (u[2] === 3 || u[2] === 5 || u[2] === 7);
}

export function parseBundle(text: string): Bundle {
  const data = yaml.load(text) as Record<string, unknown> | unknown[] | null;
  if (!data) throw new Error("Empty or invalid file.");

  // Array → list of studies.
  if (Array.isArray(data)) return { kind: "ebios-data", version: 2, studies: data as Study[] };

  const obj = data as Record<string, unknown>;
  // A raw taxonomy (has entityTypes).
  if (Array.isArray(obj.entityTypes) && !("studies" in obj) && !("taxonomy" in obj)) {
    return { kind: "ebios-taxonomy", version: 2, taxonomy: obj as unknown as Taxonomy };
  }
  const taxonomy = (obj.taxonomy as Taxonomy) ?? undefined;
  const studies = (obj.studies as Study[]) ?? undefined;
  const documents = (obj.documents as Bundle["documents"]) ?? undefined;
  const settings = (obj.settings as Bundle["settings"]) ?? undefined;
  const keys = (obj.keys as Bundle["keys"]) ?? undefined;
  if (!taxonomy && !studies && !documents) throw new Error("File contains neither a taxonomy nor studies.");
  const kind: Bundle["kind"] = taxonomy && studies ? "ebios-bundle" : taxonomy ? "ebios-taxonomy" : "ebios-data";
  return { kind, version: 2, taxonomy, studies, documents, settings, keys };
}

/** Pick a file and return its raw text (may be an encrypted envelope). */
/** Pick a text file and read it. The NAME comes back too: an import is recorded in the
 *  study log, and "imported from <file>" is the part of that record an auditor cares
 *  about. */
/** Pick a file for import, whatever kind it is.
 *
 *  One picker for both, because a reader should not have to know in advance whether their
 *  file is an archive: it is read as bytes, and the first four of them say which it is. */
export function pickImportFile(): Promise<{ name: string; text?: string; buf?: ArrayBuffer }> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.yaml,.yml,.enc,.zip,application/json,text/yaml,application/zip";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error("No file selected"));
      const reader = new FileReader();
      reader.onload = () => {
        const buf = reader.result as ArrayBuffer;
        // Two shapes are bytes, not text: a plain archive ("PK") and an encrypted one
        // ("AEB1"). Reading the second as text is how it ends up in the JSON parser and
        // fails with a message about the wrong thing entirely.
        if (isArchive(buf) || isEncryptedBytes(new Uint8Array(buf))) resolve({ name: file.name, buf });
        else resolve({ name: file.name, text: new TextDecoder().decode(buf) });
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    };
    input.click();
  });
}

export function pickTextFile(): Promise<{ text: string; name: string }> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.yaml,.yml,.enc,application/json,text/yaml";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error("No file selected"));
      const reader = new FileReader();
      reader.onload = () => resolve({ text: String(reader.result), name: file.name });
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    };
    input.click();
  });
}
