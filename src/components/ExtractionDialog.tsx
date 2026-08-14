// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Extraction view: load a document's text (transiently) and run the embedding
// model that is already loaded (managed entirely in the Model section) to propose
// candidate entities grouped by the taxonomy. This view never downloads or loads
// models — if none is loaded there is nothing to run.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useActiveStudy, useStore } from "../domain/store";
import { getType } from "../domain/taxonomy";
import { getDocText, viewTextTransient } from "../domain/documents";
import { extractByEmbeddings, type TypeCandidates } from "../domain/extraction";
import { isLoaded } from "../domain/embeddings";
import { Icon } from "./ui";

export function ExtractionDialog({ onClose, initialName, docId }: { onClose: () => void; initialName?: string; docId?: string }) {
  const tax = useStore((s) => s.taxonomy);
  const addEntity = useStore((s) => s.addEntity);
  const active = useActiveStudy();
  const [name, setName] = useState(initialName ?? "");
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [groups, setGroups] = useState<TypeCandidates[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());

  // The embedding model is loaded in the Model section, not here.
  const embLoaded = isLoaded();

  // Auto-load the reference's cached text when opened from a specific document.
  useEffect(() => {
    if (!docId) return;
    getDocText(docId).then((t) => { if (t) { setText(t); } });
  }, [docId]);

  const openFile = async () => {
    try { const v = await viewTextTransient(); if (v) { setText(v.text); if (!name) setName(v.name); setGroups(null); } } catch { /* ignore */ }
  };
  const run = async () => {
    if (!embLoaded) return;
    if (!text.trim()) { setStatus("Add document text first — paste it or use “Open file”."); return; }
    setBusy(true); setGroups(null); setSel(new Set());
    try {
      setStatus("Extracting …");
      await new Promise((r) => setTimeout(r, 30)); // let the spinner paint first
      const g = await extractByEmbeddings(tax, text, { studyEntities: active?.entities });
      // Pre-select confident candidates; leave "uncertain" ones for the user.
      const pre = new Set<string>();
      g.forEach((grp) => grp.candidates.forEach((c, i) => { if (!c.uncertain) pre.add(grp.typeKey + ":" + i); }));
      setGroups(g); setSel(pre);
      setStatus(`Found candidates in ${g.length} type(s) — ${pre.size} pre-selected.`);
    } catch (e) { setStatus("Extraction failed: " + (e instanceof Error ? e.message : String(e))); }
    setBusy(false);
  };
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const addSelected = () => {
    if (!active || !groups) return;
    let added = 0;
    const src = name.trim() || "pasted text";           // automatic source attribution
    for (const g of groups) g.candidates.forEach((c, i) => {
      if (sel.has(g.typeKey + ":" + i)) { addEntity(g.typeKey, c.values, src); added++; }
    });
    alert(`Added ${added} entities to “${active.name}” (source: ${src}).`);
    onClose();
  };

  return createPortal(
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal-lg" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-lg-head">
          <div style={{ flex: 1 }}>
            <div className="dialog-sub" style={{ margin: 0 }}>Extract into {active ? `“${active.name}”` : "— no active study —"}</div>
            <h2 style={{ fontSize: 19 }}>Extract entities</h2>
          </div>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close"><Icon.close /></button>
        </header>

        <div className="modal-lg-body">
          <div className="row" style={{ marginBottom: 12 }}>
            <div className="field" style={{ marginBottom: 0 }}><label>Document name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="optional" /></div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flex: "none" }}>
              <button className={"btn" + (!text.trim() ? " primary" : "")} onClick={openFile}><Icon.upload /> Open file</button>
            </div>
          </div>
          <div className="field"><label>Text</label>
            <textarea style={{ minHeight: 130 }} value={text} onChange={(e) => { setText(e.target.value); setGroups(null); }} placeholder="Paste document text, or use “Open file” (content is read transiently, not stored)…" /></div>

          <div className="guide" style={{ marginTop: 4 }}>
            {embLoaded
              ? <span><strong>Embedding extraction.</strong> The model classifies sentences into the taxonomy — best for structured / list-like documents.</span>
              : <span><strong>No extraction model is loaded.</strong> The embedding model is managed in the <strong>Model</strong> section (sidebar): open it, download &amp; load the model, then come back here to extract.</span>}

            <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
              <button className="btn primary" disabled={busy || !embLoaded} onClick={run}>
                <Icon.spark /> {busy ? "Working…" : "Extract"}
              </button>
              {busy && <span className="spinner" aria-hidden />}
            </div>

            {(busy || status) && <div className="hint" style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
              {busy && <span className="spinner sm" aria-hidden />}<span>{status}</span></div>}
          </div>

          {groups && (groups.length === 0
            ? <div className="empty" style={{ padding: "24px 0" }}>No candidates found.</div>
            : groups.map((g) => {
              const enumFields = (getType(tax, g.typeKey)?.fields ?? []).filter((f) => f.type === "enum");
              return (
                <div className="panel" style={{ marginTop: 14 }} key={g.typeKey}>
                  <div className="panel-head"><h3>{g.label}</h3><span className="badge">{g.candidates.length}</span></div>
                  <div className="panel-body" style={{ padding: "6px 12px 12px" }}>
                    {g.candidates.map((c, i) => {
                      const id = g.typeKey + ":" + i;
                      return (
                        <label key={id} className="ex-cand">
                          <input type="checkbox" style={{ width: "auto", marginTop: 3 }} checked={sel.has(id)} onChange={() => toggle(id)} />
                          <span style={{ flex: 1 }}>
                            <span className="ex-cand-name">{c.name}</span>
                            {c.snippet.trim() !== c.name.trim() && <span className="ex-cand-snip">{c.snippet}</span>}
                            {enumFields.length > 0 && (
                              <span className="ex-cand-fields">
                                {enumFields.map((f) => c.values[f.key] ? <span key={f.key} className="badge">{f.label}: {String(c.values[f.key])}</span> : null)}
                              </span>
                            )}
                          </span>
                          <span style={{ display: "flex", gap: 6, alignItems: "center", flex: "none" }}>
                            {c.uncertain && <span className="badge" title="Best and second-best type were close — please review" style={{ color: "var(--color-state-warning, var(--fg-muted))" }}>uncertain</span>}
                            <span className="badge">{Math.round(c.score * 100)}%</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            }))}
        </div>

        <footer className="modal-lg-foot">
          <span className="hint">{sel.size} selected</span>
          <span style={{ flex: 1 }} />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!active || sel.size === 0} onClick={addSelected}>Add {sel.size} to study</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
