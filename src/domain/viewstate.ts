// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// How a reader arranged a table - or pushed a graph node - remembered between visits.
//
// Deliberately NOT part of the study. An arrangement is a property of the person reading,
// not of the analysis: put it in the study and it travels in the export, turns up in an
// import diff as a change to review, and lands in the hash-chained log - so collapsing a
// group would be recorded as an edit to the assessment. It lives in localStorage instead,
// in its own keys, and nothing here ever touches the study.
//
// Three things keep it from becoming a burden on the browser:
//
//  · Only the deviation is stored. Groups are open, columns are shown and nodes sit where
//    the layout put them by default, so the payload is the size of what someone changed,
//    not of what they have. A table of 1200 requirements left as it comes costs nothing.
//  · Writes are coalesced. Clicking through ten groups writes once, not ten times -
//    localStorage is synchronous, and a write per click is a stall per click.
//  · It is bounded and self-evicting. Scopes are capped and the least recently seen ones
//    go first, so a year of opened studies cannot grow without limit.

/** Distinct tables remembered. Beyond this the least recently seen scope is dropped. */
const MAX_SCOPES = 60;
/** Keys kept per table. A reader who folds more than this is not reading a layout. */
const MAX_KEYS = 200;
/** Coalescing window for writes, in ms. Long enough to swallow a burst of clicks, short
 *  enough that closing the tab straight after a fold still keeps it. */
const WRITE_DELAY = 400;

/** `t` counts touches, it is not a clock. Eviction has to order two scopes that were used
 *  in the same millisecond, and a wall clock cannot: it hands back identical numbers and
 *  the sort falls back to whatever order the object yields, which is not recency at all.
 *  One counter for all stores, so their orders cannot disagree. */
let touch = 0;

type Slot = { t: number } & Record<string, unknown>;
type Store = Record<string, Slot>;

/** One remembered property per view, in its own storage key. Four of these exist - what is
 *  folded, what it is grouped by, which columns are hidden, where a graph node was pushed -
 *  and they differ only in what a slot holds, so the machinery that keeps them small is
 *  written once here.
 *  `field` is the name the value carries in storage: short, because it is written on
 *  every scope, and stable, because changing it would forget what readers already have. */
function makeStore<T>(lsKey: string, field: string, isEmpty: (v: T) => boolean, clamp?: (v: T) => T) {
  let cache: Store | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const load = (): Store => {
    if (cache) return cache;
    try {
      const raw = localStorage.getItem(lsKey);
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      cache = parsed && typeof parsed === "object" ? (parsed as Store) : {};
    } catch { cache = {}; }
    return cache!;
  };

  const flush = (): void => {
    timer = undefined;
    const store = load();
    // Evict here rather than on read: eviction is the write's business, and doing it on
    // every read would make an innocent lookup rewrite storage.
    const keys = Object.keys(store);
    if (keys.length > MAX_SCOPES) {
      keys.sort((a, b) => (store[b]?.t ?? 0) - (store[a]?.t ?? 0));
      for (const k of keys.slice(MAX_SCOPES)) delete store[k];
    }
    try { localStorage.setItem(lsKey, JSON.stringify(store)); } catch { /* full or unavailable: a view preference is not worth an error */ }
  };

  const schedule = () => { if (timer === undefined) timer = setTimeout(flush, WRITE_DELAY); };

  return {
    get(scope: string): T | undefined {
      return load()[scope]?.[field] as T | undefined;
    },
    /** Writing an empty value forgets the scope entirely, so putting a table back the way
     *  it came leaves nothing behind. */
    set(scope: string, value: T): void {
      const store = load();
      if (isEmpty(value)) delete store[scope];
      else {
        if (!touch) for (const v of Object.values(store)) touch = Math.max(touch, v.t);
        store[scope] = { [field]: clamp ? clamp(value) : value, t: ++touch };
      }
      schedule();
    },
    /** Everything remembered about one study. Used when the study itself goes. */
    forget(prefix: string): boolean {
      const store = load();
      let hit = false;
      for (const k of Object.keys(store)) if (k.startsWith(prefix)) { delete store[k]; hit = true; }
      if (hit) schedule();
      return hit;
    },
    reset(): void {
      cache = null;
      if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
    },
  };
}

// What is folded away. Storage shape `{ k: [...] }` - kept as it was, so an upgrade does
// not silently forget the arrangements readers already have.
const folds = makeStore<string[]>("aurelian_view_folds", "k",
  (v) => v.length === 0, (v) => v.slice(0, MAX_KEYS));

// How the table is ARRANGED comes back with the reader; what it is filtered to does not.
// Grouping changes how the rows are laid out and is part of the layout someone set up. A
// search or a facet changes WHICH rows there are - coming back to a table that silently
// holds fewer records than it has is a trap, and the fold state is meaningless against a
// different set anyway.
const groups = makeStore<string>("aurelian_view_group", "g", (v) => !v);

// Which columns this reader put away. The taxonomy decides which columns a type HAS; how
// many of them fit in the window someone is reading in is not the taxonomy's business.
// The hidden ones are stored, never the shown ones: a field added to the taxonomy later
// then appears by default instead of staying invisible because it was not on an old list.
const columns = makeStore<string[]>("aurelian_view_cols", "h",
  (v) => v.length === 0, (v) => v.slice(0, MAX_KEYS));

// Where a reader pushed a graph node, as offsets from the spot the layout computed. Stored
// as triples so the same cap as the folds applies, and outside the study for the same
// reason: moving a node is reading, not analysis - in the study it would travel in every
// export and stand in the change log as an edit to the assessment.
const nudges = makeStore<[string, number, number][]>("aurelian_view_nudge", "n",
  (v) => v.length === 0, (v) => v.slice(0, MAX_KEYS));

/** A stable name for one foldable thing: which study, which table, which axis it is
 *  grouped by. Grouping by a different field is a different layout and gets its own. */
export const foldScope = (studyId: string, typeKey: string, groupBy = ""): string =>
  `${studyId}|${typeKey}|${groupBy}`;

/** What was folded away here last time. Empty for anything never folded. */
export const getFolds = (scope: string): Set<string> => new Set(folds.get(scope) ?? []);

/** Remember what is folded here. */
export const setFolds = (scope: string, folded: Set<string>): void => folds.set(scope, [...folded]);

/** Which field this table was last grouped by, or "" for a plain table. */
export const getGroupKey = (scope: string): string => groups.get(scope) ?? "";

export const setGroupKey = (scope: string, key: string): void => groups.set(scope, key);

/** Which columns this reader put away here. Empty means the table shows what it has. */
export const getHiddenColumns = (scope: string): Set<string> => new Set(columns.get(scope) ?? []);

export const setHiddenColumns = (scope: string, hidden: Set<string>): void => columns.set(scope, [...hidden]);

/** Where this reader pushed the graph's nodes, by node id. Empty for an untouched graph. */
export function getNudges(scope: string): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  for (const [id, x, y] of nudges.get(scope) ?? []) out.set(id, { x, y });
  return out;
}

/** Remember where they were pushed. An empty map forgets the scope, so putting the graph
 *  back the way it came leaves nothing behind. */
export function setNudges(scope: string, moved: Map<string, { x: number; y: number }>): void {
  nudges.set(scope, [...moved].map(([id, p]) => [id, Math.round(p.x), Math.round(p.y)]));
}

/** Drop everything remembered about a study - called when the study itself goes, so its
 *  arrangements do not outlive it. */
export function forgetStudy(studyId: string): void {
  const pre = `${studyId}|`;
  for (const s of [folds, groups, columns, nudges]) s.forget(pre);
}

/** Test seam: forget everything and start from storage again. */
export function resetFoldCache(): void {
  for (const s of [folds, groups, columns, nudges]) s.reset();
  touch = 0;
}
