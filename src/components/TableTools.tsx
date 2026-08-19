// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// One filter, used by every long table.
//
// The first version laid every facet out as a row of chips. That reads well for three
// values and badly for thirty: a register of a thousand rows carried more filter than
// table, and the table it was meant to serve started below the fold. Here a facet is a
// menu that says its name and how many of its values are picked; opening it shows the
// values with their counts. Nothing is hidden - a picked value is visible on the button
// itself - and the whole toolbar is one line until it needs two.
//
// The state and the filtering live in useTableFilter, so a view that is not a plain
// entity table (the coverage matrix, say) gets the same behaviour by calling one hook.
import { useMemo, useRef, useState, useEffect } from "react";
import type { EntityRecord, EntityTypeDef, FieldDef, FieldValue } from "../domain/types";
import { scaleLabel } from "../domain/taxonomy";
import { facetsOf, countFacets, filterItems, groupItems, activeCount, type Selection } from "../domain/tablefilter";
import { Icon } from "./ui";

/** How a value READS in a table - a scale as its label, not its number. Filtering and
 *  searching go by this, so a chip always says what the row says. */
export function displayValue(f: FieldDef, v: FieldValue): string {
  if (v == null || v === "") return "";
  switch (f.type) {
    case "scale": return typeof v === "number" ? scaleLabel(f, v) : "";
    case "boolean": return v ? "yes" : "no";
    case "ref": case "multiref": return "";
    default: return String(v);
  }
}

export interface TableFilter {
  query: string; setQuery: (s: string) => void;
  sel: Selection; toggleFacet: (key: string, value: string) => void;
  groupKey: string; setGroupKey: (k: string) => void;
  facets: ReturnType<typeof countFacets>;
  shown: EntityRecord[];
  groupField: FieldDef | null;
  groups: ReturnType<typeof groupItems>;
  filtered: boolean;
  clearAll: () => void;
  total: number;
}

export function useTableFilter(type: EntityTypeDef, items: EntityRecord[], onGroupChange?: () => void): TableFilter {
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState<Selection>({});
  const [groupKey, setGroupKeyRaw] = useState("");

  const facetSet = useMemo(() => facetsOf(type, items, displayValue), [type, items]);
  const facets = useMemo(() => countFacets(facetSet, items, type, query, sel, displayValue), [facetSet, items, type, query, sel]);
  const shown = useMemo(() => filterItems(items, type, query, sel, displayValue), [items, type, query, sel]);
  const groupField = groupKey ? type.fields.find((f) => f.key === groupKey) ?? null : null;
  const groups = useMemo(() => groupItems(shown, groupField, displayValue), [shown, groupField]);

  const toggleFacet = (key: string, value: string) => setSel((s) => {
    const cur = s[key] ?? [];
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    const out = { ...s, [key]: next };
    if (!next.length) delete out[key];
    return out;
  });
  const setGroupKey = (k: string) => { setGroupKeyRaw(k); onGroupChange?.(); };

  return {
    query, setQuery, sel, toggleFacet, groupKey, setGroupKey, facets, shown,
    groupField, groups,
    filtered: query.trim() !== "" || activeCount(sel) > 0,
    clearAll: () => { setQuery(""); setSel({}); },
    total: items.length,
  };
}

/** Values shown inside an open facet menu before the rest fold behind a "show all". */
const FACET_PREVIEW = 12;

function FacetMenu({ facet, chosen, onToggle }:
  { facet: TableFilter["facets"][number]; chosen: string[]; onToggle: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const values = all ? facet.values : facet.values.slice(0, FACET_PREVIEW);
  const hidden = facet.values.length - values.length;
  return (
    <div className="facet-menu" ref={box}>
      <button type="button" className={"facet-btn" + (chosen.length ? " on" : "")}
        aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {facet.field.label}
        {chosen.length > 0 && <span className="facet-n">{chosen.length}</span>}
        <span className="facet-caret"><Icon.chevron /></span>
      </button>
      {open && (
        <div className="facet-pop">
          {values.map((v) => {
            const on = chosen.includes(v.value);
            return (
              <button key={v.value} type="button" className={"facet-opt" + (on ? " on" : "")}
                aria-pressed={on} onClick={() => onToggle(v.value)}>
                <span className="facet-tick">{on ? <Icon.check /> : null}</span>
                <span className="facet-v">{v.value}</span>
                <span className="facet-n">{v.count}</span>
              </button>
            );
          })}
          {hidden > 0 && (
            <button type="button" className="facet-opt more" onClick={() => setAll(true)}>
              show the remaining {hidden}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function TableTools({ type, f, groupable = true }:
  { type: EntityTypeDef; f: TableFilter; groupable?: boolean }) {
  if (!f.facets.length && f.total < 8) return null;
  return (
    <div className="tbl-tools">
      <label className="tbl-search">
        <Icon.search />
        <input type="search" value={f.query} placeholder={`Search ${type.labelPlural.toLowerCase()}…`}
          onChange={(e) => f.setQuery(e.target.value)} aria-label={`Search ${type.labelPlural}`} />
      </label>
      {f.facets.map((facet) => (
        <FacetMenu key={facet.field.key} facet={facet} chosen={f.sel[facet.field.key] ?? []}
          onToggle={(v) => f.toggleFacet(facet.field.key, v)} />
      ))}
      {groupable && f.facets.length > 0 && (
        <select className="tbl-group" value={f.groupKey} onChange={(e) => f.setGroupKey(e.target.value)}
          aria-label="Group by" title="Group the rows by a column">
          <option value="">no grouping</option>
          {f.facets.map((facet) => <option key={facet.field.key} value={facet.field.key}>by {facet.field.label.toLowerCase()}</option>)}
        </select>
      )}
      <span className="tbl-count">
        {f.filtered ? `${f.shown.length} of ${f.total}` : `${f.total}`}
      </span>
      {f.filtered && <button className="tbl-clear" onClick={f.clearAll} title="Clear every filter"><Icon.close /></button>}
    </div>
  );
}
