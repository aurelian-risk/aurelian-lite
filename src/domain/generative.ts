// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Generative extraction — the two "smart" tiers that actually read narrative
// prose and emit structured entities (what embeddings cannot do). Both back-ends
// are loaded from a CDN at RUNTIME so the offline single-file build stays small.
//
//  • WebLLM + Qwen2.5-0.5B-Instruct  — WebGPU, best small model for JSON.
//  • Transformers.js + SmolLM2-360M  — WASM or WebGPU, runs without a GPU.
//
// The prompt is built entirely from the taxonomy passed in → fully schema- and
// entity-neutral, no hard-coded types or examples.
import type { EntityTypeDef, FieldValue, Taxonomy } from "./types";
import type { TypeCandidates, Candidate } from "./extraction";
import { getUserModels } from "./modelRegistry";
import { scaleMax, typeLabel, typeLabelPlural } from "./taxonomy";

type Progress = { status?: string; text?: string; progress?: number; file?: string; tokens?: number; chunk?: number; chunks?: number };
export type GenBackend = "webllm" | "transformers" | "endpoint";

export interface GenModel { id: string; label: string; size: string; note: string; backend: GenBackend; needsWebGPU: boolean;
  /** endpoint backend only: where the model answers. */ endpoint?: string }
// Curated: WebLLM-Qwen (grammar-constrained JSON, the reliable path) in three
// sizes, plus one no-WebGPU fallback. Any other model can be added via the hub.
export const GEN_MODELS: GenModel[] = [
  { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", label: "Qwen2.5-1.5B", size: "~1.1 GB", note: "WebGPU · balanced (recommended)", backend: "webllm", needsWebGPU: true },
  { id: "Qwen2.5-3B-Instruct-q4f16_1-MLC", label: "Qwen2.5-3B", size: "~2.2 GB", note: "WebGPU · best quality", backend: "webllm", needsWebGPU: true },
  { id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", label: "Qwen2.5-0.5B", size: "~0.4 GB", note: "WebGPU · fastest / low VRAM", backend: "webllm", needsWebGPU: true },
  { id: "HuggingFaceTB/SmolLM2-360M-Instruct", label: "SmolLM2-360M", size: "~250 MB", note: "no WebGPU needed · basic quality", backend: "transformers", needsWebGPU: false },
];
export const hasWebGPU = (): boolean => typeof navigator !== "undefined" && "gpu" in navigator;
// Prefer the balanced WebLLM model on WebGPU; the WASM fallback otherwise.
export const defaultGenModel = (): GenModel => (hasWebGPU() ? GEN_MODELS[0] : GEN_MODELS[GEN_MODELS.length - 1]);

/** Built-in generative models + user-added ones from the registry. */
export function genModelList(): GenModel[] {
  return [...endpointModels, ...GEN_MODELS, ...getUserModels().filter((m) => m.kind === "gen").map((m) => ({
    id: m.id, label: m.label, size: m.size ?? "custom", note: m.note ?? "user-added",
    backend: m.backend, needsWebGPU: m.backend === "webllm" ? true : !!m.needsWebGPU,
  }))];
}

// ── A model that answers on this machine, outside the browser ────────────────────
// The third way to run one: not in the tab, but as a process next to it, reached over
// http. It is the only way to a model larger than a browser tab can hold, and it is the
// safer one - a process can be stopped without taking the browser with it.
//
// The default address is wherever this page came from. That is not a guess: llama-server
// serves static files with --path, so the page and the model answer on ONE address, which
// is what the launcher script sets up. Anything else is entered by hand.
const LS_ENDPOINT = "ebios_offline_gen_endpoint";
const sameOrigin = (): string =>
  typeof location !== "undefined" && /^https?:/.test(location.protocol) ? location.origin : "http://127.0.0.1:8127";
export function getEndpoint(): string {
  try { return localStorage.getItem(LS_ENDPOINT) || sameOrigin(); } catch { return sameOrigin(); }
}
export function setEndpoint(url: string): void {
  try { url.trim() ? localStorage.setItem(LS_ENDPOINT, url.trim().replace(/\/+$/, "")) : localStorage.removeItem(LS_ENDPOINT); } catch { /* ignore */ }
}

/** Worth asking at all? A page opened from a file has no origin a server would accept,
 *  so the request is refused before it is sent - and the only thing it would achieve is
 *  an error in the console on every visit. Served over http, asking makes sense: it is
 *  how the page got here. */
export const canReachEndpoint = (): boolean =>
  typeof location !== "undefined" && /^https?:/.test(location.protocol);

let endpointModels: GenModel[] = [];
export const endpointModelsFound = (): GenModel[] => endpointModels;

/** Ask an OpenAI-shaped server what it serves. Never throws: no server is the normal
 *  case, not an error, and the answer has to come back quickly enough to be asked on
 *  every visit to the model section. */
export async function probeEndpoint(base = getEndpoint()): Promise<GenModel[]> {
  const where = base.replace(/^https?:\/\//, "");
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 1500);
    const r = await fetch(`${base}/v1/models`, { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(String(r.status));
    const data = (await r.json())?.data;
    endpointModels = (Array.isArray(data) ? data : []).map((m: { id?: string }) => {
      const id = String(m?.id ?? "");
      return {
        id, backend: "endpoint" as GenBackend, needsWebGPU: false, endpoint: base,
        label: id.replace(/\.gguf$/i, "").split(/[\\/]/).pop()!.slice(0, 44) || id,
        size: "on the server", note: `runs outside the browser · ${where}`,
      };
    }).filter((m) => m.id);
  } catch {
    endpointModels = [];
  }
  return endpointModels;
}

const LS_GEN = "ebios_offline_gen_model";
export const GEN_MAX_TOKENS = 640;

export function getGenModelId(): string {
  try { const v = localStorage.getItem(LS_GEN); if (v && genModelList().some((m) => m.id === v)) return v; } catch { /* ignore */ }
  return defaultGenModel().id;
}
export function setGenModelId(id: string): void { try { localStorage.setItem(LS_GEN, id); } catch { /* ignore */ } }
export const genModelById = (id: string): GenModel => genModelList().find((m) => m.id === id) ?? defaultGenModel();

// The heavy work runs in an inlined Web Worker so the UI thread never freezes.
// This module is just the main-thread proxy that owns the worker + promises.
let genId: string | null = null;
let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (t: string) => void; reject: (e: Error) => void; onToken?: (t: string) => void }>();
let loadWaiter: { resolve: () => void; reject: (e: Error) => void; onProgress?: (p: Progress) => void } | null = null;

async function ensureWorker(): Promise<Worker> {
  if (worker) return worker;
  const { default: GenWorker } = await import("./genWorker?worker&inline");
  worker = new GenWorker();
  worker.onmessage = (e: MessageEvent) => {
    const d = e.data;
    if (d.type === "progress") loadWaiter?.onProgress?.({ status: d.status, file: d.file, progress: clamp01(d.progress) });
    else if (d.type === "loaded") { loadWaiter?.resolve(); loadWaiter = null; }
    else if (d.type === "token") pending.get(d.id)?.onToken?.(d.text);
    else if (d.type === "result") { pending.get(d.id)?.resolve(d.text); pending.delete(d.id); }
    else if (d.type === "error") {
      const err = new Error(d.error || "worker error");
      if (d.id != null && pending.has(d.id)) { pending.get(d.id)!.reject(err); pending.delete(d.id); }
      else if (loadWaiter) { loadWaiter.reject(err); loadWaiter = null; }
    }
  };
  worker.onerror = (e) => {
    // Defer so the worker's own error/rejection listener (which carries the real
    // message) can post details first; only fall back to a generic message.
    const raw = e?.message || "";
    setTimeout(() => {
      if (!loadWaiter && pending.size === 0) return; // already handled with details
      const err = new Error(raw ? `worker crashed: ${raw}` : "worker crashed — check the browser console (F12) for the underlying error");
      try { worker?.terminate(); } catch { /* ignore */ }
      worker = null; genId = null;
      if (loadWaiter) { loadWaiter.reject(err); loadWaiter = null; }
      pending.forEach((p) => p.reject(err)); pending.clear();
    }, 60);
  };
  return worker;
}

export async function loadGenModel(model: GenModel, onProgress?: (p: Progress) => void): Promise<void> {
  if (genId === model.id) return;
  if (model.needsWebGPU && !hasWebGPU()) throw new Error("This model needs WebGPU — pick the SmolLM2 (WASM) model, or use a browser with WebGPU.");
  const w = await ensureWorker();
  await new Promise<void>((resolve, reject) => { loadWaiter = { resolve, reject, onProgress }; w.postMessage({ type: "load", model: { id: model.id, backend: model.backend, endpoint: model.endpoint } }); });
  genId = model.id;
}

/** Generate text from chat messages, streaming tokens to onToken. `prime`
 *  prefills the assistant turn; `schema` (JSON-schema string) constrains the
 *  output on backends that support grammar-based decoding (WebLLM) so even small
 *  models cannot emit invalid keys or malformed JSON. */
export async function generate(messages: { role: string; content: string }[], onToken?: (t: string) => void, prime = "", schema?: string): Promise<string> {
  const w = await ensureWorker();
  const id = ++seq;
  return new Promise<string>((resolve, reject) => { pending.set(id, { resolve, reject, onToken }); w.postMessage({ type: "generate", id, messages, maxTokens: GEN_MAX_TOKENS, prime, schema }); });
}

/** Ask the worker to stop the current generation (keeps whatever it produced). */
export function cancelGeneration(): void { worker?.postMessage({ type: "cancel" }); }

const clamp01 = (n: unknown): number => { const x = Number(n); return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0; };

export const isGenLoaded = (modelId: string): boolean => genId === modelId;
export const loadedGenId = (): string | null => genId;

// A compact, taxonomy-derived description of the target schema.
function schemaPrompt(tax: Taxonomy): string {
  const line = (t: EntityTypeDef) => {
    const fields = t.fields
      .filter((f) => f.type !== "ref" && f.type !== "multiref")
      .map((f) => (f.type === "enum" && f.options?.length ? `${f.key} (one of: ${f.options.join(", ")})` : f.key))
      .join(", ");
    return `- "${t.key}" (${typeLabel(t)}): fields ${fields || "name, description"}`;
  };
  return tax.entityTypes.map(line).join("\n");
}

const nkey = (s: unknown): string => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "");

// Small models name the type field in many ways — accept them all.
const TYPE_ALIASES = ["type", "entityType", "entity_type", "entitytype", "kind", "entity", "category"];
const typeOf = (o: any): unknown => { for (const k of TYPE_ALIASES) if (o?.[k] != null && o[k] !== "") return o[k]; return undefined; };
const asObj = (o: any) => { const values = { ...o }; for (const k of TYPE_ALIASES) delete values[k]; return { type: String(typeOf(o)), values }; };

// Robust parse: try the whole JSON; if that fails (small models emit prose,
// markdown fences, or truncated output), salvage every complete flat {…} object
// that carries a type — so partial / cut-off / oddly-shaped runs still yield entities.
function parseEntities(raw: string): { type: string; values: Record<string, unknown> }[] {
  const txt = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "")
    .replace(/\\(?!["\\/bfnrtu])/g, "") // strip markdown backslash-escapes (\_ \* …) that break JSON.parse
    .trim();
  const s = txt.indexOf("{"), e = txt.lastIndexOf("}");
  if (s >= 0 && e > s) {
    try {
      const data = JSON.parse(txt.slice(s, e + 1));
      const arr = Array.isArray(data) ? data : Array.isArray(data.entities) ? data.entities : [data];
      const ok = arr.filter((o: any) => o && typeof o === "object" && typeOf(o) != null);
      if (ok.length) return ok.map(asObj);
    } catch { /* fall through to salvage */ }
  }
  const out: { type: string; values: Record<string, unknown> }[] = [];
  for (const chunk of txt.match(/\{[^{}]*\}/g) ?? []) {
    try { const o = JSON.parse(chunk); if (o && typeof o === "object" && typeOf(o) != null) out.push(asObj(o)); } catch { /* skip */ }
  }
  return out;
}

/** Generative extraction: prompt the local LLM to emit entities as JSON, then
 *  validate every field/key against the taxonomy (drops anything invented).
 *  Runs in a worker; onToken streams the raw output as it is produced. */
// Split into chunks on paragraph boundaries so a long document is extracted
// section-by-section (small models under-extract from one big blob → poor coverage).
function chunkText(text: string, size = 1600): string[] {
  const paras = text.split(/\r?\n\s*\r?\n/).map((s) => s.trim()).filter(Boolean);
  const chunks: string[] = []; let cur = "";
  for (const p of paras) {
    if (cur && cur.length + p.length + 2 > size) { chunks.push(cur); cur = ""; }
    cur += (cur ? "\n\n" : "") + p;
  }
  if (cur) chunks.push(cur);
  return chunks.length ? chunks : [text];
}

export async function extractByLLM(tax: Taxonomy, text: string, model: GenModel, onProgress?: (p: Progress) => void): Promise<TypeCandidates[]> {
  await loadGenModel(model, onProgress);

  // Domain framing AND the example are taken from the taxonomy itself — never
  // hard-coded — so the prompt stays schema-agnostic for any taxonomy.
  const schemaName = tax.name || "the given schema";
  const exKey = tax.entityTypes[0]?.key ?? "type_key";
  const example = `{"entities":[{"type":"${exKey}","name":"…","description":"…"}]}`;
  const keys = tax.entityTypes.map((t) => `"${t.key}"`).join(", ");
  const buildMessages = (doc: string) => [
    { role: "system", content: "You extract entities from a document and output ONLY JSON — no prose, no code fences. Use the exact lowercase type keys given." },
    { role: "user", content:
      `Schema "${schemaName}"${tax.description ? ` — ${tax.description}` : ""}.\n\n` +
      `Allowed type keys: ${keys}.\nEach type and its fields:\n${schemaPrompt(tax)}\n\n` +
      `Read the DOCUMENT and list ALL the distinct entities it describes — assets, events, sources, stakeholders, scenarios, measures. ` +
      `One entry per real thing; never list the same entity twice or under two different types. For each entity output an object with:\n` +
      `- "type": exactly one of the allowed type keys above (lowercase),\n` +
      `- "name": a short name copied from the text,\n- "description": one sentence,\n- optionally any of that type's listed fields.\n\n` +
      `Output ONLY this exact JSON shape and nothing else:\n${example}\n\nDOCUMENT:\n${doc}` },
  ];
  // JSON schema constrains grammar-capable backends (WebLLM) to valid keys/structure.
  const schema = JSON.stringify({
    type: "object",
    properties: { entities: { type: "array", items: {
      type: "object",
      properties: { type: { type: "string", enum: tax.entityTypes.map((t) => t.key) }, name: { type: "string" }, description: { type: "string" } },
      required: ["type", "name"],
    } } },
    required: ["entities"],
  });

  // Extract each chunk, collect all raw entities.
  const chunks = chunkText(text);
  const prime = `{"entities": [`;
  const rawEnts: { type: string; values: Record<string, unknown> }[] = [];
  for (let i = 0; i < chunks.length; i++) {
    let tokens = 0, acc = "";
    const raw = await generate(buildMessages(chunks[i]), (t) => { tokens++; acc += t; onProgress?.({ status: "generating", tokens, text: acc, chunk: i + 1, chunks: chunks.length }); }, prime, schema);
    for (const e of parseEntities(raw)) rawEnts.push(e);
  }

  // Tolerant matching (type/field KEY or LABEL) + dedupe across chunks by name.
  const byType = new Map<string, typeof tax.entityTypes[number]>();
  for (const t of tax.entityTypes) { byType.set(nkey(t.key), t); byType.set(nkey(typeLabel(t)), t); byType.set(nkey(typeLabelPlural(t)), t); }
  const fieldVal = (values: Record<string, unknown>, f: { key: string; label: string }) => { for (const k of Object.keys(values)) if (nkey(k) === nkey(f.key) || nkey(k) === nkey(f.label)) return values[k]; };
  const pick = (values: Record<string, unknown>, ...names: string[]) => { for (const n of names) for (const k of Object.keys(values)) if (nkey(k) === nkey(n)) return values[k]; };

  const out = new Map<string, Candidate[]>();
  const seen = new Set<string>();
  for (const ent of rawEnts) {
    let t = byType.get(nkey(ent.type));
    if (!t) { const m = /^\s*(\d+)\s*$/.exec(String(ent.type)); if (m) t = tax.entityTypes[+m[1] - 1]; } // numeric type → key
    if (!t) continue;
    const titleKey = t.titleField ?? "name";
    const name = String(pick(ent.values, titleKey, "name", "title", "label", "value", "valueName", "entity", "text") ?? "").trim();
    // Drop empty names and echoes of the example placeholder.
    if (!name || name === "…" || /short name|one sentence|from the text|copied from/i.test(name)) continue;
    const dedup = t.key + "|" + nkey(name);
    if (seen.has(dedup)) continue; seen.add(dedup);
    const values: Record<string, FieldValue> = {}; values[titleKey] = name;
    for (const f of t.fields) {
      if (f.type === "ref" || f.type === "multiref") continue;
      const v = fieldVal(ent.values, f);
      if (v == null || v === "") continue;
      if (f.type === "enum" && f.options?.length) { const m = f.options.find((o) => nkey(o) === nkey(v)); if (m) values[f.key] = m; }
      else if (f.type === "number") { const n = Number(v); if (!Number.isNaN(n)) values[f.key] = n; }
      // A scale is stored as a NUMBER everywhere else - the sample study, the matrix, the
      // quantification - and a field input handed a string falls back to 1 without saying
      // so. A model answers "3" as often as 3, and off the end of the scale as often as on
      // it, so both are handled here rather than discovered in a chart later.
      else if (f.type === "scale") {
        const n = Math.round(Number(v));
        if (Number.isFinite(n)) values[f.key] = Math.min(Math.max(n, 1), scaleMax(f));
      }
      else if (f.type === "boolean") values[f.key] = Boolean(v);
      else values[f.key] = String(v);
    }
    const desc = t.fields.find((f) => f.type === "textarea");
    const descV = pick(ent.values, "description", "desc", "summary");
    if (desc && !values[desc.key] && descV) values[desc.key] = String(descV);
    const arr = out.get(t.key) ?? [];
    arr.push({ name, snippet: String(values[desc?.key ?? ""] ?? name), score: 1, typeKey: t.key, values });
    out.set(t.key, arr);
  }
  return tax.entityTypes
    .map((t) => ({ typeKey: t.key, label: typeLabelPlural(t), candidates: out.get(t.key) ?? [] }))
    .filter((tc) => tc.candidates.length > 0);
}
