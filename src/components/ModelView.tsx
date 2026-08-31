// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Model configuration section: pick the local embedding model, download/load it,
// see the load + cache state, and clear the cached model. The model powers the
// document extraction and runs entirely in the browser.
import { useEffect, useRef, useState } from "react";
import { Sentence } from "./Sentence";
import { t as tr } from "../domain/i18n";
import { embedModelList, getModelId, isLoaded, loadEmbedder, loadedModelId, setModelId } from "../domain/embeddings";
import { MODEL_FILE, clearModelCache, exportModelPack, importModelPack, isModelCached, tryLoadLocalPack } from "../domain/modelCache";
import { LLM, gen, genNow, genFiles, genFilesNow } from "../domain/gen";
import { addUserModel, removeUserModel, isUserModel } from "../domain/modelRegistry";
import { Icon } from "./ui";

function AddModel({ kind, onAdd }: { kind: "embed" | "gen"; onAdd: () => void }) {
  const [open, setOpen] = useState(false);
  const [backend, setBackend] = useState<"transformers" | "webllm">("transformers");
  const [id, setId] = useState(""); const [label, setLabel] = useState(""); const [size, setSize] = useState(""); const [note, setNote] = useState("");
  const submit = () => {
    if (!id.trim()) return;
    addUserModel({ kind, backend: kind === "embed" ? "transformers" : backend, id: id.trim(), label: label.trim() || id.trim(), size: size.trim() || undefined, note: note.trim() || undefined });
    setId(""); setLabel(""); setSize(""); setNote(""); setOpen(false); onAdd();
  };
  if (!open) return <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => setOpen(true)}><Icon.plus /> {tr('ui.model.add-model', 'Add model…')}</button>;
  return (
    <div className="add-model">
      {LLM && kind === "gen" && (
        <div className="seg" style={{ padding: 0, marginBottom: 8 }}>
          {(["transformers", "webllm"] as const).map((b) => (
            <button key={b} className={"seg-btn" + (backend === b ? " on" : "")} onClick={() => setBackend(b)}>{b === "webllm" ? "WebLLM · MLC id" : "Transformers.js · HF id"}</button>
          ))}
        </div>
      )}
      <div className="row">
        <div className="field" style={{ marginBottom: 0, flex: 2 }}><label>Model id{LLM && kind === "gen" && backend === "webllm" ? " (MLC model_id)" : " (Hugging Face repo)"}</label>
          <input value={id} onChange={(e) => setId(e.target.value)} placeholder={LLM && kind === "gen" ? (backend === "webllm" ? "e.g. Qwen2.5-1.5B-Instruct-q4f16_1-MLC" : "e.g. onnx-community/Llama-3.2-1B-Instruct") : "e.g. Xenova/multilingual-e5-small"} /></div>
        <div className="field" style={{ marginBottom: 0, flex: 1 }}><label>{tr('ui.model.label', 'Label')}</label><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="optional" /></div>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <div className="field" style={{ marginBottom: 0 }}><label>{tr('ui.model.size', 'Size')}</label><input value={size} onChange={(e) => setSize(e.target.value)} placeholder="e.g. ~120 MB" /></div>
        <div className="field" style={{ marginBottom: 0 }}><label>{tr('ui.model.note', 'Note')}</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" /></div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="btn primary sm" disabled={!id.trim()} onClick={submit}><Icon.plus /> {tr('ui.model.add', 'Add')}</button>
        <button className="btn ghost sm" onClick={() => setOpen(false)}>{tr('ui.model.cancel', 'Cancel')}</button>
      </div>
    </div>
  );
}

export function ModelView() {
  const [, setReg] = useState(0);
  const bump = () => setReg((r) => r + 1);
  const [selected, setSelected] = useState(getModelId());
  const [ready, setReady] = useState(isLoaded());
  const [cached, setCached] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // The generative branch is present only where this build has it at all; until the
  // module has resolved there is nothing to show and nothing to read from it. Declared
  // up here because the endpoint lookup below already depends on it.
  const [G, setG] = useState(genNow());
  const [GF, setGF] = useState(genFilesNow());
  useEffect(() => {
    let live = true;
    gen().then((m) => { if (live && m) { setG(m); setGenSel(m.getGenModelId()); setGenReady(m.isGenLoaded(m.getGenModelId())); } });
    genFiles().then((m) => { if (live && m) setGF(m); });
    return () => { live = false; };
  }, []);
  const [endpoint, setEndpointField] = useState("");
  const [probing, setProbing] = useState(false);

  useEffect(() => { isModelCached().then(setCached); }, [status]);
  // A model may already be running next to the browser. Ask once on arrival; no answer
  // is the ordinary case, so it fails quietly and simply offers nothing.
  useEffect(() => {
    if (!G) return;
    setEndpointField(G.getEndpoint());
    if (!G.canReachEndpoint()) return;
    let live = true;
    setProbing(true);
    G.probeEndpoint().then(() => { if (live) { setProbing(false); bump(); } });
    return () => { live = false; };
  }, [G]);
  // Best-effort auto-detect: if a model file sits next to the HTML and the
  // browser allows reading it, load it automatically — no click needed.
  useEffect(() => {
    if (isLoaded()) return;
    (async () => {
      if (await isModelCached()) return;
      const r = await tryLoadLocalPack();
      if (!r) return;
      if (r.modelId) { setModelId(r.modelId); setSelected(r.modelId); }
      setStatus(`Detected ${MODEL_FILE} in this folder — activating …`);
      try { await loadEmbedder(); setReady(true); setStatus(`Model ready — auto-loaded from ${MODEL_FILE}.`); }
      catch (e) { setStatus("Auto-load failed: " + (e instanceof Error ? e.message : String(e))); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (id: string) => { setModelId(id); setSelected(id); setReady(isLoaded()); };
  const loadProgress = (p: { status?: string; file?: string; progress?: number }, verb: string) =>
    setStatus(p.status === "progress" && p.file ? `${verb} ${p.file} — ${Math.round(p.progress ?? 0)}%` : String(p.status ?? verb));

  // Save-as: open the browser's save dialog for the packed model file. The user
  // saves it next to the HTML; where allowed it is then reused with no download.
  const fileName = (label: string) => `aurelian-${label.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-|-$/g, "") || "model"}.bin`;
  const doSave = async () => {
    const blob = await exportModelPack(getModelId());
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = fileName(embedModelList().find((m) => m.id === getModelId())?.label ?? "model");
    a.click(); URL.revokeObjectURL(url);
  };
  const saveFile = async () => {
    setBusy(true); setStatus("Opening save dialog …");
    try { await doSave(); setStatus(`Save ${MODEL_FILE} next to the HTML. It is reused next time (no download) where the browser allows local reads; otherwise use “Use model file”.`); }
    catch (e) { setStatus("Could not save: " + (e instanceof Error ? e.message : String(e))); }
    setBusy(false);
  };

  // Use an existing model file the user picks — works everywhere (incl. Chrome
  // file://), because a file the user selects is readable.
  const useFile = async (file: File) => {
    setBusy(true); setStatus("Reading the selected model file …");
    try {
      const { modelId, count } = await importModelPack(file);
      if (modelId) { setModelId(modelId); setSelected(modelId); }
      setStatus(`Restored ${count} files — activating …`);
      await loadEmbedder((p) => loadProgress(p, "Loading"));
      setReady(true); setCached(true); setStatus("Model ready — used the selected file, no download.");
    } catch (e) { setStatus("Not a usable model file: " + (e instanceof Error ? e.message : String(e))); }
    setBusy(false);
  };

  // Fresh download, then immediately offer to save it as a file next to the app.
  const download = async () => {
    setBusy(true);
    try {
      let reused = isLoaded() || (await isModelCached());
      if (!reused) { const r = await tryLoadLocalPack(); if (r) { reused = true; if (r.modelId) { setModelId(r.modelId); setSelected(r.modelId); } } }
      setStatus(reused ? "Loading (reusing local copy — no download) …" : "Downloading model … (first time, ~25 MB, needs internet)");
      await loadEmbedder((p) => loadProgress(p, reused ? "Loading" : "Downloading"));
      setReady(true); setCached(true);
      setStatus(reused ? "Model ready — reused local copy, no download."
        : `Model ready. Tip: click “Save file” to keep ${MODEL_FILE} next to the app and skip the download next time.`);
    } catch (e) {
      setStatus("Failed: " + (e instanceof Error ? e.message : String(e)) + " — needs internet on first download; on file:// try http://localhost.");
    }
    setBusy(false);
  };
  const clear = async () => {
    if (!confirm("Delete the cached model files from this browser?")) return;
    await clearModelCache(); setCached(false); setStatus("Cache cleared.");
  };

  // ── Generative (language) model management ──
  const [genSel, setGenSel] = useState("");
  const [genReady, setGenReady] = useState(false);
  const [genStatus, setGenStatus] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const [genPct, setGenPct] = useState(0);
  const [genCached, setGenCached] = useState(false);
  const genFileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { GF?.isGenFilesCached().then(setGenCached); }, [genStatus, GF]);
  // Only the Transformers.js backend routes its files through our cache → only it
  // can be saved to / loaded from a file. WebLLM manages its own cache.
  const genFileCapable = LLM && !!G && G.genModelById(genSel).backend === "transformers";

  const pickGen = (id: string) => { G?.setGenModelId(id); setGenSel(id); setGenReady(!!G?.isGenLoaded(id)); };
  // WebLLM reports progress as descriptive text (shard download), Transformers.js
  // as a file + percent — show both a percentage bar and whatever detail exists.
  const genProgress = (m: string) => (p: { progress?: number; file?: string; status?: string }) => {
    const pct = Math.min(100, Math.round((p.progress ?? 0) * 100));
    setGenPct(pct);
    const detail = p.file || (p.status && p.status !== "progress" ? String(p.status) : "");
    setGenStatus(`${m} — ${pct}%${detail ? " · " + detail.slice(0, 70) : ""}`);
  };
  const loadGen = async () => {
    if (!G) return;
    const m = G.genModelById(genSel);
    if (m.needsWebGPU && !G.hasWebGPU()) { setGenStatus("This model needs WebGPU (not available in this browser) — pick SmolLM2 (WASM)."); return; }
    setGenBusy(true); setGenPct(0); setGenStatus(`Loading ${m.label} …`);
    try {
      await G.loadGenModel(m, genProgress(`Loading ${m.label}`));
      setGenReady(true); setGenCached(true);
      setGenStatus(m.backend === "endpoint"
        ? `${m.label} ready — served on this machine, outside the browser.`
        : `${m.label} ready — runs in your browser.`);
    } catch (e) { setGenStatus("Failed: " + (e instanceof Error ? e.message : String(e))); }
    setGenBusy(false);
  };
  const saveGenFile = async () => {
    setGenBusy(true); setGenStatus("Opening save dialog …");
    try {
      const blob = await GF!.exportGenPack(genSel);
      const url = URL.createObjectURL(blob);
      const fn = fileName(G!.genModelById(genSel).label);
      const a = document.createElement("a"); a.href = url; a.download = fn; a.click(); URL.revokeObjectURL(url);
      setGenStatus(`Save ${fn} next to the HTML, then “Use file…” next time to skip the download.`);
    } catch (e) { setGenStatus("Could not save: " + (e instanceof Error ? e.message : String(e))); }
    setGenBusy(false);
  };
  const useGenFile = async (file: File) => {
    setGenBusy(true); setGenStatus("Reading the selected language-model file …");
    try {
      const { modelId, count } = await GF!.importGenPack(file);
      if (modelId && G!.genModelList().some((m) => m.id === modelId)) { G!.setGenModelId(modelId); setGenSel(modelId); }
      setGenStatus(`Restored ${count} files — activating …`);
      await G!.loadGenModel(G!.genModelById(modelId && G!.genModelList().some((m) => m.id === modelId) ? modelId : genSel), genProgress("Loading"));
      setGenReady(true); setGenCached(true); setGenStatus("Language model ready — used the selected file, no download.");
    } catch (e) { setGenStatus("Not a usable language-model file: " + (e instanceof Error ? e.message : String(e))); }
    setGenBusy(false);
  };

  const embState = ready ? "Loaded" : cached ? "Downloaded · not loaded" : "Not downloaded";
  const genState = genReady ? "Loaded" : "Not loaded";
  const stateColor = (s: string) => s === "Loaded" ? "var(--color-state-success)" : /not loaded|Downloaded/.test(s) && s !== "Not downloaded" ? "var(--color-state-info)" : "var(--fg-subtle)";
  const Badge = ({ s }: { s: string }) => <span className="badge" style={{ background: `color-mix(in oklch, ${stateColor(s)} 22%, transparent)` }}>{s}</span>;

  return (
    <div className="content">
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <div className="eyebrow">{tr('ui.model.ai-offline', 'AI · offline')}</div>
          <h1 className="grad-text">{tr('ui.model.models', 'Models')}</h1>
          <div className="meta" style={{ color: "var(--fg-subtle)" }}>{tr('ui.model.two-independent-engines-load', 'Two independent engines — load either or both. Everything runs locally in your browser.')}</div>
        </div>
      </div>

      {/* ── Fast engine · embeddings ─────────────────────────────────── */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head"><h3>{tr('ui.model.fast-engine-embeddings', 'Fast engine · Embeddings')}</h3><Badge s={embState} /></div>
        <div className="panel-body" style={{ padding: "10px 14px 14px" }}>
          <div className="meta" style={{ color: "var(--fg-subtle)", marginBottom: 10 }}>
            {tr('ui.model.classifies-sentences-into-the', 'Classifies sentences into the taxonomy — best for structured / list-like documents. Small (~25–34 MB).')}
          </div>
          {embedModelList().map((m) => (
            <label key={m.id} className={"model-row" + (selected === m.id ? " on" : "")}>
              <input type="radio" name="model" style={{ width: "auto" }} checked={selected === m.id} onChange={() => pick(m.id)} />
              <span><span className="model-name">{m.label}</span><span className="model-note">{m.note} · {m.size}</span></span>
              {loadedModelId() === m.id && <span className="badge" style={{ marginLeft: "auto" }}>loaded</span>}
              {isUserModel(m.id) && <button className="btn ghost sm danger" style={{ marginLeft: loadedModelId() === m.id ? 6 : "auto" }} title={tr('ui.model.remove-this-model', 'Remove this model')} onClick={(e) => { e.preventDefault(); removeUserModel(m.id); if (selected === m.id) { setModelId(embedModelList()[0].id); setSelected(embedModelList()[0].id); } bump(); }}><Icon.trash /></button>}
            </label>
          ))}
          <AddModel kind="embed" onAdd={bump} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
            <button className="btn primary" disabled={busy} onClick={download}><Icon.download /> {busy ? "Working…" : ready ? "Reload" : "Download & load"}</button>
            <button className="btn" disabled={busy} onClick={() => fileRef.current?.click()} title={tr('ui.model.pick-an-existing-aurelian', 'Pick an existing aurelian-model.bin — reused with no download (works on file:// too)')}><Icon.upload /> {tr('ui.model.use-file', 'Use file…')}</button>
            <button className="btn" disabled={busy || !(cached || ready)} onClick={saveFile} title={cached || ready ? "Save as a file next to the app" : "Load the model first"}><Icon.download /> {tr('ui.model.save-file', 'Save file')}</button>
            <button className="btn ghost danger" disabled={busy} onClick={clear}><Icon.trash /> {tr('ui.model.clear', 'Clear')}</button>
            <input ref={fileRef} type="file" accept=".bin" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) useFile(f); e.target.value = ""; }} />
            {busy && <span className="spinner sm" aria-hidden />}
            {status && <span className="hint">{status}</span>}
          </div>
          <div className="guide" style={{ marginTop: 12, marginBottom: 0 }}>
            <p style={{ margin: "0 0 7px" }}>
              <Sentence k="ui.model.file-why"
                parts={[<span className="mono">{MODEL_FILE}</span>, <span className="mono">file://</span>]}
                en={"The model is kept as a file ({0}) so that a {1} session does not download it again."} />
            </p>
            <ol className="guide-steps">
              <li><Sentence k="ui.model.file-step-1" parts={[<strong>{tr('ui.model.download-amp-load', 'Download &amp; load')}</strong>]}
                en={"{0} — a save dialog opens."} /></li>
              <li>{tr("ui.model.file-step-2", "Save the file beside this HTML file.")}</li>
              <li><Sentence k="ui.model.file-step-3" parts={[<strong>{tr('ui.model.use-file', 'Use file…')}</strong>]}
                en={"Next time choose {0} — nothing is downloaded."} /></li>
            </ol>
            <p style={{ margin: "7px 0 0" }}>
              <Sentence k="ui.model.file-auto" parts={[<span className="mono">http://localhost</span>]}
                en={"Steps 2 and 3 work on Chrome and Edge. On {0}, and in Firefox, the file is found by itself at start."} />
            </p>
          </div>
        </div>
      </div>

      {/* ── Smart engine · language model ────────────────────────────── */}
      {LLM && G && (<div className="panel">
        <div className="panel-head"><h3>{tr('ui.model.smart-engine-language-model', 'Smart engine · Language model')}</h3><Badge s={genState} /></div>
        <div className="panel-body" style={{ padding: "10px 14px 14px" }}>
          <div className="meta" style={{ color: "var(--fg-subtle)", marginBottom: 10 }}>
            {tr('ui.model.reads-free-form-prose', 'Reads free-form prose and emits structured entities — best for narrative documents. Large (~0.25–2.2 GB); WebGPU recommended; runs in a background worker.')}
          </div>
          {/* A model running next to the browser rather than inside it: the only way to
              one larger than a tab can hold, and it stops without taking the browser
              with it. The address is where this page came from, because the launcher
              script has one process serve the page and answer for the model. */}
          <div className="ep-row">
            <span className={"ep-dot" + (G.endpointModelsFound().length ? " on" : "")} />
            <span className="meta">
              {probing ? "Looking for a model server on this machine …"
                : G.endpointModelsFound().length
                  ? `${G.endpointModelsFound().length} model(s) served on this machine — listed below.`
                  : G.canReachEndpoint()
                    ? "No model server answering on this machine. Start one with the launcher script to use a larger model."
                    : "Opened as a file, so a server on this machine cannot be asked. Start the app with the launcher script to use one."}
            </span>
            <input className="ep-addr mono" value={endpoint} spellCheck={false} aria-label={tr('ui.model.server-address', 'Server address')}
              onChange={(e) => setEndpointField(e.target.value)} />
            <button className="btn ghost sm" disabled={probing}
              onClick={() => { G.setEndpoint(endpoint); setProbing(true); G.probeEndpoint().then(() => { setProbing(false); bump(); }); }}>
              {tr('ui.model.look-again', 'Look again')}
            </button>
          </div>
          {G.genModelList().map((m) => {
            const disabled = m.needsWebGPU && !G.hasWebGPU();
            return (
              <label key={m.id} className={"model-row" + (genSel === m.id ? " on" : "")} style={disabled ? { opacity: 0.5 } : undefined}>
                <input type="radio" name="genmodel" style={{ width: "auto" }} checked={genSel === m.id} disabled={disabled} onChange={() => pickGen(m.id)} />
                <span><span className="model-name">{m.label}</span><span className="model-note">{m.note} · {m.size}{disabled ? " · needs WebGPU" : ""}</span></span>
                {G.loadedGenId() === m.id && <span className="badge" style={{ marginLeft: "auto" }}>loaded</span>}
                {isUserModel(m.id) && <button className="btn ghost sm danger" style={{ marginLeft: G.loadedGenId() === m.id ? 6 : "auto" }} title={tr('ui.model.remove-this-model', 'Remove this model')} onClick={(e) => { e.preventDefault(); removeUserModel(m.id); if (genSel === m.id) { const d = G.genModelList()[0].id; G.setGenModelId(d); setGenSel(d); } bump(); }}><Icon.trash /></button>}
              </label>
            );
          })}
          <AddModel kind="gen" onAdd={bump} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
            {/* A model that already runs next to the browser is not downloaded, it is used. */}
            <button className="btn primary" disabled={genBusy} onClick={loadGen}><Icon.download /> {
              genBusy ? "Loading…" : genReady ? "Reload"
                : G.genModelById(genSel).backend === "endpoint" ? "Use this model" : "Download & load"}</button>
            <button className="btn" disabled={genBusy || !genFileCapable} onClick={() => genFileRef.current?.click()}
              title={genFileCapable ? "Pick a saved aurelian-llm.bin — no download" : "Only the SmolLM2 (Transformers.js) model can be saved to a file"}><Icon.upload /> {tr('ui.model.use-file', 'Use file…')}</button>
            <button className="btn" disabled={genBusy || !genFileCapable || !genCached} onClick={saveGenFile}
              title={!genFileCapable ? "WebLLM manages its own cache — file save not supported" : genCached ? "Save the language model as a file next to the app" : "Download the model first"}><Icon.download /> {tr('ui.model.save-file', 'Save file')}</button>
            <button className="btn ghost danger" disabled={genBusy} title={tr('ui.model.delete-cached-language-model', 'Delete cached language-model files from this browser (fixes a full/corrupted cache)')}
              onClick={async () => { if (confirm("Delete the cached language-model files from this browser?")) { await GF!.clearGenFiles(); setGenCached(false); setGenStatus("Language-model cache cleared."); } }}><Icon.trash /> {tr('ui.model.clear', 'Clear')}</button>
            <input ref={genFileRef} type="file" accept=".bin" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) useGenFile(f); e.target.value = ""; }} />
            {genBusy && <span className="spinner sm" aria-hidden />}
            {genStatus && <span className="hint">{genStatus}</span>}
          </div>
          {genBusy && <div className="pbar" style={{ marginTop: 10 }}><span style={{ width: genPct + "%" }} /></div>}
          <div className="guide" style={{ marginTop: 12, marginBottom: 0 }}>
            {tr('ui.model.the', 'The')} <strong>{tr('ui.model.smollm', 'SmolLM2')}</strong> model can be kept as a file (<span className="mono">{GF?.GEN_FILE ?? "aurelian-llm.bin"}</span>) just like the
            embedding model: <strong>{tr('ui.model.download-amp-load', 'Download &amp; load')}</strong> once, <strong>{tr('ui.model.save-file', 'Save file')}</strong>, then <strong>{tr('ui.model.use-file', 'Use file…')}</strong>
            next time. <strong>{tr('ui.model.qwen-webllm', 'Qwen (WebLLM)')}</strong> manages its own browser cache (persists on
            <span className="mono"> http://localhost</span>, not <span className="mono">file://</span>) and can't be saved to a file.
            WebGPU models are much faster; the WASM model works without a GPU but is slow.
          </div>
        </div>
      </div>)}
    </div>
  );
}
