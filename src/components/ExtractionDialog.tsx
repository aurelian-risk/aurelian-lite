// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Extraction view: load a document's text (transiently) and run a model that is
// already loaded (managed entirely in the Model section) to propose candidate
// entities grouped by the taxonomy. This view never downloads or loads models —
// if none is loaded there is nothing to run.
import { useEffect, useState } from "react";
import { t as tr } from "../domain/i18n";
import { createPortal } from "react-dom";
import { useActiveStudy, useStore } from "../domain/store";
import { fieldLabel, getType, typeLabel, typeNameOf } from "../domain/taxonomy";
import { getDocText, viewTextTransient } from "../domain/documents";
import { extractByEmbeddings, type TypeCandidates, type Candidate } from "../domain/extraction";
import { LLM, gen, genNow } from "../domain/gen";
import { isLoaded } from "../domain/embeddings";
import { Icon, Overlay } from "./ui";

export function ExtractionDialog({ onClose, initialName, docId }: { onClose: () => void; initialName?: string; docId?: string }) {
  const tax = useStore((s) => s.taxonomy);
  const addEntity = useStore((s) => s.addEntity);
  const active = useActiveStudy();
  const [name, setName] = useState(initialName ?? "");
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState("");
  const [phase, setPhase] = useState<"load" | "read" | "validate" | "">("");
  const [pct, setPct] = useState(0);
  const [groups, setGroups] = useState<TypeCandidates[] | null>(null);
  /** Candidates the user re-classified: original id → the type it should become. The id
   *  stays the one it was found under, so the selection survives a re-classification. */
  const [moved, setMoved] = useState<Record<string, string>>({});
  /** Rows showing their surrounding text. */
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Set<string>>(new Set());

  // Which models are loaded (loading is done in the Model section, not here).
  const embLoaded = isLoaded();
  // The generative branch is a build away, not an import away: a build made without it
  // never resolves this, and every use below is guarded on the result.
  const [G, setG] = useState(genNow());
  useEffect(() => { let live = true; gen().then((m) => { if (live && m) setG(m); }); return () => { live = false; }; }, []);
  const genLoaded = G?.loadedGenId() ?? null;
  const [engine, setEngine] = useState<"fast" | "smart">(embLoaded ? "fast" : genLoaded ? "smart" : "fast");
  const engineReady = engine === "fast" ? embLoaded : !!genLoaded;

  // Auto-load the reference's cached text when opened from a specific document.
  useEffect(() => {
    if (!docId) return;
    getDocText(docId).then((t) => { if (t) { setText(t); } });
  }, [docId]);

  const openFile = async () => {
    try { const v = await viewTextTransient(); if (v) { setText(v.text); if (!name) setName(v.name); setGroups(null); } } catch { /* ignore */ }
  };
  const run = async () => {
    if (!engineReady) return;
    if (!text.trim()) { setStatus("Add document text first — paste it or use “Open file”."); return; }
    setBusy(true); setGroups(null); setSel(new Set()); setLive(""); setPct(0); setPhase("");
    try {
      let g: TypeCandidates[];
      if (LLM && engine === "smart") {
        setPhase("load"); setStatus("Preparing model …");
        const t0 = performance.now();
        g = await G!.extractByLLM(tax, text, G!.genModelById(genLoaded!), (p) => {
          if (p.status !== "generating") {
            setPhase("load"); setPct(Math.round((p.progress ?? 0) * 100));
            setStatus(p.file ? `Loading ${p.file} …` : "Preparing model …");
            return;
          }
          const txt = p.text ?? "";
          setLive(txt);
          setPhase("read");
          setPct(Math.min(99, Math.round(((p.tokens ?? 0) / G!.GEN_MAX_TOKENS) * 100)));
          const ents = (txt.match(/"type"\s*:/g) || []).length;
          const secs = Math.max(1, Math.round((performance.now() - t0) / 1000));
          const rate = Math.round((p.tokens ?? 0) / secs);
          const chunk = p.chunks && p.chunks > 1 ? `chunk ${p.chunk}/${p.chunks} · ` : "";
          setStatus(`Generating — ${chunk}${p.tokens ?? 0} tokens · ~${ents} entities · ${secs}s · ${rate} tok/s`);
        });
        setPhase("validate"); setPct(100); setStatus("Validating extracted entities …");
        await new Promise((r) => setTimeout(r, 20));
      } else {
        setStatus("Extracting …");
        await new Promise((r) => setTimeout(r, 30)); // let the spinner paint first
        g = await extractByEmbeddings(tax, text, { studyEntities: active?.entities });
      }
      // Pre-select confident candidates; leave "uncertain" ones for the user.
      const pre = new Set<string>();
      g.forEach((grp) => grp.candidates.forEach((c, i) => { if (!c.uncertain) pre.add(grp.typeKey + ":" + i); }));
      setGroups(g); setSel(pre);
      setStatus(`Found candidates in ${g.length} type(s) — ${pre.size} pre-selected.`);
    } catch (e) { setStatus("Extraction failed: " + (e instanceof Error ? e.message : String(e))); }
    setBusy(false); setPhase("");
  };
  const cancel = () => { G?.cancelGeneration(); setStatus("Stopping — keeping whatever was extracted so far …"); };
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
      if (mine.length) panels.push({ typeKey: key, label: typeNameOf(tax, key, true), rows: mine });
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
    <Overlay onClose={onClose}>
      <div className="modal-lg" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-lg-head">
          <div style={{ flex: 1 }}>
            <div className="dialog-sub" style={{ margin: 0 }}>Extract into {active ? `“${active.name}”` : "— no active study —"}</div>
            <h2 style={{ fontSize: 19 }}>{tr('ui.extraction.extract-entities', 'Extract entities')}</h2>
          </div>
          <button className="btn ghost sm" onClick={onClose} aria-label={tr('ui.extraction.close', 'Close')}><Icon.close /></button>
        </header>

        <div className="modal-lg-body">
          <div className="row" style={{ marginBottom: 12 }}>
            <div className="field" style={{ marginBottom: 0 }}><label>{tr('ui.extraction.document-name', 'Document name')}</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("ui.extraction.optional", "optional")} /></div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flex: "none" }}>
              <button className={"btn" + (!text.trim() ? " primary" : "")} onClick={openFile}><Icon.upload /> {tr('ui.extraction.open-file', 'Open file')}</button>
            </div>
          </div>
          <div className="field"><label>{tr('ui.extraction.text', 'Text')}</label>
            <textarea style={{ minHeight: 130 }} value={text} onChange={(e) => { setText(e.target.value); setGroups(null); }} placeholder={tr('ui.extraction.paste-document-text-or', 'Paste document text, or use “Open file” (content is read transiently, not stored)…')} /></div>

          <div className="field" style={{ marginBottom: 8 }}>
            <label>{tr('ui.extraction.engine', 'Engine')}</label>
            <div className="seg" style={{ padding: 0 }}>
              <button className={"seg-btn" + (engine === "fast" ? " on" : "")} disabled={!embLoaded}
                title={embLoaded ? "Embeddings — best for structured text" : "Load the embedding model in the Model section"}
                onClick={() => { setEngine("fast"); setGroups(null); }}>Fast · embeddings{embLoaded ? "" : " (not loaded)"}</button>
              {LLM && (
                <button className={"seg-btn" + (engine === "smart" ? " on" : "")} disabled={!genLoaded}
                  title={genLoaded ? "Local LLM — reads free-form prose" : "Load a language model in the Model section"}
                  onClick={() => { setEngine("smart"); setGroups(null); }}>Smart · local LLM{genLoaded ? "" : " (not loaded)"}</button>
              )}
            </div>
          </div>

          <div className="guide" style={{ marginTop: 4 }}>
            {engineReady
              ? (engine === "fast" || !LLM
                ? <span><strong>{tr('ui.extraction.fast-engine', 'Fast engine.')}</strong> {tr('ui.extraction.embeddings-classify-sentences-into', 'Embeddings classify sentences into the taxonomy — best for structured / list-like documents.')}</span>
                // Behind the flag rather than behind `engine`: a runtime condition keeps its
                // branch in the bundle, so the released file carried the sentence describing
                // a model it cannot run. See domain/gen.ts.
                : <span><strong>Smart engine ({G!.genModelById(genLoaded!).label}).</strong> {tr('ui.extraction.a-local-language-model', 'A local language model reads narrative prose and emits structured entities.')}</span>)
              : <span><strong>{tr('ui.extraction.no-extraction-model-is', 'No extraction model is loaded.')}</strong> {tr('ui.extraction.models-are-managed-in', 'Models are managed in the')} <strong>{tr('ui.extraction.model', 'Model')}</strong> section (sidebar): open it, download &amp; load the fast embedding model{LLM ? " and/or a smart language model" : ""}, then come back here to extract.</span>}

            <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
              <button className="btn primary" disabled={busy || !engineReady} onClick={run}>
                <Icon.spark /> {busy ? "Working…" : "Extract"}
              </button>
              {busy && engine === "smart" && <button className="btn ghost danger" onClick={cancel}>{tr('ui.extraction.stop', 'Stop')}</button>}
              {busy && <span className="spinner" aria-hidden />}
            </div>

            {busy && engine === "smart" && (
              <div style={{ marginTop: 12 }}>
                <div className="phases">
                  {([["load", "Load model"], ["read", "Read document"], ["validate", "Validate"]] as const).map(([k, lbl], i) => {
                    const order = { load: 0, read: 1, validate: 2 } as const;
                    const cur = phase ? order[phase] : -1;
                    const st = cur > i ? "done" : cur === i ? "on" : "";
                    return <span key={k} className={"phase " + st}><span className="phase-dot">{cur > i ? "✓" : i + 1}</span>{lbl}</span>;
                  })}
                </div>
                <div className="pbar"><span style={{ width: pct + "%" }} /></div>
              </div>
            )}

            {(busy || status) && <div className="hint" style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
              {busy && <span className="spinner sm" aria-hidden />}<span>{status}</span></div>}
            {engine === "smart" && live && (
              <pre className="gen-live" ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}>{live.slice(-900)}</pre>
            )}
          </div>

          {groups && (groups.length === 0
            ? <div className="empty" style={{ padding: "24px 0" }}>{tr('ui.extraction.no-candidates-found', 'No candidates found.')}</div>
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
                                  {enumFields.map((f) => c.values[f.key] ? <span key={f.key} className="badge">{fieldLabel(f)}: {String(c.values[f.key])}</span> : null)}
                                </span>
                              )}
                            </span>
                            <span className="ex-cand-tools">
                              {/* Re-classify. The model proposed a type; this is where you disagree with
                                  it, without losing the candidate or having to type it in again. */}
                              <select className="chip ex-cand-type" value={moved[id] ?? from}
                                aria-label={`Type of ${c.name}`}
                                title={moved[id] && moved[id] !== from ? `Found as ${typeNameOf(tax, from)}` : "Type proposed by the model"}
                                onChange={(e) => setMoved((m) => {
                                  const next = { ...m };
                                  if (e.target.value === from) delete next[id]; else next[id] = e.target.value;
                                  return next;
                                })}>
                                {tax.entityTypes.map((t) => <option key={t.key} value={t.key}>{typeLabel(t)}</option>)}
                              </select>
                              {moved[id] && moved[id] !== from && (
                                <span className="badge" title={`Found as ${typeNameOf(tax, from)}`}>re-classified</span>
                              )}
                              {c.uncertain && <span className="badge" title={tr('ui.extraction.best-and-second-best', 'Best and second-best type were close — please review')} style={{ color: "var(--color-state-warning, var(--fg-muted))" }}>uncertain</span>}
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
                                : <p className="hint" style={{ margin: 0 }}>{tr('ui.extraction.the-passage-could-not', 'The passage could not be located in the current text — it may have been edited since the extraction ran.')}</p>}
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
          <button className="btn ghost" onClick={onClose}>{tr('ui.extraction.cancel', 'Cancel')}</button>
          <button className="btn primary" disabled={!active || sel.size === 0} onClick={addSelected}>Add {sel.size} to study</button>
        </footer>
      </div>
    </Overlay>,
    document.body,
  );
}
