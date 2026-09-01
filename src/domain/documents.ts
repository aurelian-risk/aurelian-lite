// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Reference-document library. We hold lightweight REFERENCES (name + metadata)
// and, for text-like files, cache the extracted plain text locally (offline, in
// IndexedDB) so extraction can read it instantly without re-picking the file.
import { isExtractable, extractFileText } from "./docextract";

export interface RefDoc {
  id: string;
  studyId: string;  // documents belong to a specific study
  name: string;
  mime: string;
  size: number;
  note?: string;
  addedAt: string;
  hasText?: boolean; // whether cached text is available for instant extraction
  /** Whether the SOURCE FILE was kept. False for a corpus imported before the app started
   *  keeping them - such a reference cannot travel in a packaged export. */
  hasFile?: boolean;
}

// Stored record = the reference, the cached text body, and — since the export learned to
// package — the SOURCE FILE itself.
//
// Keeping the file was the missing piece: a study argues from its documents, and until now
// only the extracted text was kept, so a study handed to somebody else arrived without the
// PDFs it cites. Blobs survive IndexedDB byte-identically, including their MIME type
// (measured on file://, where the quota is ~3 GB), so the file is kept as it came in.
//
// Optional, because a corpus imported before this existed has no file, and a reference may
// legitimately be metadata only. `hasFile` on the listing says which.
type StoredDoc = RefDoc & { text?: string; file?: Blob };

const DB = "ebios_offline_docs";
const STORE = "docs";
const TEXT_EXT = /\.(txt|md|markdown|csv|log|json|yaml|yml|tsv|text)$/i;
const isTextLike = (name: string, mime: string) => mime.startsWith("text/") || TEXT_EXT.test(name);

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("no IndexedDB")); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("open error"));
  });
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "doc-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** List the references belonging to one study (metadata only). */
export async function listDocs(studyId: string): Promise<RefDoc[]> {
  try {
    const db = await open();
    const docs = await new Promise<StoredDoc[]>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as StoredDoc[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    // Strip the (potentially large) cached text — the list only needs metadata.
    return docs
      .filter((d) => d.studyId === studyId)
      .map(({ text, file, ...meta }) => ({ ...meta, hasText: !!text, hasFile: !!file }))
      .sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));
  } catch { return []; }
}

/** Read the cached text body of a reference (null if none was cached). */
export async function getDocText(id: string): Promise<string | null> {
  try {
    const db = await open();
    const doc = await new Promise<StoredDoc | undefined>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result as StoredDoc | undefined);
      req.onerror = () => reject(req.error);
    });
    return doc?.text ?? null;
  } catch { return null; }
}

/** Store a reference for a study — the file itself, plus the cached text where there is one. */
export async function addRef(studyId: string, name: string, mime: string, size: number, text?: string, note = "", file?: Blob): Promise<RefDoc> {
  const doc: StoredDoc = { id: uid(), studyId, name, mime: mime || "application/octet-stream", size, note, addedAt: new Date().toISOString(), text: text || undefined, file };
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(doc);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  const { text: _t, file: _f, ...meta } = doc;
  return { ...meta, hasText: !!text, hasFile: !!file };
}

/** Remove every reference belonging to a study (used when the study is deleted). */
export async function deleteDocsForStudy(studyId: string): Promise<void> {
  try {
    const db = await open();
    const all = await new Promise<StoredDoc[]>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as StoredDoc[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(STORE, "readwrite");
    for (const d of all) if (d.studyId === studyId) tx.objectStore(STORE).delete(d.id);
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); tx.onerror = () => resolve(); });
  } catch { /* ignore */ }
}

/** All stored documents (with cached text) — for a fully portable export. */
async function allDocs(studyIds?: string[]): Promise<StoredDoc[]> {
  try {
    const db = await open();
    const all = await new Promise<StoredDoc[]>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as StoredDoc[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    return studyIds ? all.filter((d) => studyIds.includes(d.studyId)) : all;
  } catch { return []; }
}

/** The references for a JSON export: WHICH documents, not what is in them.
 *
 *  The bodies are deliberately absent. Extraction has already done its work — the entities
 *  it found are in the data model, and that is the substance; the raw text afterwards is
 *  bulk. Measured on a modest corpus (40 documents of 150 kB): 6.2 MB of JSON with the
 *  bodies against 9 kB without, a factor of ~700, and a third again on top once encrypted.
 *  That turns a file meant to be read and diffed into one no editor opens.
 *
 *  The text and the source files travel in the archive export instead, where they are
 *  compressed and where nobody expects to read them by eye. */
export async function exportDocMeta(studyIds?: string[]): Promise<RefDoc[]> {
  return (await allDocs(studyIds)).map(({ text, file, ...meta }) => ({ ...meta, hasText: !!text, hasFile: !!file }));
}

/** Everything, for the archive: metadata, cached text and the source file. */
export async function exportDocFull(studyIds?: string[]): Promise<StoredDoc[]> {
  return allDocs(studyIds);
}

/** Write imported documents into the local store (used on portable import). */
export async function importDocs(docs: StoredDoc[]): Promise<number> {
  if (!docs?.length) return 0;
  try {
    const db = await open();
    const tx = db.transaction(STORE, "readwrite");
    for (const d of docs) if (d && d.id && d.studyId) tx.objectStore(STORE).put(d);
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); tx.onerror = () => resolve(); });
    return docs.length;
  } catch { return 0; }
}

export async function deleteDoc(id: string): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const readText = (file: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result ?? ""));
  r.onerror = () => reject(r.error);
  r.readAsText(file);
});

/** Best plain text for a file: read text-like files directly, extract Word/PDF, else "". */
async function textOf(file: File): Promise<string> {
  if (isTextLike(file.name, file.type)) return readText(file);
  if (isExtractable(file.name, file.type)) return extractFileText(file);
  return "";
}

/** Read one stored source file back, or null where none was kept. */
export async function getDocFile(id: string): Promise<Blob | null> {
  try {
    const db = await open();
    const doc = await new Promise<StoredDoc | undefined>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result as StoredDoc | undefined);
      req.onerror = () => reject(req.error);
    });
    return doc?.file ?? null;
  } catch { return null; }
}

/** Pick a file for the library: the file itself, its metadata, and its text where there is one. */
export function pickFileForRef(): Promise<{ name: string; mime: string; size: number; text?: string; file?: Blob } | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt,.md,.markdown,.csv,.json,.log,.yaml,.yml,.docx,.pdf,text/*,application/pdf";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const meta = { name: file.name, mime: file.type, size: file.size, file: file as Blob };
      try { const text = await textOf(file); resolve(text ? { ...meta, text } : meta); }
      catch (e) { reject(e); }
    };
    input.click();
  });
}

/** Open a document transiently for viewing/extraction — content returned, not stored. */
export function viewTextTransient(): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt,.md,.markdown,.csv,.json,.log,.yaml,.yml,.docx,.pdf,text/*,application/pdf";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      try { resolve({ name: file.name, text: await textOf(file) }); }
      catch (e) { reject(e); }
    };
    input.click();
  });
}
