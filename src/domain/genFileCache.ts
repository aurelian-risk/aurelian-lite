// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Persistent IndexedDB cache for the Transformers.js language-model files, so
// they can be saved to / loaded from a single file next to the HTML (like the
// embedding model). Wired as env.customCache in the worker for that backend.
// (WebLLM/Qwen manages its own cache and is not covered here.)
const DB = "ebios_offline_genfiles";
const STORE = "files";
const MAGIC = "AURLLM01";
export const GEN_FILE = "aurelian-llm.bin";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("no IndexedDB")); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("open error"));
  });
}
const keyOf = (request: unknown): string =>
  typeof request === "string" ? request : request && typeof request === "object" && "url" in request ? String((request as { url: string }).url) : String(request);

async function idbGet(key: string): Promise<ArrayBuffer | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as ArrayBuffer | undefined);
    req.onerror = () => reject(req.error);
  });
}
async function idbPut(key: string, buf: ArrayBuffer): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(buf, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbEntries(): Promise<{ key: string; buf: ArrayBuffer }[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE, "readonly").objectStore(STORE);
    const keysReq = store.getAllKeys();
    keysReq.onsuccess = () => {
      const keys = keysReq.result as IDBValidKey[];
      const valsReq = store.getAll();
      valsReq.onsuccess = () => resolve(keys.map((k, i) => ({ key: String(k), buf: (valsReq.result as ArrayBuffer[])[i] })));
      valsReq.onerror = () => reject(valsReq.error);
    };
    keysReq.onerror = () => reject(keysReq.error);
  });
}

/** Cache-like object for Transformers.js `env.customCache`. */
export const genFileCache = {
  async match(request: unknown): Promise<Response | undefined> {
    try { const buf = await idbGet(keyOf(request)); return buf ? new Response(buf) : undefined; } catch { return undefined; }
  },
  async put(request: unknown, response: Response): Promise<void> {
    try { await idbPut(keyOf(request), await response.clone().arrayBuffer()); } catch { /* ignore */ }
  },
};

export async function isGenFilesCached(): Promise<boolean> {
  try {
    const db = await open();
    return await new Promise<boolean>((resolve) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).count();
      req.onsuccess = () => resolve((req.result ?? 0) > 0);
      req.onerror = () => resolve(false);
    });
  } catch { return false; }
}

export async function exportGenPack(modelId: string): Promise<Blob> {
  const entries = await idbEntries();
  if (!entries.length) throw new Error("No language-model files cached yet — download the model first.");
  const manifest = JSON.stringify({ modelId, files: entries.map((e) => ({ key: e.key, len: e.buf.byteLength })) });
  const manifestBytes = new TextEncoder().encode(manifest);
  const head = new Uint8Array(MAGIC.length + 4);
  head.set(new TextEncoder().encode(MAGIC), 0);
  new DataView(head.buffer).setUint32(MAGIC.length, manifestBytes.byteLength, true);
  return new Blob([head, manifestBytes, ...entries.map((e) => e.buf)], { type: "application/octet-stream" });
}

export async function importGenPack(file: Blob): Promise<{ modelId: string | null; count: number }> {
  // Stream file-by-file via Blob.slice so we never hold the whole (huge) pack in
  // memory at once — loading it all into one ArrayBuffer crashes the tab/worker.
  const headBuf = await file.slice(0, MAGIC.length + 4).arrayBuffer();
  if (new TextDecoder().decode(new Uint8Array(headBuf).slice(0, MAGIC.length)) !== MAGIC) throw new Error("Not an Aurelian language-model file.");
  const manifestLen = new DataView(headBuf).getUint32(MAGIC.length, true);
  let offset = MAGIC.length + 4;
  const manifest = JSON.parse(new TextDecoder().decode(await file.slice(offset, offset + manifestLen).arrayBuffer())) as { modelId: string; files: { key: string; len: number }[] };
  offset += manifestLen;
  for (const f of manifest.files) {
    await idbPut(f.key, await file.slice(offset, offset + f.len).arrayBuffer());
    offset += f.len;
  }
  return { modelId: manifest.modelId ?? null, count: manifest.files.length };
}

export async function clearGenFiles(): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}
