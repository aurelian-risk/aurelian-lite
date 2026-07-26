// Data import dialog: choose additive vs destructive apply, and a source —
// either pick a file or paste JSON/YAML text directly. Auto-detects the format.
import { useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "../domain/store";
import { importFromFile, parseBundle } from "../domain/persistence";
import { importDocs } from "../domain/documents";
import { setModelId } from "../domain/embeddings";
import type { Bundle } from "../domain/types";
import { Icon } from "./ui";

type Mode = "merge" | "replace";

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const [mode, setMode] = useState<Mode>("merge");
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const describe = (b: Bundle) => {
    const parts: string[] = [];
    if (b.taxonomy) parts.push("a taxonomy");
    if (b.studies) parts.push(`${b.studies.length} study/studies`);
    if (b.documents?.length) parts.push(`${b.documents.length} document(s)`);
    if (b.settings) parts.push("settings");
    return parts.join(", ") || "nothing usable";
  };

  const apply = async (b: Bundle) => {
    if (b.taxonomy && store.studies.length > 0 && mode === "replace") {
      if (!confirm("This file replaces the taxonomy (data model). Existing entities may no longer match. Continue?")) return;
    }
    store.applyBundle(b, { studiesMode: mode });
    if (b.documents?.length) await importDocs(b.documents);
    if (b.settings) {
      if (b.settings.modelId) setModelId(b.settings.modelId);
      if (b.settings.theme) { const el = document.documentElement; el.classList.toggle("light", b.settings.theme === "light"); el.classList.toggle("dark", b.settings.theme !== "light"); }
    }
    setStatus(`Imported ${describe(b)} (${mode === "merge" ? "added to" : "replaced"} existing data).`);
    setTimeout(onClose, 800);
  };

  const fromFile = async () => {
    setBusy(true); setStatus("");
    try { await apply(await importFromFile()); }
    catch (e) { if (e instanceof Error && e.message !== "No file selected") setStatus("Import failed: " + e.message); }
    setBusy(false);
  };

  const fromText = async () => {
    if (!text.trim()) { setStatus("Paste JSON or YAML text first, or choose a file."); return; }
    setBusy(true); setStatus("");
    try { await apply(parseBundle(text)); }
    catch (e) { setStatus("Could not parse: " + (e instanceof Error ? e.message : String(e))); }
    setBusy(false);
  };

  const MODES: { id: Mode; title: string; hint: string }[] = [
    { id: "merge", title: "Additive", hint: "Add new studies / merge partial data into existing ones. Nothing is deleted." },
    { id: "replace", title: "Destructive", hint: "Replace the current dataset entirely with the imported one." },
  ];

  return createPortal(
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal-lg" style={{ maxWidth: 560 }} onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-lg-head">
          <div style={{ flex: 1 }}>
            <div className="dialog-sub" style={{ margin: 0 }}>Data · JSON / YAML (auto-detected)</div>
            <h2 style={{ fontSize: 19 }}>Import data</h2>
          </div>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close"><Icon.close /></button>
        </header>

        <div className="modal-lg-body">
          <div className="menu-label" style={{ padding: "0 0 8px" }}>Apply as</div>
          <div className="import-modes">
            {MODES.map((m) => (
              <label key={m.id} className={"import-mode" + (mode === m.id ? " on" : "") + (m.id === "replace" ? " danger" : "")}>
                <input type="radio" name="import-mode" checked={mode === m.id} onChange={() => setMode(m.id)} />
                <span>
                  <span className="im-title">{m.title}</span>
                  <span className="im-hint">{m.hint}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="menu-label" style={{ padding: "16px 0 8px" }}>Source</div>
          <div className="field" style={{ marginBottom: 8 }}>
            <label>Paste JSON / YAML</label>
            <textarea style={{ minHeight: 140, fontFamily: "var(--font-mono)", fontSize: 12 }} value={text}
              onChange={(e) => setText(e.target.value)} placeholder="Paste a bundle, study data, or a taxonomy here…" />
          </div>
          <div className="import-or"><span>or</span></div>
          <button className="btn" disabled={busy} onClick={fromFile}><Icon.upload /> Choose file…</button>
          {status && <div className="hint" style={{ marginTop: 10 }}>{status}</div>}
        </div>

        <footer className="modal-lg-foot">
          <span className="hint">{mode === "merge" ? "Additive import" : "Destructive import — replaces all data"}</span>
          <span style={{ flex: 1 }} />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy || !text.trim()} onClick={fromText}><Icon.download /> Import pasted</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
