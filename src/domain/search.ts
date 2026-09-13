// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// One search across the whole study - every workshop, every entity type.
//
// The tables can each be searched where they stand, which answers "where in this list is
// it". It does not answer the question an analyst actually arrives with: "we wrote
// something about the maintenance gateway - where?" The answer to that is spread over
// five workshops and a dozen types, and looking for it meant opening each in turn.
//
// Nothing here knows the taxonomy of any product: types, groups and fields are read from
// the taxonomy, so a profile that renames its workshops is searched by its own names.
// The matching itself is `matchesQuery`/`haystack` from tablefilter - the same rules the
// tables use (all terms must appear, quotes hold a phrase together, values are compared
// as they are DISPLAYED), because two search boxes that disagree about what "matches"
// means are worse than one.
import type { EntityRecord, EntityTypeDef, FieldDef, GroupDef, Study, Taxonomy } from "./types";
import { haystack, matchesQuery, type Display } from "./tablefilter";
import { isSetBack } from "./taxonomy";

/** One record the query found, and why it was found. */
export interface Hit {
  record: EntityRecord;
  type: EntityTypeDef;
  group: GroupDef | null;
  /** The field the snippet was taken from - null when only the title matched. */
  field: FieldDef | null;
  /** A readable piece of that field around the match, with the match's offsets in it. */
  snippet: { text: string; from: number; to: number } | null;
  /** Whether the title itself matched. Title hits sort first: that is the record the
   *  reader is usually after, and the one whose name they half-remember. */
  titleHit: boolean;
  /** Where in the title the match sits, so the card can mark it there. */
  titleMark: { from: number; to: number } | null;
  /** A quiet line of the record for a card that has nothing marked to show - a hit whose
   *  only match is its name would otherwise be a title and a filler sentence. */
  preview: string;
  /** Set back - out of the study's scope, but still findable. Hiding it would make the
   *  search lie about what the file contains. */
  setBack: boolean;
}

export interface SearchFilters {
  /** Group keys to keep. Empty = every group. */
  groups?: string[];
  /** Type keys to keep. Empty = every type. */
  types?: string[];
  /** Leave out records that are set back. Off by default - see `Hit.setBack`. */
  inScopeOnly?: boolean;
}

/** How many hits each group and each type holds, for the filter chips.
 *
 *  Counted over the hits the QUERY found, before that dimension's own filter is applied -
 *  the same rule the table facets follow: the chips are a fixed set, and only their
 *  numbers narrow. A chip that disappears when it reaches zero moves the chips beside it
 *  under the pointer. */
export interface SearchCounts {
  groups: Map<string, number>;
  types: Map<string, number>;
  total: number;
}

const CONTEXT = 48;

/** The first term of the query, used to place the snippet. A phrase in quotes counts as
 *  one term, which is what makes "maintenance gateway" land on the phrase rather than on
 *  the first "the" it can find. */
export function firstTerm(query: string): string {
  const m = query.trim().toLowerCase().match(/"[^"]+"|\S+/);
  return m ? m[0].replace(/^"|"$/g, "") : "";
}

/** A readable window of `text` around the first occurrence of `term`. */
export function snippetOf(text: string, term: string): { text: string; from: number; to: number } | null {
  if (!term) return null;
  const at = text.toLowerCase().indexOf(term);
  if (at < 0) return null;
  // Cut on a word boundary where there is one nearby, so a snippet does not start
  // mid-word; an ellipsis says that something was cut.
  let start = Math.max(0, at - CONTEXT);
  if (start > 0) {
    const sp = text.indexOf(" ", start);
    if (sp >= 0 && sp < at) start = sp + 1;
  }
  let end = Math.min(text.length, at + term.length + CONTEXT);
  if (end < text.length) {
    const sp = text.lastIndexOf(" ", end);
    if (sp > at + term.length) end = sp;
  }
  const head = start > 0 ? "…" : "";
  const tail = end < text.length ? "…" : "";
  return { text: head + text.slice(start, end) + tail, from: head.length + (at - start), to: head.length + (at - start) + term.length };
}

/** Every record of the study the query matches, best first.
 *
 *  Order is fully determined by the data, never by iteration chance: a title hit before a
 *  field hit, then the order the taxonomy declares its groups and types in, then the
 *  order the records were written in. A search whose results reshuffle between two
 *  identical queries cannot be pointed at over someone's shoulder. */
export function searchStudy(tax: Taxonomy, study: Study, query: string, display: Display,
  filters: SearchFilters = {}): Hit[] {
  const q = query.trim();
  if (!q) return [];
  const term = firstTerm(q);
  const groupIx = new Map(tax.groups.map((g, i) => [g.key, i]));
  const typeIx = new Map(tax.entityTypes.map((t, i) => [t.key, i]));
  const order = new Map(study.entities.map((e, i) => [e.id, i]));
  const keepGroup = (k: string | undefined) => !filters.groups?.length || filters.groups.includes(k ?? "");
  const keepType = (k: string) => !filters.types?.length || filters.types.includes(k);

  const hits: Hit[] = [];
  for (const type of tax.entityTypes) {
    if (!keepType(type.key) || !keepGroup(type.group)) continue;
    const titleKey = type.titleField ?? "name";
    for (const r of study.entities) {
      if (r.type !== type.key) continue;
      const setBack = isSetBack(tax, r);
      if (setBack && filters.inScopeOnly) continue;
      if (!matchesQuery(haystack(type, r, display), q)) continue;

      const title = String(r.values[titleKey] ?? "");
      const at = term ? title.toLowerCase().indexOf(term) : -1;
      const titleHit = at >= 0;
      // The snippet comes from the first field that actually carries the term, title
      // aside: a hit has to show WHERE it was found, or the reader has to open the record
      // to find out whether it is the one they meant. It is looked for even when the
      // title already matched - the second place a word appears is often the reason it
      // was searched for.
      let field: FieldDef | null = null;
      let snippet: { text: string; from: number; to: number } | null = null;
      let preview = "";
      for (const f of type.fields) {
        if (f.key === titleKey || f.type === "ref" || f.type === "multiref") continue;
        const s = display(f, r.values[f.key] ?? null);
        if (!s) continue;
        if (!preview && (f.type === "textarea" || f.type === "text")) preview = s.length > 140 ? s.slice(0, 139) + "…" : s;
        if (snippet) continue;
        const sn = snippetOf(s, term);
        if (sn) { field = f; snippet = sn; }
      }
      hits.push({ record: r, type, group: tax.groups.find((g) => g.key === type.group) ?? null,
        field, snippet, titleHit, titleMark: titleHit ? { from: at, to: at + term.length } : null, preview, setBack });
    }
  }

  return hits.sort((a, b) =>
    Number(b.titleHit) - Number(a.titleHit)
    || Number(a.setBack) - Number(b.setBack)
    || (groupIx.get(a.type.group ?? "") ?? 99) - (groupIx.get(b.type.group ?? "") ?? 99)
    || (typeIx.get(a.type.key) ?? 99) - (typeIx.get(b.type.key) ?? 99)
    || (order.get(a.record.id) ?? 0) - (order.get(b.record.id) ?? 0));
}

/** The counts behind the filter chips: what the query finds per group and per type,
 *  each counted with the OTHER dimension's filter applied but not its own. */
export function searchCounts(tax: Taxonomy, study: Study, query: string, display: Display,
  filters: SearchFilters = {}): SearchCounts {
  const perGroup = searchStudy(tax, study, query, display, { ...filters, groups: [] });
  const perType = searchStudy(tax, study, query, display, { ...filters, types: [] });
  const groups = new Map<string, number>();
  for (const h of perGroup) {
    const k = h.type.group ?? "";
    groups.set(k, (groups.get(k) ?? 0) + 1);
  }
  const types = new Map<string, number>();
  for (const h of perType) types.set(h.type.key, (types.get(h.type.key) ?? 0) + 1);
  return { groups, types, total: searchStudy(tax, study, query, display, filters).length };
}
