// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// One search box for the whole study, opened from the top bar or with Ctrl/Cmd-K.
//
// The workshop tabs are how the METHOD is walked; they are not how a half-remembered word
// is found. This sits above them: type a word, get every record that carries it, from any
// workshop and any type, each hit saying where it came from and what it looked like
// there. Narrowing is by workshop and by type, as chips - a fixed set whose numbers
// narrow, never a set that changes shape under the pointer (the same rule the tables
// follow, for the same reason).
//
// The matching lives in domain/search.ts and is checked by `npm run test:search`; this
// file is the surface only.
import { useEffect, useMemo, useRef, useState } from "react";
import { t as tr, tn } from "../domain/i18n";
import type { EntityRecord, Study, Taxonomy } from "../domain/types";
import { getType, groupLabel, recordTitle, typeLabel } from "../domain/taxonomy";
import { firstTerm, searchCounts, searchStudy, type Hit } from "../domain/search";
import { displayValue } from "./TableTools";
import { fieldLabel } from "../domain/taxonomy";
import type { FieldDef } from "../domain/types";
import { EntityModal } from "./EntityModal";
import { Icon, Overlay } from "./ui";

/** The matched part of a snippet, marked. Two plain slices and a `<mark>` - never
 *  `dangerouslySetInnerHTML`, which would let a record's own text become markup. */
function Marked({ text, from, to }: { text: string; from: number; to: number }) {
  return (
    <>
      {text.slice(0, from)}<mark>{text.slice(from, to)}</mark>{text.slice(to)}
    </>
  );
}

/** Every occurrence of the term marked - for the opened preview, where the whole field
 *  is shown and the second occurrence is as much the reason for the hit as the first. */
function MarkedAll({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  const low = text.toLowerCase();
  let at = 0, i = 0;
  for (let hit = low.indexOf(term); hit >= 0; hit = low.indexOf(term, hit + term.length)) {
    parts.push(text.slice(at, hit), <mark key={i++}>{text.slice(hit, hit + term.length)}</mark>);
    at = hit + term.length;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}

const PREVIEW_CHARS = 420;

/** The opened row: the record's text fields with the term marked, its scalar values as a
 *  row of label/value pairs, and where to go from here. Short on purpose - it answers "is
 *  this the one I meant", and the row below the button answers everything else. */
function Preview({ h, term, tax, study, onGo, onLook }:
  { h: Hit; term: string; tax: Taxonomy; study: Study; onGo: () => void; onLook: () => void }) {
  const titleKey = h.type.titleField ?? "name";
  const texts: { f: FieldDef; s: string }[] = [];
  const scalars: { f: FieldDef; s: string }[] = [];
  for (const f of h.type.fields) {
    if (f.key === titleKey) continue;
    const v = h.record.values[f.key];
    if (f.type === "ref" || f.type === "multiref") {
      const ids = Array.isArray(v) ? (v as string[]) : typeof v === "string" && v ? [v] : [];
      const names = ids.map((id) => { const r = study.entities.find((e) => e.id === id); const t = r && getType(tax, r.type); return r && t ? recordTitle(t, r) : ""; }).filter(Boolean);
      if (names.length) scalars.push({ f, s: names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${names.length - 3}` : "") });
      continue;
    }
    const s = displayValue(f, v ?? null);
    if (!s) continue;
    if (f.type === "textarea") texts.push({ f, s: s.length > PREVIEW_CHARS ? s.slice(0, PREVIEW_CHARS - 1) + "…" : s });
    else scalars.push({ f, s });
  }
  return (
    <div className="gs-preview" onClick={(e) => e.stopPropagation()}>
      {texts.map(({ f, s }) => (
        <div key={f.key} className="gs-pv-text">
          <span className="gs-field">{fieldLabel(f, h.type)}</span>
          <p><MarkedAll text={s} term={term} /></p>
        </div>
      ))}
      {scalars.length > 0 && (
        <dl className="gs-pv-facts">
          {scalars.slice(0, 6).map(({ f, s }) => (
            <div key={f.key}><dt>{fieldLabel(f, h.type)}</dt><dd><MarkedAll text={s} term={term} /></dd></div>
          ))}
        </dl>
      )}
      <div className="gs-pv-actions">
        {h.group && (
          <button className="btn primary sm gs-go" onClick={onGo}>
            {tr("ui.search.in-workshop", "Go to the row")} →
          </button>
        )}
        <button className="btn ghost sm" onClick={onLook}>{tr("ui.search.open", "Quick look")}</button>
      </div>
    </div>
  );
}

/** What was typed and which chips were on. Held by the caller, not here: the sheet is
 *  unmounted when it closes, and a reader who jumped to a row and comes back for the next
 *  hit must find the search as they left it - the same words, the same chips, the same
 *  cards - not an empty box. The hits themselves are not kept: they are recomputed from
 *  the study, so a record edited in between shows as it is now. */
export interface SearchState { query: string; groups: string[]; types: string[] }
export const EMPTY_SEARCH: SearchState = { query: "", groups: [], types: [] };

export function SearchSheet({ tax, study, state, onState, onGoto, onClose }:
  { tax: Taxonomy; study: Study; state: SearchState; onState: (s: SearchState) => void;
    onGoto: (groupKey: string, id: string) => void; onClose: () => void }) {
  const { query, groups, types } = state;
  const setQuery = (query: string) => onState({ ...state, query });
  const setGroups = (groups: string[]) => onState({ ...state, groups });
  const setTypes = (types: string[]) => onState({ ...state, types });
  const [rec, setRec] = useState<EntityRecord | null>(null);
  const [cursor, setCursor] = useState(0);
  // The one row that is unfolded. One at a time: a list where three previews are open is
  // the grid this replaced.
  const [openId, setOpenId] = useState<string | null>(null);
  const term = firstTerm(query);
  const box = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  // Focus with the old words selected: typing replaces them, Enter or an arrow keeps them.
  useEffect(() => { box.current?.focus(); box.current?.select(); }, []);

  const filters = useMemo(() => ({ groups, types }), [groups, types]);
  const hits = useMemo(() => searchStudy(tax, study, query, displayValue, filters), [tax, study, query, filters]);
  const counts = useMemo(() => searchCounts(tax, study, query, displayValue, filters), [tax, study, query, filters]);
  // A narrowed list is a different list: keep the cursor inside it rather than pointing
  // at a card that is no longer drawn.
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } setCursor(0); setOpenId(null); }, [query, groups, types]);

  const toggle = (arr: string[], set: (v: string[]) => void, key: string) =>
    set(arr.includes(key) ? arr.filter((k) => k !== key) : [...arr, key]);

  // A card goes to the row: the workshop opens on it, unfolded, scrolled into view and
  // marked. Anything less sends the reader into the workshop to search a second time.
  // The modal is the quick look for a hit that only needs reading, not visiting.
  const open = (h: Hit) => setRec(h.record);
  const goto = (h: Hit) => {
    if (!h.type.group) { open(h); return; }
    onGoto(h.type.group, h.record.id);
    onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!hits.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.max(0, Math.min(hits.length - 1, cursor + (e.key === "ArrowDown" ? 1 : -1)));
      setCursor(next);
      list.current?.querySelectorAll(".gs-row")[next]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      // The first Enter unfolds the row under the cursor, the second goes to it - the
      // same two steps the pointer takes.
      e.preventDefault();
      const h = hits[cursor];
      if (openId === h.record.id) goto(h); else setOpenId(h.record.id);
    } else if (e.key === "ArrowRight") { setOpenId(hits[cursor].record.id); }
    else if (e.key === "ArrowLeft") { setOpenId(null); }
  };

  // Only the types that can actually appear: a chip for a type the study holds no record
  // of answers a question nobody asked.
  const present = tax.entityTypes.filter((t) => study.entities.some((e) => e.type === t.key)
    && (!groups.length || groups.includes(t.group ?? "")));

  return (
    <Overlay onClose={onClose}>
      <div className="gs-sheet" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <div className="gs-head">
          <Icon.search />
          <input ref={box} type="search" className="gs-input" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={tr("ui.search.placeholder", "Search this study - every workshop, every record")}
            aria-label={tr("ui.search.aria", "Search the study")} />
          <span className="gs-count">
            {query.trim() ? tn("ui.search.n-hits", counts.total, "{0} hit", "{0} hits") : ""}
          </span>
          <button className="btn ghost sm" onClick={onClose} aria-label={tr("ui.search.close", "Close")}><Icon.close /></button>
        </div>

        <div className="gs-facets">
          {tax.groups.map((g) => (
            <button key={g.key} className={"gs-chip" + (groups.includes(g.key) ? " on" : "")}
              style={{ ["--ws" as string]: g.color }} onClick={() => toggle(groups, setGroups, g.key)}>
              <i className="gs-dot" />{groupLabel(g)}
              <span className="gs-n">{counts.groups.get(g.key) ?? 0}</span>
            </button>
          ))}
          {present.length > 1 && <span className="gs-sep" aria-hidden />}
          {present.length > 1 && present.map((t) => (
            <button key={t.key} className={"gs-chip plain" + (types.includes(t.key) ? " on" : "")}
              onClick={() => toggle(types, setTypes, t.key)}>
              {typeLabel(t)}<span className="gs-n">{counts.types.get(t.key) ?? 0}</span>
            </button>
          ))}
          {(groups.length > 0 || types.length > 0) && (
            <button className="btn ghost sm gs-clear" onClick={() => onState({ ...state, groups: [], types: [] })}>
              {tr("ui.search.clear-filters", "Clear filters")}
            </button>
          )}
        </div>

        <div className="gs-body" ref={list}>
          {!query.trim() ? (
            <div className="gs-empty">
              <p>{tr("ui.search.hint", "Type a word. Every record of this study is searched - names, descriptions, and every value as it is shown.")}</p>
              <p className="hint">{tr("ui.search.hint-2", "Several words: all of them must appear. \"In quotes\" keeps a phrase together. The arrow keys move through the results, Enter unfolds a hit, Enter again goes to its row.")}</p>
            </div>
          ) : !hits.length ? (
            <div className="gs-empty">
              <p>{tr("ui.search.nothing", "Nothing in this study carries those words.")}</p>
              {(groups.length > 0 || types.length > 0) && <p className="hint">{tr("ui.search.nothing-filtered", "A workshop or type filter is on - the words may be somewhere it excludes.")}</p>}
            </div>
          ) : (
            <div className="gs-list" role="listbox">
              {hits.map((h, i) => {
                const isOpen = openId === h.record.id;
                return (
                  <div key={h.record.id}
                    className={"gs-row" + (i === cursor ? " on" : "") + (isOpen ? " open" : "") + (h.setBack ? " set-back" : "")}
                    style={{ ["--ws" as string]: h.group?.color ?? "var(--primary)" }}
                    role="option" aria-selected={i === cursor} aria-expanded={isOpen} tabIndex={-1}
                    onClick={() => { setCursor(i); setOpenId(isOpen ? null : h.record.id); }}>
                    <div className="gs-row-main">
                      <span className={"caret" + (isOpen ? " open" : "")}><Icon.chevron /></span>
                      <div className="gs-row-text">
                        <div className="gs-title">
                          {h.titleMark
                            ? <Marked text={recordTitle(h.type, h.record)} from={h.titleMark.from} to={h.titleMark.to} />
                            : recordTitle(h.type, h.record)}
                          {h.setBack && <span className="gs-back">{tr("ui.search.out-of-scope", "out of scope")}</span>}
                        </div>
                        {!isOpen && (h.snippet && h.field ? (
                          <div className="gs-snip">
                            <span className="gs-field">{fieldLabel(h.field, h.type)}</span>
                            <Marked text={h.snippet.text} from={h.snippet.from} to={h.snippet.to} />
                          </div>
                        ) : h.preview ? (
                          <div className="gs-snip gs-snip-quiet">{h.preview}</div>
                        ) : null)}
                      </div>
                      <div className="gs-row-where">
                        <span className="gs-type">{typeLabel(h.type)}</span>
                        <span className="gs-ws">{h.group ? groupLabel(h.group) : ""}</span>
                      </div>
                    </div>
                    {isOpen && <Preview h={h} term={term} tax={tax} study={study} onGo={() => goto(h)} onLook={() => open(h)} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {rec && <EntityModal type={getType(tax, rec.type)!} tax={tax} study={study} record={rec} onClose={() => setRec(null)} />}
    </Overlay>
  );
}
