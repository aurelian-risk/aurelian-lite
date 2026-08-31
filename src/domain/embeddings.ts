// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Optional in-browser embeddings via Transformers.js, imported from a CDN at
// RUNTIME (so the offline single-file build stays small — the library is not
// bundled). The chosen model downloads on first use and is persisted in
// IndexedDB (see modelCache.ts) so it is reused across sessions / offline.
import { modelCache } from "./modelCache";
import { getUserModels } from "./modelRegistry";

type Progress = { status: string; progress?: number; file?: string; loaded?: number; total?: number };

export interface ModelOption { id: string; label: string; size: string; note: string }
export const MODELS: ModelOption[] = [
  { id: "Xenova/all-MiniLM-L6-v2", label: "all-MiniLM-L6-v2", size: "~25 MB", note: "fast · general purpose" },
  { id: "Xenova/bge-small-en-v1.5", label: "bge-small-en-v1.5", size: "~34 MB", note: "stronger · English" },
  // Both of the above are English - one says so in its name. Extraction compares a
  // document against the taxonomy's own labels, so a study whose sources are German is
  // matched across a language barrier by a model that was never shown one. Measured on
  // six reference documents (harness/embed-extract.mjs): a German audit report went from
  // 2 of 17 expected entities under the right type to 8, and the whole corpus from 28 of
  // 62 to 35 - so it is not only the German half that gains.
  //
  // Offered, never imposed: five times the size of the first, and about twice as slow
  // (24 s per 1,000 words against 10), which is worth it where the sources are not
  // English and wasted where they are. Nothing downloads until it is chosen.
  { id: "Xenova/paraphrase-multilingual-MiniLM-L12-v2", label: "paraphrase-multilingual-MiniLM-L12", size: "~120 MB", note: "50 languages · for sources that are not English" },
];

/** Built-in embedding models + user-added ones from the registry. */
export function embedModelList(): ModelOption[] {
  return [...MODELS, ...getUserModels().filter((m) => m.kind === "embed").map((m) => ({ id: m.id, label: m.label, size: m.size ?? "custom", note: m.note ?? "user-added" }))];
}

const CDN = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3";
const LS_MODEL = "ebios_offline_model";

let embedder: ((texts: string[]) => Promise<number[][]>) | null = null;
let loading: Promise<void> | null = null;
let loadedId: string | null = null;
let modelId = ((): string => { try { return localStorage.getItem(LS_MODEL) || MODELS[0].id; } catch { return MODELS[0].id; } })();

export function getModelId(): string { return modelId; }
export function loadedModelId(): string | null { return loadedId; }
export function isLoaded(): boolean { return !!embedder && loadedId === modelId; }
export function setModelId(id: string): void {
  if (id === modelId) return;
  modelId = id;
  if (loadedId !== id) { embedder = null; loadedId = null; }
  try { localStorage.setItem(LS_MODEL, id); } catch { /* ignore */ }
}

export async function loadEmbedder(onProgress?: (p: Progress) => void): Promise<void> {
  if (embedder && loadedId === modelId) return;
  if (loading) return loading;
  const target = modelId;
  loading = (async () => {
    const mod: any = await import(/* @vite-ignore */ CDN);
    const pipeline = mod.pipeline;
    try {
      mod.env.allowLocalModels = false;
      mod.env.useBrowserCache = false;
      mod.env.useCustomCache = true;
      mod.env.customCache = modelCache;
    } catch { /* ignore */ }
    const pipe = await pipeline("feature-extraction", target, { progress_callback: onProgress });
    embedder = async (texts: string[]) => {
      const out = await pipe(texts, { pooling: "mean", normalize: true });
      return out.tolist() as number[][];
    };
    loadedId = target;
  })();
  try { await loading; } finally { loading = null; }
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (!embedder) throw new Error("Model not loaded");
  return embedder(texts);
}

/** Cosine similarity of two normalized vectors (== dot product). */
export function cosine(a: number[], b: number[]): number {
  let d = 0;
  for (let i = 0; i < a.length && i < b.length; i++) d += a[i] * b[i];
  return d;
}
