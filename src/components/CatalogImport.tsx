// Semi-deterministic framework / catalog import — part of the Documents system.
// Its OWN import logic (not the embedding entity-extraction): a structured table
// (CSV/TSV/JSON, or pasted) is parsed VERBATIM; the embedding model only *assists*
// header→field mapping. Imports as requirements OR security measures (user choice).
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Study, Taxonomy } from "../domain/types";
import { catalogTargets } from "../domain/catalog";
import type { Framework, FrameworkItem } from "../domain/frameworks";
import { parseCatalog } from "../domain/frameworks";
import { parseTable, guessMapping, tableToItems, looksLikeJson, FIELD_KEYS, type FieldKey, type Mapping, type ParsedTable } from "../domain/catalogimport";
import { embed, cosine, isLoaded } from "../domain/embeddings";
import { useStore } from "../domain/store";
import { downloadText } from "../domain/clipboard";
import { Icon } from "./ui";

const FIELD_LABEL: Record<FieldKey, string> = { ref_id: "Reference ID", title: "Title", category: "Category", description: "Description" };
const FIELD_TEXT: Record<FieldKey, string> = {
  ref_id: "reference identifier code number clause", title: "title name of the requirement or control",
  category: "category family domain group function", description: "description details guidance explanation text",
};
const TEMPLATE = JSON.stringify({ name: "My framework", source: "where the content came from", items: [{ ref_id: "A-1", title: "Example control", category: "Group", description: "What it requires." }] }, null, 2) + "\n";

export function CatalogImport({ tax, study, onClose }: { tax: Taxonomy; study: Study; onClose: () => void }) {
  const addEntity = useStore((s) => s.addEntity);
  const targets = useMemo(() => catalogTargets(tax), [tax]);
  const [kind, setKind] = useState<"requirement" | "measure">(targets[0]?.kind ?? "requirement");
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [map, setMap] = useState<Mapping>({});
  const [jsonItems, setJsonItems] = useState<FrameworkItem[] | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set()); // items the user un-checked
  const fileRef = useRef<HTMLInputElement>(null);

  const target = targets.find((t) => t.kind === kind) ?? targets[0];
  const existing = target ? study.entities.filter((e) => e.type === target.type.key) : [];

  const parse = (raw: string, fallbackName: string) => {
    setMsg(null); setJsonItems(null); setTable(null); setExcluded(new Set());
    if (!raw.trim()) return;
    if (looksLikeJson(raw)) {
      try { const c = parseCatalog(raw, fallbackName || "Imported"); setName(c.name); setJsonItems(c.items); }
      catch (e) { setMsg("Invalid JSON: " + (e instanceof Error ? e.message : String(e))); }
    } else {
      const t = parseTable(raw);
      setTable(t); setMap(guessMapping(t.headers)); setName(fallbackName || "Imported");
    }
  };
  const onFile = async (f: File) => { const raw = await f.text(); setText(raw); parse(raw, f.name.replace(/\.[^.]+$/, "")); };

  const suggestWithAI = async () => {
    if (!table || !isLoaded()) return;
    setAiBusy(true);
    try {
      const headers = table.headers;
      const vecs = await embed([...FIELD_KEYS.map((f) => FIELD_TEXT[f]), ...headers]);
      const fv = FIELD_KEYS.map((_, i) => vecs[i]);
      const hv = headers.map((_, i) => vecs[FIELD_KEYS.length + i]);
      const score = (field: FieldKey, header: string) => { const hi = headers.indexOf(header); const fi = FIELD_KEYS.indexOf(field); return fi >= 0 && hi >= 0 ? cosine(fv[fi], hv[hi]) : 0; };
      setMap(guessMapping(headers, score));
    } catch (e) { setMsg("AI mapping failed: " + (e instanceof Error ? e.message : String(e))); }
    setAiBusy(false);
  };

  const items: FrameworkItem[] = jsonItems ?? (table ? tableToItems(table, map) : []);
  const fw: Framework = { key: name || "imported", name: name || "Imported", source: "user import", items };
  const inStudy = (it: FrameworkItem) => (target ? target.exists(existing, fw, it) : false);
  // selected = parsed, not already in the study, and not un-checked by the user.
  const chosen = items.filter((it, i) => !inStudy(it) && !excluded.has(i));
  const toggle = (i: number) => setExcluded((e) => { const n = new Set(e); n.has(i) ? n.delete(i) : n.add(i); return n; });

  const doImport = () => {
    if (!target || chosen.length === 0) return;
    for (const it of chosen) addEntity(target.type.key, target.toValues(fw, it));
    setMsg(`Added ${chosen.length} ${kind}${chosen.length === 1 ? "" : "s"} to the study — the rest stay unselected.`);
    // keep the list visible: added items now re-render as "in study".
  };

  return createPortal(
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal-lg" style={{ maxWidth: 720 }} onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-lg-head">
          <div style={{ flex: 1 }}>
            <div className="dialog-sub" style={{ margin: 0 }}>Documents · semi-deterministic import</div>
            <h2 style={{ fontSize: 19 }}>Import a framework / catalog</h2>
          </div>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close"><Icon.close /></button>
        </header>

        <div className="modal-lg-body">
          {targets.length > 1 && (
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Import as</label>
              <div className="seg">
                {targets.map((t) => (
                  <button key={t.kind} className={"seg-btn" + (kind === t.kind ? " on" : "")} onClick={() => setKind(t.kind)}>{t.type.label}</button>
                ))}
              </div>
            </div>
          )}

          <div className="guide" style={{ marginBottom: 12 }}>
            Paste a table (CSV/TSV) or JSON, or choose a file. Values are read <b>verbatim</b>; for a
            table you map columns to fields below. JSON format:
            <code style={{ display: "block", marginTop: 6, whiteSpace: "pre-wrap" }}>{`{ "name": "…", "items": [ { "ref_id", "title", "category", "description" } ] }`}</code>
            <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => downloadText("catalog-template.json", TEMPLATE)}><Icon.download /> Download template</button>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <button className="btn sm" onClick={() => fileRef.current?.click()}><Icon.upload /> Choose file…</button>
            <input placeholder="Framework name (optional)" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
          </div>
          <textarea placeholder="…or paste CSV / TSV / JSON here" value={text} rows={6}
            onChange={(e) => setText(e.target.value)} onBlur={() => parse(text, name)} style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }} />
          <div style={{ marginTop: 6 }}><button className="btn sm" disabled={!text.trim()} onClick={() => parse(text, name)}>Parse</button></div>

          {table && (
            <div className="panel" style={{ marginTop: 14 }}>
              <div className="panel-head"><h3>Map columns</h3><span className="badge">{table.rows.length} rows</span><span className="spacer" />
                <button className="btn ghost sm" disabled={!isLoaded() || aiBusy} title={isLoaded() ? "Guess mapping with the embedding model" : "Load the embedding model in the Model section"} onClick={suggestWithAI}>
                  <Icon.spark /> {aiBusy ? "…" : "Suggest with AI"}
                </button>
              </div>
              <div className="panel-body" style={{ padding: "8px 14px 12px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
                {FIELD_KEYS.map((f) => (
                  <label key={f} className="field" style={{ margin: 0 }}>
                    <span className="hint">{FIELD_LABEL[f]}{f === "title" ? " *" : ""}</span>
                    <select value={map[f] ?? -1} onChange={(e) => setMap((m) => ({ ...m, [f]: Number(e.target.value) }))}>
                      <option value={-1}>— none —</option>
                      {table.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          )}

          {items.length > 0 && (
            <div className="panel" style={{ marginTop: 12 }}>
              <div className="panel-head"><h3>Select what to add</h3><span className="badge">{chosen.length}/{items.length}</span>
                <span className="spacer" /><span className="hint">only checked items go into the table</span></div>
              <div className="panel-body" style={{ padding: "2px 12px 8px", maxHeight: 300, overflow: "auto" }}>
                {items.slice(0, 250).map((it, i) => {
                  const exists = inStudy(it);
                  return (
                    <label key={i} className="ex-cand" style={exists ? { opacity: 0.5 } : undefined}>
                      <input type="checkbox" style={{ width: "auto", marginTop: 3 }} checked={exists || !excluded.has(i)} disabled={exists} onChange={() => toggle(i)} />
                      <span style={{ flex: 1 }}>
                        <span className="ex-cand-name">{it.ref_id ? it.ref_id + " · " : ""}{it.title}</span>
                        {(it.category || it.description) && <span className="ex-cand-snip">{it.category}{it.category && it.description ? " — " : ""}{(it.description || "").slice(0, 140)}</span>}
                      </span>
                      {exists && <span className="badge">in study</span>}
                    </label>
                  );
                })}
                {items.length > 250 && <div className="hint" style={{ padding: "6px 4px" }}>+{items.length - 250} more (checked ones are still added)…</div>}
              </div>
            </div>
          )}
          {msg && <div className="guide warn" style={{ marginTop: 12 }}>{msg}</div>}
        </div>

        <footer className="modal-lg-foot">
          <span style={{ flex: 1 }} />
          <button className="btn ghost" onClick={onClose}>Close</button>
          <button className="btn primary" disabled={!target || chosen.length === 0} onClick={doImport}>Add {chosen.length || ""} selected</button>
        </footer>
        <input ref={fileRef} type="file" accept=".csv,.tsv,.json,.txt" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      </div>
    </div>,
    document.body,
  );
}
