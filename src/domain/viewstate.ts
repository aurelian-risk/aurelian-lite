// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// What the reader folded away, remembered between visits.
//
// Deliberately NOT part of the study. A fold is a property of the person reading, not of
// the analysis: put it in the study and it travels in the export, turns up in an import
// diff as a change to review, and lands in the hash-chained log - so collapsing a group
// would be recorded as an edit to the assessment. It lives in localStorage instead, in its
// own key, and nothing here ever touches the study.
//
// Three things keep it from becoming a burden on the browser:
//
//  · Only the deviation is stored. Groups are open by default, so the payload is the size
//    of what someone folded, not of what they have. A table of 1200 requirements with
//    nothing folded costs nothing at all.
//  · Writes are coalesced. Clicking through ten groups writes once, not ten times -
//    localStorage is synchronous, and a write per click is a stall per click.
//  · It is bounded and self-evicting. Scopes are capped and the least recently seen ones
//    go first, so a year of opened studies cannot grow without limit.

const LS_KEY = "aurelian_view_folds";
/** Distinct tables remembered. Beyond this the least recently seen scope is dropped. */
const MAX_SCOPES = 60;
/** Folded keys kept per table. A reader who folds more than this is not reading a layout. */
const MAX_KEYS = 200;
/** Coalescing window for writes, in ms. Long enough to swallow a burst of clicks, short
 *  enough that closing the tab straight after a fold still keeps it. */
const WRITE_DELAY = 400;

/** `t` counts touches, it is not a clock. Eviction has to order two scopes that were used
 *  in the same millisecond, and a wall clock cannot: it hands back identical numbers and
 *  the sort falls back to whatever order the object yields, which is not recency at all. */
interface Scope { k: string[]; t: number }
let touch = 0;
const nextTouch = (store: Record<string, { t: number }>): number => {
  if (!touch) for (const v of Object.values(store)) touch = Math.max(touch, v.t);
  return ++touch;
};
type Store = Record<string, Scope>;

let cache: Store | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

function load(): Store {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(LS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    cache = parsed && typeof parsed === "object" ? (parsed as Store) : {};
  } catch { cache = {}; }
  return cache!;
}

function flush(): void {
  timer = undefined;
  const store = load();
  // Evict here rather than on read: eviction is the write's business, and doing it on
  // every read would make an innocent lookup rewrite storage.
  const keys = Object.keys(store);
  if (keys.length > MAX_SCOPES) {
    keys.sort((a, b) => (store[b]?.t ?? 0) - (store[a]?.t ?? 0));
    for (const k of keys.slice(MAX_SCOPES)) delete store[k];
  }
  try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch { /* full or unavailable: the fold is not worth an error */ }
}

/** A stable name for one foldable thing: which study, which table, which axis it is
 *  grouped by. Grouping by a different field is a different layout and gets its own. */
export const foldScope = (studyId: string, typeKey: string, groupBy = ""): string =>
  `${studyId}|${typeKey}|${groupBy}`;

/** What was folded away here last time. Empty for anything never folded. */
export function getFolds(scope: string): Set<string> {
  const s = load()[scope];
  return new Set(s?.k ?? []);
}

/** Remember what is folded here. Writing an empty set forgets the scope entirely, so
 *  unfolding everything leaves nothing behind. */
export function setFolds(scope: string, folded: Set<string>): void {
  const store = load();
  if (folded.size === 0) delete store[scope];
  else store[scope] = { k: [...folded].slice(0, MAX_KEYS), t: nextTouch(store) };
  if (timer === undefined) timer = setTimeout(flush, WRITE_DELAY);
}

/** Drop everything remembered about a study - called when the study itself goes, so its
 *  folds do not outlive it. */
export function forgetStudy(studyId: string): void {
  const store = load();
  const pre = `${studyId}|`;
  let hit = false;
  for (const k of Object.keys(store)) if (k.startsWith(pre)) { delete store[k]; hit = true; }
  if (hit && timer === undefined) timer = setTimeout(flush, WRITE_DELAY);
  const g = loadGroups();
  let gHit = false;
  for (const k of Object.keys(g)) if (k.startsWith(pre)) { delete g[k]; gHit = true; }
  if (gHit && groupTimer === undefined) groupTimer = setTimeout(flushGroups, WRITE_DELAY);
}

// ── How a table is arranged ─────────────────────────────────────────────────
//
// Arrangement is remembered; selection is not. Grouping changes how the rows are laid out
// and is part of the layout a reader set up. A search or a facet changes WHICH rows there
// are - coming back to a table that silently holds fewer records than it has is a trap,
// and the fold state above is meaningless against a different set anyway.

const GROUP_KEY = "aurelian_view_group";
let groupCache: Record<string, { g: string; t: number }> | null = null;

function loadGroups(): Record<string, { g: string; t: number }> {
  if (groupCache) return groupCache;
  try {
    const raw = localStorage.getItem(GROUP_KEY);
    const p: unknown = raw ? JSON.parse(raw) : {};
    groupCache = p && typeof p === "object" ? (p as Record<string, { g: string; t: number }>) : {};
  } catch { groupCache = {}; }
  return groupCache!;
}

let groupTimer: ReturnType<typeof setTimeout> | undefined;
function flushGroups(): void {
  groupTimer = undefined;
  const store = loadGroups();
  const keys = Object.keys(store);
  if (keys.length > MAX_SCOPES) {
    keys.sort((a, b) => (store[b]?.t ?? 0) - (store[a]?.t ?? 0));
    for (const k of keys.slice(MAX_SCOPES)) delete store[k];
  }
  try { localStorage.setItem(GROUP_KEY, JSON.stringify(store)); } catch { /* ignore */ }
}

/** Which field this table was last grouped by, or "" for a plain table. */
export const getGroupKey = (scope: string): string => loadGroups()[scope]?.g ?? "";

export function setGroupKey(scope: string, key: string): void {
  const store = loadGroups();
  if (!key) delete store[scope];
  else store[scope] = { g: key, t: nextTouch(store) };
  if (groupTimer === undefined) groupTimer = setTimeout(flushGroups, WRITE_DELAY);
}

/** Test seam: forget everything and start from storage again. */
export function resetFoldCache(): void {
  cache = null; groupCache = null; touch = 0;
  if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
  if (groupTimer !== undefined) { clearTimeout(groupTimer); groupTimer = undefined; }
}
