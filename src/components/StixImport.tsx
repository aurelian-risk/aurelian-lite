// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Threat intelligence in: a STIX 2.1 bundle read as a graph, browsed in columns from
// its types to one object and what it relates to, chosen from, projected onto the
// study's types, adjusted, and handed to the import review.
//
// Columns, as a file browser has them. The first lists the bundle's types; a row pressed
// opens the next column to its right with what the row holds - a type's objects, an
// object's relations with the objects under each - and the pressed row stays marked, so
// the columns ARE the path: to go back, press a row further left and everything to its
// right goes. Choosing is the box on a row, never the press; a box on a relation's
// heading takes the whole group. A tray at the foot lists what is chosen. The LANDING is
// the second step, on the whole width: where the records go in the study's terms and the
// records themselves, editable. The third step is the review every import goes through.
import { useEffect, useMemo, useRef, useState } from "react";
import { t as tr, tn } from "../domain/i18n";
import type { Bundle, EntityRecord, FieldValue, Study, Taxonomy } from "../domain/types";
import { getType, recordTitle, typeLabel } from "../domain/taxonomy";
import { readStix, typeCounts, hops, touches, buckets, searchStix, labelOf, extId, tacticsOf, project, type StixIndex, type StixObject, type Projected, type Hop } from "../domain/stix";
import { STIX_RULES, STIX_NOT_MAPPED } from "../profile";
import { TACTICS } from "../domain/mitre";
import { FieldInput, type RefOption } from "./FieldInput";
import { BundleFacts, WorkshopStrip, Landing, Weave, colourOf } from "./StixViews";

/** Where a column stands: on a type (perhaps one of its buckets) or on an object. The
 *  path of these is the row of columns to the right of the types. */
type Stop = { kind: "type"; type: string } | { kind: "object"; id: string };
/** A relation group shows this many rows before "… n more". */
const SHOW = 12;

const ruleFor = (t: string) => STIX_RULES.find((r) => r.stixType === t);

/** The second line under an object in a list: what tells two of a type apart. */
function subline(o: StixObject): string {
  if (o.type === "identity") return [(o.identity_class as string), ...((o.sectors as string[]) ?? [])].filter(Boolean).join(" · ");
  if (o.type === "attack-pattern") return tacticsOf(o).join(", ");
  if (o.type === "intrusion-set" || o.type === "threat-actor") return ((o.aliases as string[]) ?? []).filter((a) => a !== o.name).slice(0, 4).join(", ");
  if (o.type === "campaign") return [o.first_seen, o.last_seen].filter(Boolean).map((d) => String(d).slice(0, 10)).join(" → ");
  if (o.type === "malware" || o.type === "tool") return ((o.malware_types as string[]) ?? (o.tool_types as string[]) ?? []).join(", ");
  return extId(o) ?? "";
}

export interface StixHandoff { bundle: Bundle; note: string; source: string }

export function StixImport({ tax, study, text, source, onBack, onReview }: {
  tax: Taxonomy; study: Study; text: string; source: string; onBack: () => void; onReview: (h: StixHandoff) => void;
}) {
  const [ix, setIx] = useState<StixIndex | null>(null);
  const [status, setStatus] = useState("");
  const [step, setStep] = useState<"explore" | "landing">("explore");
  /** The columns open to the right of the types: a type, then objects opened in turn. */
  const [path, setPath] = useState<Stop[]>([]);
  /** The search in each column, by column index. */
  const [query, setQuery] = useState<Record<number, string>>({});
  /** Relation groups shown in full, by "column:group". */
  const [more, setMore] = useState<Set<string>>(new Set());
  const columnsRef = useRef<HTMLDivElement | null>(null);
  /** The search across the whole bundle; while it has text, the first column is its hits. */
  const [search, setSearch] = useState("");
  const [showWeave, setShowWeave] = useState(true);
  /** Chosen object ids, in the order chosen. */
  const [picked, setPicked] = useState<string[]>([]);
  const [edits, setEdits] = useState<Record<string, Record<string, FieldValue>>>({});
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const [scenario, setScenario] = useState<string>("");
  /** For a record that touches an existing one by name: the existing id to update, or ""
   *  to create beside it (the default - a name in common is a suggestion, not proof). */
  const [resolve, setResolveState] = useState<Record<string, string>>({});
  const setResolve = (recordId: string, existingId: string) => setResolveState((r) => ({ ...r, [recordId]: existingId }));

  useEffect(() => {
    try { setIx(readStix(text)); setStatus(""); }
    catch (e) { setIx(null); setStatus(tr("ui.stix.could-not-read", "Could not read: ") + (e instanceof Error ? e.message : String(e))); }
  }, [text]);

  /** Open a row of column `i`: the columns right of it are replaced by the one it holds.
   *  An object already open in a column further left is not opened again - relations run
   *  both ways, and a loader that beacons to a server that hosts the loader would open
   *  the same two columns for ever. Its row leads back to where it is open. */
  const [flash, setFlash] = useState<number | null>(null);
  /** Draw the eye to a column: scroll it into view and light it up for a moment. What a
   *  click on an "already open" row does has to be SEEN, or the row is a dead button. */
  const showColumn = (i: number) => {
    setFlash(i);
    window.setTimeout(() => setFlash((f) => (f === i ? null : f)), 700);
    window.setTimeout(() => columnsRef.current?.querySelectorAll(".stix-col")[i]?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" }), 30);
  };
  const openAt = (i: number, s: Stop) => {
    const j = s.kind === "object" ? path.findIndex((x) => x.kind === "object" && x.id === s.id) : -1;
    if (j >= 0) { setPath(path.slice(0, j + 1)); showColumn(j + 1); }
    else setPath([...path.slice(0, i), s]);
    setQuery((q) => { const n = { ...q }; for (const k of Object.keys(n)) if (Number(k) > i) delete n[Number(k)]; return n; });
  };
  /** The column (1-based, the types being 0) an object is open in, if any. */
  const openIn = (id: string) => { const j = path.findIndex((x) => x.kind === "object" && x.id === id); return j >= 0 ? j + 1 : -1; };
  useEffect(() => { const el = columnsRef.current; if (el) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" }); }, [path.length]);
  const toggle = (id: string) => setPicked((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const toggleGroup = (h: Hop) => setPicked((p) => {
    const ids = h.items.map((i) => i.id);
    const all = ids.every((i) => p.includes(i));
    return all ? p.filter((x) => !ids.includes(x)) : [...p, ...ids.filter((i) => !p.includes(i))];
  });
  const toggleDrop = (id: string) => setDropped((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ── the projection ─────────────────────────────────────────────────────────
  const projected = useMemo((): Projected[] => {
    if (!ix) return [];
    const out: Projected[] = [];
    for (const id of picked) {
      const o = ix.objects.get(id); const r = o && ruleFor(o.type);
      if (o && r) out.push(project(ix, o, r));
    }
    // Steps: attached to the chosen scenario, in the tactic's place in the matrix, then
    // in the order chosen. A proposal, said so in the gap list, not a chain.
    const scnRec = out.find((p) => p.type === "operational_scenario");
    const scn = scenario === "@campaign" ? scnRec?.id : scenario || undefined;
    const steps = out.filter((p) => p.type === "kill_chain_step");
    steps.sort((a, b) => TACTICS.indexOf(String(a.values.tactic)) - TACTICS.indexOf(String(b.values.tactic)));
    steps.forEach((p, i) => {
      p.values.step_order = i + 1;
      if (scn) p.values.operational_scenario = scn; else p.gaps.push({ field: "operational_scenario", why: tr("ui.stix.gap-scenario", "choose the scenario these steps belong to") });
    });
    return out;
  }, [ix, picked, scenario]);
  const records = useMemo(() => projected.filter((p) => !dropped.has(p.id)).map((p) => ({ ...p, values: { ...p.values, ...(edits[p.id] ?? {}) } })), [projected, edits, dropped]);
  const touchList = useMemo(() => touches(records, study.entities, (e) => { const t = getType(tax, e.type); return t ? recordTitle(t, e as EntityRecord) : e.id; }), [records, study, tax]);
  const gapCount = records.reduce((n, p) => n + p.gaps.filter((g) => edits[p.id]?.[g.field] === undefined).length, 0);
  const refOptions = (typeKey: string): RefOption[] => [
    ...records.filter((p) => p.type === typeKey).map((p) => ({ id: p.id, label: String(p.values.name ?? p.id), group: tr("ui.stix.from-this-import", "from this import") })),
    ...study.entities.filter((e) => e.type === typeKey).map((e) => ({ id: e.id, label: recordTitle(getType(tax, e.type)!, e) })),
  ];
  const go = () => {
    const ts = new Date().toISOString();
    const entities: EntityRecord[] = records.map((p) => {
      const ex = resolve[p.id] ? study.entities.find((e) => e.id === resolve[p.id]) : undefined;
      return ex ? { ...ex, values: { ...ex.values, ...p.values }, updatedAt: ts, source: p.source }
        : { id: p.id, type: p.type, values: p.values, createdAt: ts, updatedAt: ts, source: p.source };
    });
    onReview({
      bundle: { kind: "ebios-data", version: 2, studies: [{ id: study.id, entities } as Study] },
      note: tr("ui.stix.review-note", "Records projected from the STIX bundle. Additive: they are added to the open study, or update the record an earlier import of the same object wrote."),
      source: source || "STIX",
    });
  };

  if (!ix) return <><div className="modal-lg-body">{status && <div className="guide warn">{status}</div>}</div><footer className="modal-lg-foot"><button className="btn ghost" onClick={onBack}>‹ {tr("ui.import.back", "Back")}</button></footer></>;

  const counts = typeCounts(ix);
  const found = search.trim() ? searchStix(ix, search.trim()) : null;
  const foundN = found ? found.reduce((n, g) => n + g.hits.length, 0) : 0;
  const scenarios = study.entities.filter((e) => e.type === "operational_scenario");
  const q = (i: number) => (query[i] ?? "").trim().toLowerCase();
  const hit = (o: StixObject, i: number) => !q(i) || (labelOf(o) + " " + subline(o) + " " + String(o.description ?? "")).toLowerCase().includes(q(i));
  const becomes = (t: string) => { const r = ruleFor(t); return r ? typeLabel(getType(tax, r.entityType)!) : null; };

  /** One object as a row: the box where it becomes something, the label, and the press
   *  that opens it in the next column. `open` marks the row whose column is showing. */
  const Row = ({ o, i, open }: { o: StixObject; i: number; open: boolean }) => {
    const r = ruleFor(o.type);
    const at = openIn(o.id);
    // Open somewhere already: to the left, the row leads back there (the columns after it
    // go); to the right, it is the row this column opened - a click shows that column.
    const back = at >= 0 && at < i;
    const title = back ? tr("ui.stix.goes-back", "goes back to column {0}").replace("{0}", String(at))
      : open ? tr("ui.stix.is-open", "open in column {0} - click shows it").replace("{0}", String(at))
      : tr("ui.stix.click-open", "click: open");
    return (
      <div className={"stix-row" + (open ? " open" : "") + (back ? " back" : "") + (picked.includes(o.id) ? " on" : "") + (r ? "" : " dim")}>
        {r ? <input type="checkbox" checked={picked.includes(o.id)} onChange={() => toggle(o.id)} title={tr("ui.stix.box-choose", "click to choose")} /> : <span className="stix-nocheck" />}
        <button className="stix-row-open" onClick={() => openAt(i, { kind: "object", id: o.id })} title={title}>
          <span className="stix-row-name">{labelOf(o)}</span>
          <span className="stix-row-sub">{back ? tr("ui.stix.open-left", "◂ back to column {0}").replace("{0}", String(at)) : subline(o)}</span>
          <span className="stix-row-chev">{back ? "◂" : "›"}</span>
        </button>
      </div>
    );
  };

  /** The column of a type: its objects, in buckets where there are too many to list. */
  const colClass = (i: number) => "stix-col" + (flash === i ? " flash" : "");
  const TypeColumn = ({ type, i }: { type: string; i: number }) => {
    const all = ix.byType.get(type) ?? [];
    const bk = all.length > 40 ? buckets(all, TACTICS) : [{ key: "all", label: "", items: all }];
    const next = path[i]?.kind === "object" ? path[i] as { kind: "object"; id: string } : null;
    let shown = 0;
    return (
      <div className={colClass(i)}>
        <div className="stix-col-head">
          <span className="mono">{type}</span>
          <span className="stix-becomes">{becomes(type) ? `→ ${becomes(type)}` : STIX_NOT_MAPPED[type] ?? tr("ui.stix.not-mapped", "not mapped")}</span>
          {all.length > SHOW && <input className="stix-search" placeholder={tr("ui.stix.filter", "filter…")} value={query[i] ?? ""} onChange={(e) => setQuery((qq) => ({ ...qq, [i]: e.target.value }))} />}
        </div>
        <div className="stix-col-body">
          {bk.map((b) => {
            const items = b.items.filter((o) => hit(o, i));
            if (!items.length) return null;
            const key = `${i}:${b.key}`;
            const list = more.has(key) || q(i) ? items : items.slice(0, 40);
            shown += list.length;
            return (
              <div key={b.key} className="stix-group">
                {b.label && <div className="stix-group-head"><span>{b.label}</span><span className="stix-count">{items.length}</span></div>}
                {list.map((o) => <Row key={o.id} o={o} i={i} open={next?.id === o.id} />)}
                {list.length < items.length && <button className="stix-more" onClick={() => setMore((m) => new Set(m).add(key))}>… {tn("ui.stix.more", items.length - list.length, "{0} more", "{0} more")}</button>}
              </div>
            );
          })}
          {shown === 0 && <div className="menu-hint" style={{ padding: 8 }}>{tr("ui.stix.no-hit", "nothing matches")}</div>}
        </div>
      </div>
    );
  };

  /** The column of an object: its card, then its relations as headed groups. */
  const ObjectColumn = ({ id, i }: { id: string; i: number }) => {
    const o = ix.objects.get(id)!;
    const r = ruleFor(o.type);
    // What becomes a record first; the context after.
    const groups = [...hops(ix, o.id)].sort((a, b) => (ruleFor(a.type) ? 0 : 1) - (ruleFor(b.type) ? 0 : 1));
    const choosable = !!r || groups.some((h) => ruleFor(h.type));
    const next = path[i]?.kind === "object" ? path[i] as { kind: "object"; id: string } : null;
    return (
      <div className={colClass(i)}>
        <div className="stix-col-head stix-card">
          <div className="stix-card-type"><span className="mono">{o.type}</span> {r ? <span className="stix-becomes">→ {typeLabel(getType(tax, r.entityType)!)}</span> : <span className="stix-becomes">{tr("ui.stix.not-mapped", "not mapped")}</span>}</div>
          <div className="stix-card-name">
            {r && <input type="checkbox" checked={picked.includes(o.id)} onChange={() => toggle(o.id)} title={tr("ui.stix.box-choose", "click to choose")} />}
            <strong>{labelOf(o)}</strong>
          </div>
          {o.description && <p className="stix-desc">{String(o.description).slice(0, 280)}{String(o.description).length > 280 ? "…" : ""}</p>}
          {!r && <p className="menu-hint">{STIX_NOT_MAPPED[o.type] ?? tr("ui.stix.no-rule", "no rule for this type")}</p>}
          {!choosable && <p className="stix-nothing">{tr("ui.stix.nothing-here", "Nothing in this column becomes a record - it is context. Open a row to go on, or a row further left to go back.")}</p>}
          {groups.reduce((n, g) => n + g.items.length, 0) > SHOW && <input className="stix-search" placeholder={tr("ui.stix.filter", "filter…")} value={query[i] ?? ""} onChange={(e) => setQuery((qq) => ({ ...qq, [i]: e.target.value }))} />}
        </div>
        <div className="stix-col-body">
          {!groups.length && <div className="menu-hint" style={{ padding: 8 }}>{tr("ui.stix.no-relations", "no relationships from here")}</div>}
          {groups.map((h) => {
            const hr = ruleFor(h.type);
            const items = h.items.filter((x) => hit(x, i));
            if (!items.length) return null;
            const key = `${i}:${h.dir}:${h.rel}:${h.type}`;
            const list = more.has(key) || q(i) ? items : items.slice(0, SHOW);
            const all = h.items.every((x) => picked.includes(x.id)), some = h.items.some((x) => picked.includes(x.id));
            return (
              <div key={key} className="stix-group">
                <div className="stix-group-head rel">
                  {hr ? <input type="checkbox" checked={all} ref={(el) => { if (el) el.indeterminate = some && !all; }} onChange={() => toggleGroup(h)} title={tr("ui.stix.box-group", "choose the whole group")} /> : <span className="stix-nocheck" />}
                  <span className="mono stix-rel">{h.dir === "out" ? `${h.rel} →` : `← ${h.rel}`}</span>
                  <span className="mono">{h.type}</span>
                  <span className="stix-count">{h.items.length}</span>
                  <span className="stix-becomes">{hr ? `→ ${typeLabel(getType(tax, hr.entityType)!)}` : tr("ui.stix.not-mapped", "not mapped")}</span>
                </div>
                {list.map((x) => <Row key={x.id} o={x} i={i} open={next?.id === x.id} />)}
                {list.length < items.length && <button className="stix-more" onClick={() => setMore((m) => new Set(m).add(key))}>… {tn("ui.stix.more", items.length - list.length, "{0} more", "{0} more")}</button>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <>
      {step === "explore" ? (
        <div className="stix-body">
          <div className="stix-topline">
            <span>{source} · {tn("ui.stix.objects", ix.bundle.objects, "{0} object", "{0} objects")}{ix.aside.revoked ? ` · ${ix.aside.revoked} ${tr("ui.stix.revoked", "revoked")}` : ""}</span>
            <BundleFacts ix={ix} />
          </div>
          <div className="stix-columns" ref={columnsRef}>
            <div className="stix-col stix-col-types">
              <div className="stix-col-head stix-searchbar">
                <input className="stix-search" placeholder={tr("ui.stix.search-all", "search the bundle…")} value={search} onChange={(e) => setSearch(e.target.value)} />
                {found && <span className="stix-count">{tn("ui.stix.hits", foundN, "{0} hit", "{0} hits")}</span>}
                {found && <button className="btn ghost sm" onClick={() => setSearch("")}>×</button>}
              </div>
              <div className="stix-col-body">
                {found ? (
                  found.length === 0 ? <div className="menu-hint" style={{ padding: 8 }}>{tr("ui.stix.no-hit", "nothing matches")}</div>
                  : found.map((g) => (
                    <div key={g.type} className="stix-group">
                      <div className="stix-group-head"><span className="stix-dot" style={{ background: colourOf(tax, ruleFor(g.type)) }} /><span className="mono">{g.type}</span><span className="stix-count">{g.hits.length}</span><span className="stix-becomes">{becomes(g.type) ? `→ ${becomes(g.type)}` : tr("ui.stix.not-mapped", "not mapped")}</span></div>
                      {g.hits.slice(0, 30).map((h) => {
                        const open = path[0]?.kind === "type" && path[0].type === g.type && path[1]?.kind === "object" && path[1].id === h.obj.id;
                        return (
                          <div key={h.obj.id} className={"stix-row" + (open ? " open" : "") + (picked.includes(h.obj.id) ? " on" : "") + (ruleFor(g.type) ? "" : " dim")}>
                            {ruleFor(g.type) ? <input type="checkbox" checked={picked.includes(h.obj.id)} onChange={() => toggle(h.obj.id)} /> : <span className="stix-nocheck" />}
                            <button className="stix-row-open" onClick={() => setPath([{ kind: "type", type: g.type }, { kind: "object", id: h.obj.id }])} title={tr("ui.stix.click-open", "click: open")}>
                              <span className="stix-row-name">{labelOf(h.obj)}</span>
                              <span className="stix-row-sub">{h.where === "description" ? tr("ui.stix.in-text", "in the text") : subline(h.obj)}</span>
                              <span className="stix-row-chev">›</span>
                            </button>
                          </div>
                        );
                      })}
                      {g.hits.length > 30 && <div className="menu-hint" style={{ padding: "2px 10px 6px 36px" }}>… {g.hits.length - 30} {tr("ui.stix.more-narrow", "more - narrow the search")}</div>}
                    </div>
                  ))
                ) : counts.map((c) => (
                  <button key={c.type} className={"stix-row stix-row-type" + (path[0]?.kind === "type" && path[0].type === c.type ? " open" : "") + (ruleFor(c.type) ? "" : " dim")} onClick={() => openAt(0, { kind: "type", type: c.type })}>
                    <span className="stix-dot" style={{ background: colourOf(tax, ruleFor(c.type)) }} />
                    <span className="stix-row-name mono">{c.type}</span>
                    <span className="stix-count">{c.count}</span>
                    <span className="stix-becomes">{becomes(c.type) ? `→ ${becomes(c.type)}` : tr("ui.stix.not-mapped", "not mapped")}</span>
                    <span className="stix-row-chev">›</span>
                  </button>
                ))}
              </div>
            </div>
            {path.map((s, i) => s.kind === "type" ? <TypeColumn key={"t" + i + s.type} type={s.type} i={i + 1} /> : <ObjectColumn key={"o" + i + s.id} id={s.id} i={i + 1} />)}
          </div>
          <div className={"stix-tray" + (picked.length ? "" : " empty")}>
            <div className="stix-tray-line">
              <strong>{tn("ui.stix.picked", picked.length, "{0} chosen", "{0} chosen")}</strong>
              {picked.length > 0 && <span className="menu-hint">→ {tn("ui.stix.records", records.length, "{0} record", "{0} records")}{gapCount ? ` · ${tn("ui.stix.gaps", gapCount, "{0} gap", "{0} gaps")}` : ""}</span>}
              {picked.length > 0 && <WorkshopStrip tax={tax} study={study} records={records} onlyGaining />}
              {picked.length > 0 && <button className="btn ghost sm" onClick={() => setPicked([])}>{tr("ui.stix.clear", "clear")}</button>}
              {!picked.length && <span className="menu-hint">{tr("ui.stix.tray-empty", "the box on a row puts it here")}</span>}
            </div>
            {picked.length > 0 && (
              <div className="stix-chips">
                {picked.slice(0, 20).map((id) => { const o = ix.objects.get(id)!; return (
                  <span key={id} className="stix-chip" style={{ ["--ws-color" as string]: colourOf(tax, ruleFor(o.type)) }}>
                    <button className="stix-chip-name" onClick={() => setPath([{ kind: "type", type: o.type }, { kind: "object", id }])} title={tr("ui.stix.click-open", "click: open")}>{labelOf(o)}</button>
                    <button className="stix-chip-x" onClick={() => toggle(id)} aria-label={tr("ui.stix.box-unchoose", "chosen - click to leave out")}>×</button>
                  </span>
                ); })}
                {picked.length > 20 && <span className="menu-hint">+{picked.length - 20}</span>}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="modal-lg-body stix-landing-step">
          <section className="stix-section">
            <h4>{tr("ui.stix.sec-where", "Where the records land")}</h4>
            <WorkshopStrip tax={tax} study={study} records={records} />
            <p className="menu-hint">{tr("ui.stix.ws-legend", "Per workshop: what this import adds, beside what the study already holds there. Only the records below are written; the rest of the study is untouched.")}</p>
          </section>
          {picked.length > 1 && (
            <section className="stix-section">
              <h4>{tr("ui.stix.sec-weave", "What the bundle connects")} <button className="btn ghost sm" onClick={() => setShowWeave((v) => !v)}>{showWeave ? tr("ui.stix.hide", "hide") : tr("ui.stix.show", "show")}</button></h4>
              {showWeave && <Weave ix={ix} tax={tax} ids={picked} ruleFor={ruleFor} />}
            </section>
          )}
          {projected.some((p) => p.type === "kill_chain_step") && (
            <section className="stix-section">
              <h4>{tr("ui.stix.sec-chain", "The chain")}</h4>
              <label className="stix-scn">
                <span>{tr("ui.stix.steps-into", "Steps belong to")}</span>
                <select value={scenario} onChange={(e) => setScenario(e.target.value)}>
                  <option value="">{tr("ui.stix.no-scenario", "— no scenario yet")}</option>
                  {projected.some((p) => p.type === "operational_scenario") && <option value="@campaign">{tr("ui.stix.the-campaign", "the campaign in this selection")}</option>}
                  {scenarios.map((s) => <option key={s.id} value={s.id}>{recordTitle(getType(tax, s.type)!, s)}</option>)}
                </select>
              </label>
              <Landing tax={tax} study={study} records={projected} touchList={[]} resolve={resolve} setResolve={setResolve} dropped={dropped} toggleDrop={toggleDrop} lanesOnly />
            </section>
          )}
          {touchList.length > 0 && (
            <section className="stix-section">
              <h4>{tr("ui.stix.touches", "Touches what is already there")}</h4>
              <Landing tax={tax} study={study} records={projected} touchList={touchList} resolve={resolve} setResolve={setResolve} dropped={dropped} toggleDrop={toggleDrop} touchesOnly />
            </section>
          )}
          <section className="stix-section">
            <h4>{tr("ui.stix.sec-records", "The records")} <span className="stix-count">{records.length}{gapCount ? ` · ${tn("ui.stix.gaps", gapCount, "{0} gap", "{0} gaps")}` : ""}</span></h4>
            <div className="stix-records">
              {projected.map((p) => {
                const t = getType(tax, p.type)!;
                const off = dropped.has(p.id);
                const vals = { ...p.values, ...(edits[p.id] ?? {}) };
                const gaps = p.gaps.filter((g) => edits[p.id]?.[g.field] === undefined);
                return (
                  <details key={p.id} className={"stix-rec" + (off ? " off" : "")}>
                    <summary className="stix-rec-head">
                      <input type="checkbox" checked={!off} onClick={(e) => e.stopPropagation()} onChange={() => toggleDrop(p.id)} />
                      <span className="stix-rec-type" style={{ ["--ws-color" as string]: tax.groups.find((g) => g.key === t.group)?.color }}>{typeLabel(t)}</span>
                      <strong className="stix-rec-name">{String(vals.name ?? "")}</strong>
                      <span className="stix-rec-note">
                        {gaps.length > 0 && !off && <span className="stix-gap">⚠ {gaps.map((g) => t.fields.find((f) => f.key === g.field)?.label ?? g.field).join(", ")}</span>}
                        {resolve[p.id] ? <span className="stix-exists">{tr("ui.stix.will-update", "updates an existing record")}</span>
                          : study.entities.some((e) => e.id === p.id) && <span className="stix-exists">{tr("ui.stix.updates", "updates an earlier import")}</span>}
                      </span>
                      <span className="stix-rec-chev">›</span>
                    </summary>
                    {!off && (
                      <div className="stix-fields">
                        {t.fields.filter((f) => f.key in p.values || p.gaps.some((g) => g.field === f.key)).map((f) => {
                          const gap = p.gaps.find((g) => g.field === f.key);
                          const edited = edits[p.id]?.[f.key] !== undefined;
                          return (
                            <div key={f.key} className={"stix-field" + (gap && !edited ? " gap" : "") + (f.type === "textarea" ? " wide" : "")}>
                              <label title={gap?.why}>{f.label}{gap && !edited && <span className="stix-gap"> ⚠ {gap.why}</span>}</label>
                              <FieldInput field={f} type={t} value={vals[f.key] ?? null} refOptions={refOptions} siblings={vals}
                                onChange={(v) => setEdits((e) => ({ ...e, [p.id]: { ...(e[p.id] ?? {}), [f.key]: v } }))} />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </details>
                );
              })}
              {!projected.length && <div className="guide">{tr("ui.stix.nothing-yet", "Nothing to write yet: nothing is chosen. Go back and choose techniques, campaigns or actors in the bundle.")}</div>}
            </div>
          </section>
        </div>
      )}
      <footer className="modal-lg-foot stix-foot">
        <button className="btn ghost" onClick={step === "landing" ? () => setStep("explore") : onBack}>‹ {step === "landing" ? tr("ui.stix.step-explore", "Explore") : tr("ui.stix.other-source", "Other source")}</button>
        <div className="stix-foot-mid">
          <ol className="stix-steps">
            <li className={step === "explore" ? "here" : "done"}>{tr("ui.stix.step-explore", "Explore")}</li>
            <li className={step === "landing" ? "here" : ""}>{tr("ui.stix.step-landing", "Landing")}</li>
            <li>{tr("ui.stix.step-review", "Review")}</li>
          </ol>
          {step === "explore" && <span className="menu-hint">{tr("ui.stix.gesture", "a row opens the next column · the box chooses · a row further left leads back")}</span>}
        </div>
        {step === "explore"
          ? <button className="btn primary" disabled={!records.length} onClick={() => setStep("landing")}>{tr("ui.stix.to-landing", "Landing")} ({records.length}) →</button>
          : <button className="btn primary" disabled={!records.length} onClick={go}>{tr("ui.stix.review", "Review import")} ({records.length}) →</button>}
      </footer>
    </>
  );
}
