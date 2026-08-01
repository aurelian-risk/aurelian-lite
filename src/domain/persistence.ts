// Persistence + portable data-layer swap.
// Storage: IndexedDB → localStorage fallback. Portability: single-file
// export/import as JSON or YAML, as a full bundle (taxonomy + data), or
// taxonomy-only / data-only.
import yaml from "js-yaml";
import type { AppState, Bundle, Study, Taxonomy } from "./types";
import { encryptText } from "./crypto";

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

function serialize(obj: unknown, format: Format): string {
  return format === "yaml"
    ? yaml.dump(obj, { noRefs: true, lineWidth: 100 })
    : JSON.stringify(obj, null, 2);
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

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ebios";

export type ExportWhat = "bundle" | "taxonomy" | "data";

export async function exportToFile(
  state: AppState, what: ExportWhat, format: Format,
  opts?: { studies?: Study[]; nameHint?: string; documents?: Bundle["documents"]; settings?: Bundle["settings"]; password?: string },
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
  }
  const base = opts?.nameHint ? slug(opts.nameHint) : what;
  const text = serialize(payload, format);
  if (opts?.password) {                                 // strong AES-256-GCM encryption
    const envelope = await encryptText(text, opts.password);
    download(`ebios-${base}.${format}.enc`, envelope, "json");
  } else {
    download(`ebios-${base}.${format}`, text, format);
  }
}

/** Parse arbitrary JSON/YAML text into a normalized Bundle. */
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
  if (!taxonomy && !studies && !documents) throw new Error("File contains neither a taxonomy nor studies.");
  const kind: Bundle["kind"] = taxonomy && studies ? "ebios-bundle" : taxonomy ? "ebios-taxonomy" : "ebios-data";
  return { kind, version: 2, taxonomy, studies, documents, settings };
}

/** Pick a file and return its raw text (may be an encrypted envelope). */
export function pickTextFile(): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.yaml,.yml,.enc,application/json,text/yaml";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error("No file selected"));
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    };
    input.click();
  });
}
