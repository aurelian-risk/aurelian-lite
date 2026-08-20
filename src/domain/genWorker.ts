// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Generative-inference Web Worker. Loading a small LLM and generating text is
// heavy and, on the WASM/CPU path, fully blocks its thread — so it runs here,
// off the main thread, and streams progress + tokens back via postMessage. This
// keeps the UI responsive (spinner, live token count) and lets long runs finish.
//
// Loaded from a CDN at runtime so the offline single-file build stays small.
import { genFileCache } from "./genFileCache";

const CDN_WEBLLM = "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm/+esm";
const CDN_TFJS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3";
const hasWebGPU = () => typeof navigator !== "undefined" && "gpu" in navigator;
async function webgpuReady(): Promise<boolean> {
  try { return !!(await (navigator as any).gpu?.requestAdapter?.()); } catch { return false; }
}
const post = (m: unknown) => (self as unknown as Worker).postMessage(m);

// Surface the REAL cause instead of an opaque "worker crashed": errors and
// unhandled promise rejections that escape the message handler are reported.
self.addEventListener("error", (ev: any) => {
  try { post({ type: "error", error: `worker error: ${ev?.error?.message || ev?.message || "unknown"}${ev?.filename ? ` @ ${ev.filename}:${ev.lineno}` : ""}` }); } catch { /* ignore */ }
});
self.addEventListener("unhandledrejection", (ev: any) => {
  try { post({ type: "error", error: `worker rejection: ${ev?.reason?.message || String(ev?.reason ?? "unknown")}` }); } catch { /* ignore */ }
});

let genId: string | null = null;
let run: ((messages: any[], maxTokens: number, onToken: (t: string) => void, prime: string, schema?: string) => Promise<string>) | null = null;
let webllmEngine: any = null;   // for interruptGenerate()
let stopper: any = null;        // Transformers.js InterruptableStoppingCriteria

async function load(model: { id: string; backend: string }): Promise<void> {
  if (run && genId === model.id) return;
  run = null; genId = null; webllmEngine = null;
  if (model.backend === "webllm") {
    if (!hasWebGPU()) throw new Error("This model needs WebGPU.");
    post({ type: "progress", progress: 0, status: "Checking WebGPU adapter …" });
    if (!(await webgpuReady())) throw new Error("No usable WebGPU adapter found — your GPU/driver doesn't expose WebGPU here. Use SmolLM2 (WASM) or a WebGPU-capable browser.");
    post({ type: "progress", progress: 0, status: "Loading WebLLM runtime …" });
    const webllm: any = await import(/* @vite-ignore */ CDN_WEBLLM);
    post({ type: "progress", progress: 0, status: "Initialising engine — downloading model on first use …" });
    // IndexedDB is far more robust than the Cache API for large models (the Cache
    // API's writes fail with an opaque "network error" under disk pressure). This
    // WebLLM version reads `cacheBackend` (not `useIndexedDBCache`); set both for
    // cross-version safety.
    const appConfig = { ...webllm.prebuiltAppConfig, cacheBackend: "indexeddb", useIndexedDBCache: true };
    const engine = await webllm.CreateMLCEngine(model.id, { appConfig, initProgressCallback: (r: any) => post({ type: "progress", progress: r.progress, status: r.text }) });
    webllmEngine = engine;
    run = async (messages, maxTokens, onToken, _prime, schema) => {
      // Grammar-constrained JSON: with a schema the model can ONLY emit valid keys
      // and structure — the reliable path for small models.
      const response_format = schema ? { type: "json_object", schema } : { type: "json_object" };
      const stream = await engine.chat.completions.create({ messages, temperature: 0, max_tokens: maxTokens, frequency_penalty: 0.6, presence_penalty: 0.3, stream: true, response_format });
      let full = "";
      for await (const chunk of stream) { const t = chunk.choices?.[0]?.delta?.content || ""; if (t) { full += t; onToken(t); } }
      return full;
    };
  } else {
    post({ type: "progress", progress: 0, status: "Loading Transformers.js runtime …" });
    const mod: any = await import(/* @vite-ignore */ CDN_TFJS);
    try { mod.env.allowLocalModels = false; mod.env.useBrowserCache = false; mod.env.useCustomCache = true; mod.env.customCache = genFileCache; } catch { /* ignore */ }
    // Prefer WebGPU when the browser exposes it (this is the path that works;
    // probing requestAdapter() inside the worker wrongly returned false and forced
    // a WASM path that crashed on some devices). ONNX will fall back internally.
    const device = hasWebGPU() ? "webgpu" : "wasm";
    // "q4" is the widely-compatible quantisation (q4f16 needs WebGPU shader-f16,
    // which many adapters lack and then the ONNX session crashes).
    post({ type: "progress", progress: 0, status: `Preparing model on ${device} (q4) — this can take a while …` });
    const pipe = await mod.pipeline("text-generation", model.id, {
      dtype: "q4", device,
      progress_callback: (p: any) => post({ type: "progress", progress: typeof p.progress === "number" ? p.progress / 100 : undefined, file: p.file, status: p.status }),
    });
    post({ type: "progress", progress: 1, status: "Model ready — finishing up …" });
    const TextStreamer = mod.TextStreamer;
    run = async (messages, maxTokens, onToken, prime) => {
      const streamer = new TextStreamer(pipe.tokenizer, { skip_prompt: true, skip_special_tokens: true, callback_function: (t: string) => onToken(t) });
      stopper = mod.InterruptableStoppingCriteria ? new mod.InterruptableStoppingCriteria() : null;
      // Penalise repetition so small models don't loop (e.g. echo the schema).
      const opts: any = { max_new_tokens: maxTokens, do_sample: false, repetition_penalty: 1.3, no_repeat_ngram_size: 3, streamer, return_full_text: false };
      if (stopper) opts.stopping_criteria = stopper;
      // Prime the assistant turn with the start of the JSON so a weak model
      // continues structured output instead of echoing the prompt.
      const templated = pipe.tokenizer.apply_chat_template(messages, { tokenize: false, add_generation_prompt: true });
      const out = await pipe(templated + prime, opts);
      stopper = null;
      const gen = Array.isArray(out) ? out[0]?.generated_text : out?.generated_text;
      return prime + String(typeof gen === "string" ? gen : "");
    };
  }
  genId = model.id;
}

// Retry the load on transient download errors — WebLLM caches each shard, so a
// re-attempt resumes from the cache and eventually completes over a flaky link.
async function loadRetry(model: { id: string; backend: string }): Promise<void> {
  let lastErr: any;
  for (let i = 0; i < 12; i++) {
    try { await load(model); return; }
    catch (e: any) {
      lastErr = e; const msg = String(e?.message ?? e);
      if (/webgpu|adapter|not\s*support|invalid|unknown model/i.test(msg)) throw e; // permanent
      post({ type: "progress", status: `download interrupted (${msg}); retrying ${i + 1}/11 — resumes from cache …` });
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
  throw lastErr;
}

self.onmessage = async (e: MessageEvent) => {
  const d = e.data;
  if (d.type === "cancel") { try { webllmEngine?.interruptGenerate?.(); } catch { /* ignore */ } try { stopper?.interrupt?.(); } catch { /* ignore */ } return; }
  try {
    if (d.type === "load") { await loadRetry(d.model); post({ type: "loaded", modelId: d.model.id }); }
    else if (d.type === "generate") {
      if (!run) throw new Error("No model loaded");
      const text = await run(d.messages, d.maxTokens ?? 512, (t) => post({ type: "token", id: d.id, text: t }), d.prime ?? "", d.schema);
      post({ type: "result", id: d.id, text });
    }
  } catch (err) {
    post({ type: "error", id: d.id, error: err instanceof Error ? err.message : String(err) });
  }
};
