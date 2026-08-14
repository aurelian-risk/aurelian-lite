// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Persistent IndexedDB cache for the in-browser model files. Transformers.js
// caches via the Cache API by default, which is unavailable on file:// (not a
// secure context) → the model would re-download every session. This provides a
// Cache-like object (match/put) backed by IndexedDB so a once-downloaded model
// is kept locally and reused offline.
const DB = "ebios_offline_models";
const STORE = "files";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("no IndexedDB")); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("open error"));
  });
}
function keyOf(request: unknown): string {
  if (typeof request === "string") return request;
  if (request && typeof request === "object" && "url" in request) return String((request as { url: string }).url);
  return String(request);
}
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
export const modelCache = {
  async match(request: unknown): Promise<Response | undefined> {
    try {
      const buf = await idbGet(keyOf(request));
      return buf ? new Response(buf) : undefined;
    } catch { return undefined; }
  },
  async put(request: unknown, response: Response): Promise<void> {
    try {
      const buf = await response.clone().arrayBuffer();
      await idbPut(keyOf(request), buf);
    } catch { /* ignore cache write errors */ }
  },
};

/** Whether a model appears to be cached already (any files stored). */
export async function isModelCached(): Promise<boolean> {
  try {
    const db = await open();
    return await new Promise<boolean>((resolve) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).count();
      req.onsuccess = () => resolve((req.result ?? 0) > 0);
      req.onerror = () => resolve(false);
    });
  } catch { return false; }
}

// ── Model-as-a-file: pack the cached files into one blob and back ──────────
// Because file:// browsers do not reliably persist IndexedDB across sessions,
// the user can save the downloaded model as a file next to the HTML and re-load
// it (no network). Format: "AURMDL01" | u32 manifestLen | manifest JSON | blobs.
const MAGIC = "AURMDL01";

export async function exportModelPack(modelId: string): Promise<Blob> {
  const entries = await idbEntries();
  const manifest = JSON.stringify({ modelId, files: entries.map((e) => ({ key: e.key, len: e.buf.byteLength })) });
  const manifestBytes = new TextEncoder().encode(manifest);
  const head = new Uint8Array(MAGIC.length + 4);
  head.set(new TextEncoder().encode(MAGIC), 0);
  new DataView(head.buffer).setUint32(MAGIC.length, manifestBytes.byteLength, true);
  return new Blob([head, manifestBytes, ...entries.map((e) => e.buf)], { type: "application/octet-stream" });
}

export async function importModelPack(file: Blob): Promise<{ modelId: string | null; count: number }> {
  // Stream file-by-file via Blob.slice — never hold the whole pack in memory.
  const headBuf = await file.slice(0, MAGIC.length + 4).arrayBuffer();
  if (new TextDecoder().decode(new Uint8Array(headBuf).slice(0, MAGIC.length)) !== MAGIC) throw new Error("Not an Aurelian model file.");
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

// The canonical filename we save to and auto-detect next to the HTML.
export const MODEL_FILE = "aurelian-model.bin";

/** Best-effort: fetch a model pack sitting next to the page and import it.
 *  Works on http(s):// and (usually) Firefox file://; Chrome/Edge file:// block
 *  local fetches, so this silently returns null there → manual load remains. */
export async function tryLoadLocalPack(url = "./" + MODEL_FILE): Promise<{ modelId: string | null; count: number } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size < MAGIC.length + 4) return null;
    return await importModelPack(blob);
  } catch { return null; }
}

export async function clearModelCache(): Promise<void> {
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
