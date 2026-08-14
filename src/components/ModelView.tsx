// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Model configuration section: pick the local embedding model, download/load it,
// see the load + cache state, and clear the cached model. The model powers the
// document extraction and runs entirely in the browser.
import { useEffect, useRef, useState } from "react";
import { embedModelList, getModelId, isLoaded, loadEmbedder, loadedModelId, setModelId } from "../domain/embeddings";
import { MODEL_FILE, clearModelCache, exportModelPack, importModelPack, isModelCached, tryLoadLocalPack } from "../domain/modelCache";
import { addUserModel, removeUserModel, isUserModel } from "../domain/modelRegistry";
import { Icon } from "./ui";

function AddModel({ onAdd }: { onAdd: () => void }) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState(""); const [label, setLabel] = useState(""); const [size, setSize] = useState(""); const [note, setNote] = useState("");
  const submit = () => {
    if (!id.trim()) return;
    addUserModel({ kind: "embed", backend: "transformers", id: id.trim(), label: label.trim() || id.trim(), size: size.trim() || undefined, note: note.trim() || undefined });
    setId(""); setLabel(""); setSize(""); setNote(""); setOpen(false); onAdd();
  };
  if (!open) return <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => setOpen(true)}><Icon.plus /> Add model…</button>;
  return (
    <div className="add-model">
      <div className="row">
        <div className="field" style={{ marginBottom: 0, flex: 2 }}><label>Model id (Hugging Face repo)</label>
          <input value={id} onChange={(e) => setId(e.target.value)} placeholder="e.g. Xenova/multilingual-e5-small" /></div>
        <div className="field" style={{ marginBottom: 0, flex: 1 }}><label>Label</label><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="optional" /></div>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <div className="field" style={{ marginBottom: 0 }}><label>Size</label><input value={size} onChange={(e) => setSize(e.target.value)} placeholder="e.g. ~120 MB" /></div>
        <div className="field" style={{ marginBottom: 0 }}><label>Note</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" /></div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="btn primary sm" disabled={!id.trim()} onClick={submit}><Icon.plus /> Add</button>
        <button className="btn ghost sm" onClick={() => setOpen(false)}>Cancel</button>
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

  useEffect(() => { isModelCached().then(setCached); }, [status]);
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

  const embState = ready ? "Loaded" : cached ? "Downloaded · not loaded" : "Not downloaded";
  const stateColor = (s: string) => s === "Loaded" ? "var(--color-state-success)" : /not loaded|Downloaded/.test(s) && s !== "Not downloaded" ? "var(--color-state-info)" : "var(--fg-subtle)";
  const Badge = ({ s }: { s: string }) => <span className="badge" style={{ background: `color-mix(in oklch, ${stateColor(s)} 22%, transparent)` }}>{s}</span>;

  return (
    <div className="content">
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <h1 className="grad-text">Model</h1>
          <div className="meta" style={{ color: "var(--fg-subtle)" }}>The embedding model powers document extraction and runs entirely in your browser.</div>
        </div>
      </div>

      {/* ── Embedding model ──────────────────────────────────────────── */}
      <div className="panel">
        <div className="panel-head"><h3>Embedding model</h3><Badge s={embState} /></div>
        <div className="panel-body" style={{ padding: "10px 14px 14px" }}>
          <div className="meta" style={{ color: "var(--fg-subtle)", marginBottom: 10 }}>
            Classifies sentences into the taxonomy — best for structured / list-like documents. Small (~25–34 MB).
          </div>
          {embedModelList().map((m) => (
            <label key={m.id} className={"model-row" + (selected === m.id ? " on" : "")}>
              <input type="radio" name="model" style={{ width: "auto" }} checked={selected === m.id} onChange={() => pick(m.id)} />
              <span><span className="model-name">{m.label}</span><span className="model-note">{m.note} · {m.size}</span></span>
              {loadedModelId() === m.id && <span className="badge" style={{ marginLeft: "auto" }}>loaded</span>}
              {isUserModel(m.id) && <button className="btn ghost sm danger" style={{ marginLeft: loadedModelId() === m.id ? 6 : "auto" }} title="Remove this model" onClick={(e) => { e.preventDefault(); removeUserModel(m.id); if (selected === m.id) { setModelId(embedModelList()[0].id); setSelected(embedModelList()[0].id); } bump(); }}><Icon.trash /></button>}
            </label>
          ))}
          <AddModel onAdd={bump} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
            <button className="btn primary" disabled={busy} onClick={download}><Icon.download /> {busy ? "Working…" : ready ? "Reload" : "Download & load"}</button>
            <button className="btn" disabled={busy} onClick={() => fileRef.current?.click()} title="Pick an existing aurelian-model.bin — reused with no download (works on file:// too)"><Icon.upload /> Use file…</button>
            <button className="btn" disabled={busy || !(cached || ready)} onClick={saveFile} title={cached || ready ? "Save as a file next to the app" : "Load the model first"}><Icon.download /> Save file</button>
            <button className="btn ghost danger" disabled={busy} onClick={clear}><Icon.trash /> Clear</button>
            <input ref={fileRef} type="file" accept=".bin" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) useFile(f); e.target.value = ""; }} />
            {busy && <span className="spinner sm" aria-hidden />}
            {status && <span className="hint">{status}</span>}
          </div>
          <div className="guide" style={{ marginTop: 12, marginBottom: 0 }}>
            To avoid re-downloading between <span className="mono">file://</span> sessions the model is kept as a
            file (<span className="mono">{MODEL_FILE}</span>): after <strong>Download &amp; load</strong> a save
            dialog opens → keep it next to the HTML, then <strong>Use file…</strong> next time (works on Chrome/Edge
            <span className="mono"> file://</span> too). On <span className="mono">http://localhost</span>/Firefox it is auto-detected on start.
          </div>
        </div>
      </div>
    </div>
  );
}
