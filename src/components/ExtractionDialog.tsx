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
import { extractByEmbeddings, type TypeCandidates, type Candidate } from "../domain/extraction";
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
  /** Candidates the user re-classified: original id → the type it should become. The id
   *  stays the one it was found under, so the selection survives a re-classification. */
  const [moved, setMoved] = useState<Record<string, string>>({});
  /** Rows showing their surrounding text. */
  const [opened, setOpened] = useState<Set<string>>(new Set());
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
      const id = g.typeKey + ":" + i;
      if (!sel.has(id)) return;
      const target = moved[id] ?? g.typeKey;
      // The values were read for the type it was found under. Moving it keeps only what
      // the new type actually declares - a field it has no place for would be stored
      // where nothing reads it.
      const t = getType(tax, target);
      const values = target === g.typeKey ? c.values
        : Object.fromEntries(Object.entries(c.values).filter(([k]) => t?.fields.some((f) => f.key === k)));
      if (t && !values.name) values.name = c.name;
      addEntity(target, values, src);
      added++;
    });
    alert(`Added ${added} entities to “${active.name}” (source: ${src}).`);
    onClose();
  };

  /** Panels as they now stand: a re-classified candidate appears under its new type. */
  type Row = { id: string; c: Candidate; from: string };
  const panels: { typeKey: string; label: string; rows: Row[] }[] = [];
  if (groups) {
    const rows: Row[] = [];
    for (const g of groups) g.candidates.forEach((c, i) => rows.push({ id: g.typeKey + ":" + i, c, from: g.typeKey }));
    const order = [...new Set([...groups.map((g) => g.typeKey), ...Object.values(moved)])];
    for (const key of order) {
      const mine = rows.filter((r) => (moved[r.id] ?? r.from) === key);
      if (mine.length) panels.push({ typeKey: key, label: getType(tax, key)?.labelPlural ?? key, rows: mine });
    }
  }

  /** The passage a candidate came from, with a little either side. The sentence itself is
   *  what was matched; the surrounding text is what tells you whether the match is right. */
  const contextOf = (snippet: string): { before: string; hit: string; after: string } | null => {
    const at = text.indexOf(snippet);
    if (at < 0) return null;
    return {
      before: text.slice(Math.max(0, at - 900), at),
      hit: snippet,
      after: text.slice(at + snippet.length, at + snippet.length + 900),
    };
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
            : panels.map((p) => {
              const enumFields = (getType(tax, p.typeKey)?.fields ?? []).filter((f) => f.type === "enum");
              return (
                <div className="panel" style={{ marginTop: 14 }} key={p.typeKey}>
                  <div className="panel-head"><h3>{p.label}</h3><span className="badge">{p.rows.length}</span></div>
                  <div className="panel-body" style={{ padding: "6px 12px 12px" }}>
                    {p.rows.map(({ id, c, from }) => {
                      const isOpen = opened.has(id);
                      const ctx = isOpen ? contextOf(c.snippet) : null;
                      return (
                        <div key={id} className={"ex-cand" + (isOpen ? " open" : "")}>
                          <div className="ex-cand-row">
                            <input type="checkbox" style={{ width: "auto", marginTop: 3 }}
                              checked={sel.has(id)} onChange={() => toggle(id)} aria-label={`Select ${c.name}`} />
                            <span style={{ flex: 1, cursor: "pointer" }} onClick={() => toggle(id)}>
                              <span className="ex-cand-name">{c.name}</span>
                              {c.snippet.trim() !== c.name.trim() && <span className="ex-cand-snip">{c.snippet}</span>}
                              {enumFields.length > 0 && (
                                <span className="ex-cand-fields">
                                  {enumFields.map((f) => c.values[f.key] ? <span key={f.key} className="badge">{f.label}: {String(c.values[f.key])}</span> : null)}
                                </span>
                              )}
                            </span>
                            <span className="ex-cand-tools">
                              {/* Re-classify. The model proposed a type; this is where you disagree with
                                  it, without losing the candidate or having to type it in again. */}
                              <select className="chip ex-cand-type" value={moved[id] ?? from}
                                aria-label={`Type of ${c.name}`}
                                title={moved[id] && moved[id] !== from ? `Found as ${getType(tax, from)?.label ?? from}` : "Type proposed by the model"}
                                onChange={(e) => setMoved((m) => {
                                  const next = { ...m };
                                  if (e.target.value === from) delete next[id]; else next[id] = e.target.value;
                                  return next;
                                })}>
                                {tax.entityTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                              </select>
                              {moved[id] && moved[id] !== from && (
                                <span className="badge" title={`Found as ${getType(tax, from)?.label ?? from}`}>re-classified</span>
                              )}
                              {c.uncertain && <span className="badge" title="Best and second-best type were close — please review" style={{ color: "var(--color-state-warning, var(--fg-muted))" }}>uncertain</span>}
                              <span className="badge">{Math.round(c.score * 100)}%</span>
                              <button type="button" className="btn ghost sm" aria-expanded={isOpen}
                                title={isOpen ? "Hide the passage it came from" : "Show the passage it came from"}
                                onClick={() => setOpened((o) => { const n = new Set(o); n.has(id) ? n.delete(id) : n.add(id); return n; })}>
                                <span className={"caret" + (isOpen ? " open" : "")}><Icon.chevron /></span>
                              </button>
                            </span>
                          </div>
                          {isOpen && (
                            <div className="ex-cand-ctx">
                              {ctx
                                ? <p className="ex-ctx-text">
                                    <span className="ex-ctx-side">…{ctx.before}</span>
                                    <mark>{ctx.hit}</mark>
                                    <span className="ex-ctx-side">{ctx.after}…</span>
                                  </p>
                                : <p className="hint" style={{ margin: 0 }}>The passage could not be located in the current text — it may have been edited since the extraction ran.</p>}
                            </div>
                          )}
                        </div>
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
