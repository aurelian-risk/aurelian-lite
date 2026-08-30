// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Semi-deterministic framework / catalog import — part of the Documents system.
// Its OWN import logic (not the embedding entity-extraction): a structured table
// (CSV/TSV/JSON, or pasted) is parsed VERBATIM; the embedding model only *assists*
// header→field mapping. Imports as requirements OR security measures (user choice).
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Study, Taxonomy } from "../domain/types";
import { catalogTargets } from "../domain/catalog";
import type { Framework, FrameworkItem } from "../domain/frameworks";
import { parseCatalog, fetchPublishedCatalog } from "../domain/frameworks";
import type { PublishedCatalog } from "../domain/frameworks";
import { PUBLISHED_CATALOGS } from "../profile";
import { planVocabularyUpdate, applyVocabularyUpdate, catalogDefinesVocabulary, type VocabularyChange, type VocabularyMode } from "../domain/vocabulary";
import { parseTable, guessMapping, tableToItems, looksLikeJson, FIELD_KEYS, MULTI_FIELDS, type FieldKey, type Mapping, type ParsedTable } from "../domain/catalogimport";
import { detectShape, readList, type ListRead } from "../domain/listimport";
import { looksLikeOscal, parseOscalCatalog } from "../domain/oscal";
import { isExtractable, extractFileText } from "../domain/docextract";
import { isSpreadsheet, readWorkbook, sheetToCsv, type Sheet } from "../domain/xlsx";
import { useStore } from "../domain/store";
import { downloadText } from "../domain/clipboard";
import { Icon, Overlay } from "./ui";

const FIELD_LABEL: Record<FieldKey, string> = { ref_id: "Reference ID", title: "Title", category: "Category", description: "Description" };
/** A field's columns as a list, whichever form the mapping holds. */
const multiOf = (m: number | number[] | undefined): number[] =>
  m == null ? [] : Array.isArray(m) ? m.filter((i) => i >= 0) : m >= 0 ? [m] : [];

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
  const [msg, setMsg] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set()); // items the user un-checked
  /** A document read as a list, kept so its sections can be dropped without re-reading. */
  const [listRead, setListRead] = useState<ListRead | null>(null);
  /** Sections the user dropped. A standard's front matter is numbered like its clauses,
   *  so it arrives as entries; naming the section is how you tell them apart. */
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const [fetching, setFetching] = useState<string | null>(null);    // key of the catalogue being downloaded
  const [skipVocab, setSkipVocab] = useState<Set<string>>(new Set());
  const [vocabMode, setVocabMode] = useState<VocabularyMode>("add");
  const [srcLabel, setSrcLabel] = useState("");                     // the catalogue's own provenance line
  /** The sheets of a workbook. Published catalogues ship as several sheets - the
   *  controls, the evidence list, the assessment objectives - and which one is meant is
   *  the user's call, not a guess. */
  const [book, setBook] = useState<{ base: string; sheets: Sheet[] } | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const setTaxonomy = useStore((s) => s.setTaxonomy);

  const target = targets.find((t) => t.kind === kind) ?? targets[0];
  const existing = target ? study.entities.filter((e) => e.type === target.type.key) : [];

  /** Build the table from a list reading, leaving out the sections that were dropped. */
  const applyList = (r: ListRead, drop: Set<string>) => {
    const kept = r.items.filter((it) => !drop.has(it.section ?? ""));
    const headers = ["Reference ID", "Title", ...(r.markers.length ? ["Level"] : []), "Description", "Section"];
    const rows = kept.map((it) => [it.ref_id, it.title, ...(r.markers.length ? [it.marker ?? ""] : []), it.description ?? "", it.section ?? ""]);
    setTable({ headers, rows, delimiter: "\t" });
    setMap(guessMapping(headers, { rows }));
    setExcluded(new Set());
  };

  const parse = (raw: string, fallbackName: string) => {
    setMsg(null); setJsonItems(null); setTable(null); setExcluded(new Set());
    setListRead(null); setDropped(new Set()); setSkipVocab(new Set());
    if (!raw.trim()) return;
    if (looksLikeJson(raw)) {
      const oscal = looksLikeOscal(raw);
      try {
        const c = oscal ? parseOscalCatalog(raw, fallbackName || "Imported") : parseCatalog(raw, fallbackName || "Imported");
        setName(c.name); setJsonItems(c.items);
        // An OSCAL catalogue states its own version; a plain JSON catalogue does not.
        setSrcLabel("source" in c && typeof c.source === "string" ? c.source : "");
        if (oscal) {
          // Which properties actually land depends on the taxonomy, so report what the
          // file carries rather than claiming they were all used.
          const seen = new Set<string>();
          for (const it of c.items) for (const k of Object.keys(it.props ?? {})) seen.add(k);
          const taken = target ? [...seen].filter((k) => target.type.fields.some((f) => f.key === k)) : [];
          setMsg(`Read as an OSCAL catalogue: ${c.items.length} entries`
            + (seen.size ? ` · properties in the file: ${[...seen].sort().join(", ")}` : "")
            + (taken.length ? ` · taken into fields: ${taken.sort().join(", ")}` : seen.size ? " · none of them match a field of this entity type" : ""));
        }
      } catch (e) { setMsg((oscal ? "Not readable as OSCAL: " : "Invalid JSON: ") + (e instanceof Error ? e.message : String(e))); }
    } else {
      // Decide what the input IS before parsing it. Without this step arbitrary text -
      // the text layer of a PDF, say - is read as a delimited table and turns into
      // hundreds of rows of noise that look like a result.
      const probe = parseTable(raw);
      const shape = detectShape(raw, probe);
      if (shape.shape === "table") {
        setTable(probe); setMap(guessMapping(probe.headers, { rows: probe.rows })); setName(fallbackName || "Imported");
      } else if (shape.shape === "list") {
        const r = readList(raw);
        setListRead(r); setDropped(new Set());
        applyList(r, new Set());
        setName(fallbackName || "Imported");
        setMsg(`Read as a list: ${r.items.length} entries of the form ${r.pattern}`
          + (r.markers.length ? `, levels ${r.markers.join("/")}` : "")
          + (r.missed.length ? ` · ${r.missed.length} identifiers were not read as entries` : ""));
      } else {
        setMsg(`This does not look like a catalogue: ${shape.reason}. Paste a table, JSON, or a list where each entry starts with its identifier.`);
      }
    }
  };
  // A PDF or Word file has to be extracted, not read as text: reading the bytes as UTF-8
  // yields the compressed streams, which is neither a table nor a list and is rightly
  // refused - but for the wrong reason, and after the user has already chosen the file.
  /** Read one sheet of the workbook currently held. */
  const useSheet = (sheets: Sheet[], i: number, base: string) => {
    setSheetIdx(i);
    const csv = sheetToCsv(sheets[i]?.rows ?? []);
    if (!csv.trim()) { setTable(null); setMsg(`The sheet "${sheets[i]?.name}" is empty.`); return; }
    setText(csv.length < 200_000 ? csv : "");
    parse(csv, sheets.length > 1 ? `${base} — ${sheets[i].name}` : base);
  };

  const onFile = async (f: File) => {
    const base = f.name.replace(/\.[^.]+$/, "");
    if (isSpreadsheet(f.name, f.type)) {
      setMsg(`Reading ${f.name}…`);
      const sheets = (await readWorkbook(await f.arrayBuffer())).filter((sh) => sh.rows.length > 1);
      if (!sheets.length) {
        setBook(null);
        setMsg(`No sheet with any rows could be read from ${f.name}. `
          + "Only the current Excel format (.xlsx) can be read; an .xls or .ods file has to be saved as .xlsx or CSV first.");
        return;
      }
      setBook({ base, sheets });
      // The biggest sheet is the opening bid, never the final word - the picker below
      // says which one is showing and every other sheet is one press away.
      let big = 0;
      sheets.forEach((sh, i) => { if (sh.rows.length > sheets[big].rows.length) big = i; });
      useSheet(sheets, big, base);
      return;
    }
    setBook(null);
    if (!isExtractable(f.name, f.type)) {
      const raw = await f.text();
      setText(raw); parse(raw, base);
      return;
    }
    setMsg(`Reading ${f.name}…`);
    const raw = await extractFileText(f);
    if (!raw.trim()) {
      setText("");
      setMsg(`No text could be read from ${f.name}. A scanned document has no text layer; the text has to come from somewhere else.`);
      return;
    }
    setText(raw); parse(raw, base);
  };

  // Fetch a catalogue from the publisher that hosts it. Nothing here runs on its own:
  // the dialog does everything it does without ever reaching the network, and this is
  // the one path that does, on a press. The text is not put in the textarea when it is
  // large - a five-megabyte catalogue in a text box helps nobody and stalls the view.
  const download = async (pc: PublishedCatalog) => {
    setFetching(pc.key);
    setMsg(`Loading ${pc.name} from ${new URL(pc.url).host}…`);
    try {
      const raw = await fetchPublishedCatalog(pc, (loaded, total) => setMsg(
        `Loading ${pc.name}… ${(loaded / 1e6).toFixed(1)} MB${total ? ` of ${(total / 1e6).toFixed(1)} MB` : ""}`));
      setText(raw.length < 200_000 ? raw : "");
      parse(raw, pc.name);
    } catch (e) {
      setMsg(`${pc.name} could not be fetched: ${e instanceof Error ? e.message : String(e)}`
        + ". The published file can be imported from disk instead.");
    }
    setFetching(null);
  };


  const items: FrameworkItem[] = jsonItems ?? (table ? tableToItems(table, map) : []);
  const fw: Framework = { key: name || "imported", name: name || "Imported", source: srcLabel || "user import", items };

  // What this catalogue would change about the lists the taxonomy offers. Computed from
  // the parsed items, so it is the same whether they were pasted, chosen or downloaded.
  const vocabPlan: VocabularyChange[] = useMemo(
    () => (items.length ? planVocabularyUpdate(tax, fw, study.entities) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, tax, study.entities, name, srcLabel]);
  // Extending has nothing to do for a field this catalogue only takes values away from,
  // so that row is not offered in that mode - otherwise the panel would stay open on a
  // change that pressing the button cannot resolve.
  const vocabShown = vocabMode === "add" ? vocabPlan.filter((c) => c.added.length > 0) : vocabPlan;
  const vocabDefined = useMemo(() => (items.length ? catalogDefinesVocabulary(tax, fw) : false),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, tax, name, srcLabel]);
  const vocabPicked = vocabShown.map((c) => `${c.typeKey}.${c.fieldKey}`).filter((id) => !skipVocab.has(id));
  const applyVocab = () => {
    if (!vocabPicked.length) return;
    setTaxonomy(applyVocabularyUpdate(tax, vocabShown, vocabPicked, fw, undefined, vocabMode));
    setMsg(`${vocabMode === "replace" ? "Replaced" : "Extended"} ${vocabPicked.length} `
      + `vocabular${vocabPicked.length === 1 ? "y" : "ies"} from ${fw.name}.`);
  };
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
    <Overlay onClose={onClose}>
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
            Paste a table (CSV/TSV) or JSON, or choose a file — CSV, JSON, text, or a PDF or Word
            document, whose text is extracted first. Values are read <b>verbatim</b>; for a table
            you map columns to fields below. A document that is not a table is read as a list, one
            entry per identifier. JSON format:
            <code style={{ display: "block", marginTop: 6, whiteSpace: "pre-wrap" }}>{`{ "name": "…", "items": [ { "ref_id", "title", "category", "description" } ] }`}</code>
            <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => downloadText("catalog-template.json", TEMPLATE)}><Icon.download /> Download template</button>
          </div>

          {PUBLISHED_CATALOGS.length > 0 && (
            <div className="guide" style={{ marginBottom: 12 }}>
              <b>From the publisher.</b> The catalogue is fetched when you press this and not
              otherwise — the application asks for nothing on its own, and works without ever
              asking. On a machine with no network, import the published file from disk below.
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                {PUBLISHED_CATALOGS.map((pc) => (
                  <button key={pc.key} className="btn sm pub-cat" disabled={!!fetching} onClick={() => download(pc)}>
                    <Icon.download /> {fetching === pc.key ? "Loading…" : pc.name}{pc.size ? ` · ${pc.size}` : ""}
                  </button>
                ))}
              </div>
              <div className="hint" style={{ marginTop: 6 }}>
                {PUBLISHED_CATALOGS.map((p) => `${p.name} — ${p.source}`).join(" · ")}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <button className="btn sm" onClick={() => fileRef.current?.click()}><Icon.upload /> Choose file…</button>
            <input placeholder="Framework name (optional)" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
          </div>
          <textarea placeholder="…or paste CSV / TSV / JSON here" value={text} rows={6}
            onChange={(e) => setText(e.target.value)} onBlur={() => parse(text, name)} style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }} />
          <div style={{ marginTop: 6 }}><button className="btn sm" disabled={!text.trim()} onClick={() => parse(text, name)}>Parse</button></div>

          {/* Sections of the document. A standard numbers its front matter like its
              clauses, so an introduction arrives looking like a requirement; dropping the
              section it came from is what tells them apart. All are kept until you say
              otherwise - guessing which section is front matter would be a heuristic
              fitted to whichever document was to hand. */}
          {listRead && (() => {
            const counts = new Map<string, number>();
            for (const it of listRead.items) { const k = it.section ?? ""; counts.set(k, (counts.get(k) ?? 0) + 1); }
            if (counts.size < 2) return null;
            const kept = listRead.items.filter((it) => !dropped.has(it.section ?? "")).length;
            return (
              <div className="panel" style={{ marginTop: 14 }}>
                <div className="panel-head"><h3>Sections found</h3><span className="badge">{counts.size}</span>
                  <span className="spacer" /><span className="hint">{kept} of {listRead.items.length} entries</span></div>
                <div className="panel-body" style={{ padding: "10px 14px 12px", display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {[...counts].map(([sec, n]) => {
                    const on = !dropped.has(sec);
                    return (
                      <button key={sec || "_"} type="button" className={"chip facet-chip" + (on ? " on" : "")}
                        aria-pressed={on}
                        onClick={() => setDropped((d) => {
                          const next = new Set(d);
                          next.has(sec) ? next.delete(sec) : next.add(sec);
                          applyList(listRead, next);
                          return next;
                        })}>
                        {sec || <span className="hint">no section</span>} <span className="facet-n">{n}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {book && book.sheets.length > 1 && (
            <div className="panel" style={{ marginTop: 14 }}>
              <div className="panel-head"><h3>Sheet</h3><span className="badge">{book.sheets.length} in this workbook</span></div>
              <div className="panel-body" style={{ padding: "8px 14px 12px", display: "flex", flexWrap: "wrap", gap: 8 }}>
                {book.sheets.map((sh, i) => (
                  <button key={sh.name + i} className={"btn sm " + (i === sheetIdx ? "primary" : "ghost")}
                    onClick={() => useSheet(book.sheets, i, book.base)}>
                    {sh.name} <span className="badge">{sh.rows.length - 1}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {table && (
            <div className="panel" style={{ marginTop: 14 }}>
              <div className="panel-head"><h3>Map columns</h3><span className="badge">{table.rows.length} rows</span><span className="spacer" />
              </div>
              <div className="panel-body" style={{ padding: "8px 14px 12px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
                {FIELD_KEYS.map((f) => {
                  // The body may draw on several columns; the rest take one. A document
                  // read as a list often spreads one entry's text over more than one
                  // detected column, and picking a single one throws the rest away.
                  if (MULTI_FIELDS.includes(f)) {
                    const sel = multiOf(map[f]);
                    return (
                      <div key={f} className="field map-multi" style={{ margin: 0 }}>
                        <span className="hint">{FIELD_LABEL[f]}{sel.length > 1 ? ` · ${sel.length} columns` : ""}</span>
                        <div className="map-cols">
                          {table.headers.map((h, i) => {
                            const on = sel.includes(i);
                            return (
                              <button key={i} type="button" className={"chip facet-chip" + (on ? " on" : "")}
                                aria-pressed={on}
                                onClick={() => setMap((m) => {
                                  const cur = multiOf(m[f]);
                                  const next = cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i].sort((a, b) => a - b);
                                  return { ...m, [f]: next };
                                })}>
                                {h || `Column ${i + 1}`}
                              </button>
                            );
                          })}
                        </div>
                        {sel.length > 1 && (
                          <span className="hint">Joined in column order. A part that only repeats one already taken is left out.</span>
                        )}
                      </div>
                    );
                  }
                  const one = typeof map[f] === "number" ? (map[f] as number) : -1;
                  return (
                    <label key={f} className="field" style={{ margin: 0 }}>
                      <span className="hint">{FIELD_LABEL[f]}{f === "title" ? " *" : ""}</span>
                      <select value={one} onChange={(e) => setMap((m) => ({ ...m, [f]: Number(e.target.value) }))}>
                        <option value={-1}>— none —</option>
                        {table.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                      </select>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* The lists the taxonomy offers in its pickers belong to the publisher, not to
              this build. A catalogue that declares them can bring them up to date, which
              is the difference between a copy that ages silently and one that is dated. */}
          {/* Nothing to change is a result, not an absence: it says this build's lists are
              the ones the catalogue uses. Without it, a silent panel is indistinguishable
              from a check that never ran. */}
          {items.length > 0 && vocabShown.length === 0 && vocabDefined && (
            <div className="guide vocab-current" style={{ marginTop: 14 }}>
              The vocabularies this catalogue defines are already the ones this build offers —
              nothing to bring up to date.
            </div>
          )}
          {vocabShown.length > 0 && (
            <div className="panel vocab-panel" style={{ marginTop: 14 }}>
              <div className="panel-head"><h3>Vocabularies this catalogue defines</h3>
                <span className="badge">{vocabShown.length}</span><span className="spacer" />
                <span className="hint">the option lists of fields that name a source</span></div>
              <div className="panel-body" style={{ padding: "6px 14px 12px" }}>
                <div className="guide" style={{ marginBottom: 8 }}>
                  <b>Extend</b> adds what this catalogue has and keeps the rest. <b>Replace</b> takes
                  its list as the whole truth and drops what it does not name — right for the ruleset
                  the field belongs to, wrong for any other, because an unrelated catalogue lists none
                  of these terms without that meaning they were retired. Either way a value a record
                  still holds is kept, and records are not otherwise touched.
                  <div className="seg" style={{ marginTop: 8, width: "fit-content" }}>
                    <button className={"seg-btn" + (vocabMode === "add" ? " on" : "")} onClick={() => setVocabMode("add")}>Extend</button>
                    <button className={"seg-btn" + (vocabMode === "replace" ? " on" : "")} onClick={() => setVocabMode("replace")}>Replace</button>
                  </div>
                </div>
                {vocabShown.map((c) => {
                  const id = `${c.typeKey}.${c.fieldKey}`;
                  return (
                    <label key={id} className="ex-cand">
                      <input type="checkbox" style={{ width: "auto", marginTop: 3 }} checked={!skipVocab.has(id)}
                        onChange={() => setSkipVocab((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; })} />
                      <span style={{ flex: 1 }}>
                        <span className="ex-cand-name">{c.typeLabel} · {c.fieldLabel}{" "}
                          <span className="hint">({c.current.length} → {(vocabMode === "replace" ? c.mergedReplacing : c.merged).length})</span></span>
                        <span className="ex-cand-snip">
                          {c.added.length > 0 && <>{c.added.length} new: {c.added.slice(0, 8).join(", ")}{c.added.length > 8 ? " …" : ""}</>}
                          {c.added.length > 0 && c.removed.length > 0 && " — "}
                          {c.removed.length > 0 && <>{c.removed.length} not in this catalogue: {c.removed.slice(0, 8).join(", ")}{c.removed.length > 8 ? " …" : ""}
                            {vocabMode === "replace" ? " (dropped)" : " (kept)"}</>}
                          {c.keptInUse.length > 0 && vocabMode === "replace" && <> — {c.keptInUse.length} of those kept anyway, records hold them</>}
                        </span>
                      </span>
                      <span className="badge">{c.source}</span>
                    </label>
                  );
                })}
                <button className="btn sm vocab-apply" style={{ marginTop: 8 }} disabled={!vocabPicked.length} onClick={applyVocab}>
                  {vocabMode === "replace" ? "Replace" : "Extend"} {vocabPicked.length || ""} vocabular{vocabPicked.length === 1 ? "y" : "ies"}
                </button>
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
        <input ref={fileRef} type="file" accept=".csv,.tsv,.xlsx,.json,.txt,.md,.pdf,.docx,.xml" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      </div>
    </Overlay>,
    document.body,
  );
}
