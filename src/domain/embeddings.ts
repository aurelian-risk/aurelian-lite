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
