// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Finding one row among many: search, facet filters and grouping for the entity tables.
//
// Nothing here knows which table it is working on. Which fields can be filtered or
// grouped by is derived from the DATA, not from the schema - `framework` and `category`
// on a requirement are plain text fields, and they are the two an analyst actually wants
// to group by. The rule is cardinality: a field is worth faceting when its values repeat.
//
// Values are compared as they are DISPLAYED, so a scale reads "high" rather than 3 and a
// filter chip says what the row says. The caller passes that rendering in, which keeps
// this module free of React and of the taxonomy's presentation rules.
import type { EntityRecord, EntityTypeDef, FieldDef, FieldValue } from "./types";

/** Below this many rows a table is readable as it stands, and a toolbar is clutter. */
export const TOOLBAR_MIN_ROWS = 8;
/** More distinct values than this and the chips become their own haystack. */
const MAX_FACET_VALUES = 12;

export type Display = (field: FieldDef, value: FieldValue) => string;

export interface FacetValue { value: string; count: number }
export interface Facet { field: FieldDef; values: FacetValue[] }
/** field key → the values selected on it. Empty or absent means "no filter on this field". */
export type Selection = Record<string, string[]>;

const FACETABLE = new Set(["text", "enum", "scale", "boolean", "number"]);

const isFacetable = (f: FieldDef, titleKey: string) =>
  f.key !== titleKey && f.key !== "description" && FACETABLE.has(f.type);

/** Fields whose values repeat often enough to be worth offering, most-repeating first.
 *
 *  Excluded: the title, free description text, references (a chip list is not a facet),
 *  fields nobody filled in, and fields where nearly every row differs - an identifier
 *  column would otherwise produce one chip per row. */
export function facetsOf(type: EntityTypeDef, items: EntityRecord[], display: Display): Facet[] {
  const titleKey = type.fields.find((f) => f.required && f.type === "text")?.key ?? type.fields[0]?.key ?? "";
  const out: Facet[] = [];
  for (const f of type.fields) {
    if (!isFacetable(f, titleKey)) continue;
    const counts = new Map<string, number>();
    for (const r of items) {
      const s = display(f, r.values[f.key] ?? null).trim();
      if (!s) continue;
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    if (counts.size < 2 || counts.size > MAX_FACET_VALUES) continue;
    // Every row distinct = an identifier, not a category.
    if (counts.size >= items.length) continue;
    out.push({
      field: f,
      values: [...counts].map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
    });
  }
  // A field the table sets rows back by is the one a reader filters on first — it decides
  // what the register is FOR, where the others only describe what is in it.
  return out.sort((a, b) => Number(!!b.field.toggle) - Number(!!a.field.toggle));
}

/** Everything about a record a search should look at: its title, its description and every
 *  displayed field value. References are left out on purpose - a search that matched the
 *  names of linked records would return rows with no visible reason for matching. */
export function haystack(type: EntityTypeDef, r: EntityRecord, display: Display): string {
  const parts: string[] = [];
  for (const f of type.fields) {
    if (f.type === "ref" || f.type === "multiref") continue;
    const s = display(f, r.values[f.key] ?? null);
    if (s) parts.push(s);
  }
  return parts.join(" ").toLowerCase();
}

/** All words must appear, in any field and any order. Quotes keep a phrase together. */
export function matchesQuery(hay: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const terms = q.match(/"[^"]+"|\S+/g) ?? [];
  return terms.every((t) => hay.includes(t.replace(/^"|"$/g, "")));
}

/** Values selected within one field are alternatives; different fields must all hold. */
export function matchesSelection(type: EntityTypeDef, r: EntityRecord, sel: Selection, display: Display): boolean {
  for (const [key, values] of Object.entries(sel)) {
    if (!values?.length) continue;
    const f = type.fields.find((x) => x.key === key);
    if (!f) continue;
    if (!values.includes(display(f, r.values[key] ?? null).trim())) return false;
  }
  return true;
}

export function filterItems(items: EntityRecord[], type: EntityTypeDef, query: string, sel: Selection, display: Display): EntityRecord[] {
  const q = query.trim();
  if (!q && !Object.values(sel).some((v) => v?.length)) return items;
  return items.filter((r) =>
    matchesSelection(type, r, sel, display) && (!q || matchesQuery(haystack(type, r, display), q)));
}

export interface Group { key: string; items: EntityRecord[] }

/** Group by a field's displayed value. Rows with no value form a trailing group rather
 *  than disappearing - a row that vanishes when grouping is applied looks like data loss. */
export function groupItems(items: EntityRecord[], field: FieldDef | null, display: Display): Group[] {
  if (!field) return [{ key: "", items }];
  const map = new Map<string, EntityRecord[]>();
  for (const r of items) {
    const k = display(field, r.values[field.key] ?? null).trim();
    const list = map.get(k);
    if (list) list.push(r); else map.set(k, [r]);
  }
  const empty = map.get("");
  map.delete("");
  const out = [...map].map(([key, list]) => ({ key, items: list }))
    .sort((a, b) => b.items.length - a.items.length || a.key.localeCompare(b.key));
  if (empty) out.push({ key: "", items: empty });
  return out;
}

/** The facets again, but counted against what the OTHER filters leave standing.
 *
 *  Which fields and which values are offered stays as it was over the whole table: chips
 *  that appeared and vanished as you filtered would move under the pointer. Only the
 *  numbers narrow, and a value with nothing left reads zero rather than disappearing.
 *
 *  A field is counted ignoring its own selection, because its values are alternatives:
 *  having picked one, the others must still show what picking them instead would give. */
export function countFacets(facets: Facet[], items: EntityRecord[], type: EntityTypeDef,
  query: string, sel: Selection, display: Display): Facet[] {
  return facets.map((f) => {
    const others: Selection = { ...sel };
    delete others[f.field.key];
    const scope = filterItems(items, type, query, others, display);
    const counts = new Map<string, number>();
    for (const r of scope) {
      const v = display(f.field, r.values[f.field.key] ?? null).trim();
      if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return { field: f.field, values: f.values.map((v) => ({ value: v.value, count: counts.get(v.value) ?? 0 })) };
  });
}

export const activeCount = (sel: Selection): number =>
  Object.values(sel).reduce((n, v) => n + (v?.length ?? 0), 0);
