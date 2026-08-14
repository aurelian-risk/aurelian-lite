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
}

// Stored record = the reference plus (optionally) the cached text body.
type StoredDoc = RefDoc & { text?: string };

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
      .map(({ text, ...meta }) => ({ ...meta, hasText: !!text }))
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

/** Store a reference for a study; for text-like files the text is cached too. */
export async function addRef(studyId: string, name: string, mime: string, size: number, text?: string, note = ""): Promise<RefDoc> {
  const doc: StoredDoc = { id: uid(), studyId, name, mime: mime || "application/octet-stream", size, note, addedAt: new Date().toISOString(), text: text || undefined };
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(doc);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  const { text: _t, ...meta } = doc;
  return { ...meta, hasText: !!text };
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
export async function exportDocs(studyIds?: string[]): Promise<StoredDoc[]> {
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

/** Pick a file for the library: metadata always, plus cached text (incl. Word/PDF). */
export function pickFileForRef(): Promise<{ name: string; mime: string; size: number; text?: string } | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt,.md,.markdown,.csv,.json,.log,.yaml,.yml,.docx,.pdf,text/*,application/pdf";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const meta = { name: file.name, mime: file.type, size: file.size };
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
