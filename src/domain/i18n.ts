// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Which language the reader is shown, and where the words for it live.
//
// The contract is in docs/i18n.md; the part that matters here is one sentence:
//
//   Look the key up in the table for the chosen language; find nothing, show what was
//   authored.
//
// That covers both products built on this engine, which need it in opposite directions.
// Aurelian Lite authors its taxonomy in English and a German table translates it.
// Grundschutz++ stores the published German BSI vocabulary and an English table gives the
// reading — so ITS German interface needs no entries at all: nothing is found, the
// published value shows, which is what an auditor checks against.
//
// Nothing here translates a STORED value. A stored value is data - the engine matches on
// it, an export carries it, a seal hashes it. Only what is shown passes through.

/** A language tag as the browser gives it, cut to its primary subtag: "de-AT" → "de". */
export type Lang = string;

/** Keys are `type.<key>.label`, `group.<key>.description`, `field.<key>.label` and so on;
 *  see docs/i18n.md. A list-valued entry carries a whole scale or option vocabulary. */
export type Overlay = Record<string, string | string[]>;

const primary = (tag: string): Lang => tag.toLowerCase().split(/[-_]/)[0];

let current: Lang = "en";
const tables = new Map<Lang, Overlay>();

/** Where a reader's own choice is kept. Beside the theme and the view state, and for the
 *  same reason: which language someone reads in is a property of the reader, not of the
 *  analysis. In the study it would travel in the export, show up in an import diff as a
 *  change to review, and land in the hash-chained log. */
const LS_LANG = "ebios_offline_lang";

/** What this build actually offers, settled by `applyProductLanguage`. Held here so the
 *  interface can ask without knowing which product it is in. */
let offered: readonly Lang[] = [];

/** Register (or extend) the words for one language. A product calls this; the engine
 *  never ships a table of its own for taxonomy text. */
export function registerOverlay(lang: Lang, overlay: Overlay): void {
  const key = primary(lang);
  tables.set(key, { ...(tables.get(key) ?? {}), ...overlay });
}

export const getLanguage = (): Lang => current;
export function setLanguage(lang: Lang): void { current = primary(lang); }

/** The languages a reader may be shown, in the order the product named them. One entry
 *  means there is nothing to choose, and an interface should offer no choice. */
export const languagesOffered = (): readonly Lang[] => offered;

/** The choice this reader made last time, if this build still offers it.
 *
 *  Checked against what is offered rather than trusted: a build that drops a language, or
 *  a key left behind by another product on the same origin, would otherwise pin a reader
 *  to a language whose table is not there — which under the lookup rule does not fail, it
 *  just shows every string as authored. */
function remembered(known: ReadonlySet<Lang>): Lang | null {
  try {
    const v = localStorage.getItem(LS_LANG);
    const p = v ? primary(v) : "";
    return p && known.has(p) ? p : null;
  } catch { return null; }
}

/** Settle on a language at start-up: what this reader chose, else what their browser asks
 *  for, else what this product is written in.
 *
 *  The remembered choice comes FIRST, and that is the whole point of having one — a reader
 *  who has said "show me English" on a German browser has said something more specific
 *  than their browser did, and a preference that loses to the thing it was set to overrule
 *  is not a preference.
 *
 *  A LANGUAGE IS ON OFFER ONLY IF A TABLE NAMES IT — an empty one will do, and an empty
 *  one is often exactly right: a product authored in English needs no English entries,
 *  because a key nothing answers already shows English. It still has to be NAMED, or a
 *  reader asking for it is sent to the product's default instead. Found in the fork, at a
 *  product authored in German: an English browser got German, and the cause read like the
 *  opposite of a mistake. `{ en: {} }` is a declaration, not a placeholder. */
export function resolveLanguage(productDefault: Lang, offer: readonly string[] = []): Lang {
  const asked = typeof navigator !== "undefined" ? (navigator.languages ?? [navigator.language]) : [];
  // Only what the PRODUCT offers, plus its own language. Engine tables supply words for
  // whichever language is chosen; they do not put one on the menu, because the engine
  // does not know what a product ships.
  const known = new Set([...offer.map(primary), primary(productDefault)]);
  const chosen = remembered(known);
  if (chosen) return chosen;
  for (const tag of asked) { const p = primary(String(tag ?? "")); if (p && known.has(p)) return p; }
  return primary(productDefault);
}

// ── the reader's own choice ──────────────────────────────────────────────────
const watchers = new Set<() => void>();

/** Tell me when the language changes; returns the way to stop being told.
 *  Shaped for `useSyncExternalStore`, which is how the interface redraws in the new
 *  language without a reload. */
export function onLanguageChange(fn: () => void): () => void {
  watchers.add(fn);
  return () => { watchers.delete(fn); };
}

/** Switch language, and remember it for next time.
 *
 *  Remembering is what separates this from `setLanguage`: the latter is the engine putting
 *  a language on, this is a person saying which one they want. A language not on offer is
 *  ignored rather than set — there would be no table for it, so every string would show as
 *  authored and the interface would look half-broken instead of refusing. */
export function chooseLanguage(lang: Lang): void {
  const p = primary(lang);
  if (!offered.includes(p) || p === current) return;
  setLanguage(p);
  try { localStorage.setItem(LS_LANG, p); } catch { /* full or unavailable: the choice holds for this visit */ }
  try { document.documentElement.lang = p; } catch { /* no document in a test */ }
  for (const fn of watchers) fn();
}

/** The shown form of one key, or `authored` when this language says nothing about it. */
export function t(key: string, authored: string): string {
  const v = tables.get(current)?.[key];
  return typeof v === "string" && v ? v : authored;
}

/** The same for a whole vocabulary - a scale's rungs, an enum's readings. Returns
 *  `authored` unless the table holds a list of exactly the same length: a vocabulary that
 *  has gained a rung since the table was written is better shown as authored than shown
 *  shifted by one. */
export function tList(keys: string | string[], authored: string[] | undefined): string[] | undefined {
  // The keys are tried IN ORDER, here, rather than by the caller chaining calls with `??`.
  // Chained, the first call answers with `authored` on a miss — never undefined — so the
  // second key is unreachable, and a vocabulary written under the shared key is silently
  // never shown. Found in the fork: 13 scale entries written, 0 displayed, no complaint.
  for (const key of typeof keys === "string" ? [keys] : keys) {
    const v = tables.get(current)?.[key];
    if (Array.isArray(v) && (!authored || v.length === authored.length)) return v;
  }
  return authored;
}

/** A phrase whose wording depends on a count.
 *
 *  Seven places here built the plural by adding "s" — which is a rule about English, not
 *  about counting. German has no such rule ("Schritt" / "Schritte", "Datensatz" /
 *  "Datensätze"), so both forms are written out and the number chooses between them.
 *
 *  Two forms, deliberately, not the full ICU set: two cover both languages this engine
 *  ships, and the rest would be built for languages nobody has asked for. The number is
 *  put in with `{0}`, so a language may place it where it belongs.
 *
 *      tn("ui.audit.records", 3, "{0} record", "{0} records")  →  "3 records" */
export function tn(key: string, n: number, one: string, many: string): string {
  const form = n === 1 ? t(`${key}.one`, one) : t(`${key}.many`, many);
  return form.replace(/\{0\}/g, String(n));
}

/** One sentence, split at its placeholders, so a caller can put something INTO it.
 *
 *  A sentence interrupted by markup — "Residual = position after treatment, <b>derived</b>
 *  from the decision" — is three fragments in the source, and three fragments cannot be
 *  translated: German puts the emphasised word somewhere else, and fixed fragment order
 *  forbids that. Written as one string with `{0}` in it, the sentence is whole and the
 *  placeholder travels to wherever the language wants it.
 *
 *  Returns the literal pieces around the placeholders, plus the index each gap wants:
 *  `["Residual = position after treatment, ", 0, " from the decision"]`. The caller
 *  decides what a gap is made of, which is how a React node fits through a string. */
export function tParts(key: string, authored: string): (string | number)[] {
  const text = t(key, authored);
  const out: (string | number)[] = [];
  let at = 0;
  for (const m of text.matchAll(/\{(\d+)\}/g)) {
    if (m.index! > at) out.push(text.slice(at, m.index));
    out.push(Number(m[1]));
    at = m.index! + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

/** For tests and for a product that rebuilds its tables. */
export function clearOverlays(): void { tables.clear(); offered = []; }

/** Settle the language once, before the first paint — beside the theme, and for the same
 *  reason: a reader should never see one language replaced by another. The product's own
 *  tables are registered first, so a browser asking for a language this build actually
 *  carries gets it, and any other request falls to what the product is authored in. */
export function applyProductLanguage(
  productLanguage: string,
  words: Record<string, Overlay> = {},
  engineWords: Record<string, Overlay> = {},
): Lang {
  // The engine first, the product second: a later registration wins, so a product can
  // overrule any word the engine has for the same key without having to repeat the rest.
  for (const [lang, overlay] of Object.entries(engineWords)) registerOverlay(lang, overlay);
  for (const [lang, overlay] of Object.entries(words)) registerOverlay(lang, overlay);
  // The product's own language belongs on the menu whether or not it named a table for
  // it — it is what a reader falls back to, so it is always something they can ask for.
  const names = Object.keys(words).map(primary);
  offered = [...new Set([...names, primary(productLanguage)])];
  const chosen = resolveLanguage(productLanguage, names);
  setLanguage(chosen);
  try { document.documentElement.lang = chosen; } catch { /* no document in a test */ }
  return chosen;
}
