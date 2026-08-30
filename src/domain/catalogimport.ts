// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Deterministic import of a structured catalog table (CSV / TSV / delimited / a sheet
// of a workbook) into catalog items — verbatim, no model. An embedding model can only
// *assist* the column mapping (see guessMapping's optional scorer); the values are
// always parsed, never inferred. See [[killchain-predecessors-design]]-style rationale:
// for structured input a deterministic parse is more complete and exact than any model.
//
// This module has NO app dependencies (only a type import, erased at build) so it can
// be bundled and unit-tested in isolation — see scripts/catalog-test.mjs.
import type { FrameworkItem } from "./frameworks";

export type FieldKey = "ref_id" | "title" | "category" | "description";
export const FIELD_KEYS: FieldKey[] = ["ref_id", "title", "category", "description"];
export interface ParsedTable { headers: string[]; rows: string[][]; delimiter: string }
/** Which column feeds a field. The body may draw on SEVERAL columns, because a document
 *  read as a list does not always put its text in one place: a standard that carries the
 *  term, its definition and a note as separate detected pieces loses two of the three if
 *  only one column can be chosen. The single-column fields keep a plain number. */
export type Mapping = Partial<Record<FieldKey, number | number[]>>;

/** Fields that may be fed from more than one column. */
export const MULTI_FIELDS: FieldKey[] = ["description"];

/** Join several cells into one body.
 *
 *  Parts that repeat what is already there are dropped rather than concatenated: when a
 *  list reader puts the whole entry in the title AND in the description - which is what
 *  happens with a clause-numbered standard - joining them verbatim doubles every entry.
 *  Only substantial repeats are dropped; a short cell that happens to occur inside a long
 *  one may well be a distinct value. */
export function joinCells(parts: string[]): string {
  const out: string[] = [];
  for (const raw of parts) {
    const p = raw.trim();
    if (!p) continue;
    const dup = out.some((q) => q === p || (p.length >= 20 && q.includes(p)));
    if (dup) continue;
    out.push(p);
  }
  return out.join("\n\n");
}

const DELIMS = [",", ";", "\t", "|"];

/** Count a delimiter's occurrences in a line, ignoring those inside quotes. */
function countOutsideQuotes(line: string, delim: string): number {
  let n = 0, q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') i++; else q = !q; }
    else if (!q && c === delim) n++;
  }
  return n;
}

/** Pick the delimiter that appears most often (and consistently) in the header line. */
export function detectDelimiter(text: string): string {
  const firstLine = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  let best = ",", bestN = -1;
  for (const d of DELIMS) { const n = countOutsideQuotes(firstLine, d); if (n > bestN) { bestN = n; best = d; } }
  return bestN > 0 ? best : ",";
}

/** RFC-4180-ish parser: quoted fields, "" escapes, newlines inside quotes, CRLF, BOM. */
export function parseTable(input: string, delimiter?: string): ParsedTable {
  const text = input.replace(/^﻿/, "");
  const delim = delimiter || detectDelimiter(text);
  const rows: string[][] = [];
  let field = "", row: string[] = [], inQ = false, started = false;
  const endField = () => { row.push(field); field = ""; };
  const endRow = () => { endField(); rows.push(row); row = []; started = false; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    started = true;
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"' && field === "") { inQ = true; }
    else if (c === delim) endField();
    else if (c === "\n") endRow();
    else if (c === "\r") { /* swallow; \n ends the row */ }
    else field += c;
  }
  if (started || field !== "" || row.length) endRow();
  // drop rows whose every cell is blank (blank lines / trailing newline artefacts)
  const kept = rows.filter((r) => r.some((f) => f.trim() !== ""));
  const headers = (kept.shift() ?? []).map((h) => h.trim());
  return { headers, rows: kept, delimiter: delim };
}

// Header → field aliases (word-boundary, case-insensitive). A match is EVIDENCE, not a
// verdict: see guessMapping.
const ALIASES: Record<FieldKey, RegExp> = {
  ref_id: /(\b(ref[\s_-]?id|identifier|^id$|\bid\b|ref|control[\s_-]?(id|no|number)|code|number|no\.?|clause|section|art(icle)?)\b|#)/i,
  title: /\b(title|name|label|requirement|control|measure|safeguard|summary|short[\s_-]?desc(ription)?)\b/i,
  category: /\b(categor(y|ies)|family|families|domain|group|grouping|function|class|theme|area|topic)\b/i,
  description: /\b(description|desc|text|detail(s)?|guidance|discussion|note(s)?|statement|explanation|long[\s_-]?desc(ription)?)\b/i,
};

// Normalise a header for alias matching: snake_case / kebab / camelCase → words, so
// e.g. "control_text" → "control text" lets \btext\b match (real NIST 800-53 header).
// Newlines become spaces: a published workbook stacks three lines in one header cell.
function normHeader(h: string): string {
  return h.replace(/[_-]+/g, " ").replace(/\s+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
}

// ── What the VALUES say about a column ───────────────────────────────────────
/** Measured, not guessed: an identifier is short and unique, a category repeats, a
 *  description is long. These hold across publishers and languages, which the header
 *  wording does not - "SCF #", "ERL #", "Identifier" and "Control Identifier" are four
 *  spellings of one thing, but every one of them holds short unique values. */
interface ColStats { fill: number; uniq: number; len: number; idish: number; serial: boolean; multi: number }

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

function columnStats(rows: string[][], i: number, sample = 300): ColStats {
  const vals: string[] = [];
  for (let r = 0; r < rows.length && r < sample; r++) vals.push((rows[r][i] ?? "").trim());
  const seen = vals.filter(Boolean);
  if (!seen.length) return { fill: 0, uniq: 0, len: 0, idish: 0, serial: false, multi: 0 };
  const distinct = new Set(seen).size;
  const ints = seen.filter((v) => /^\d{1,6}$/.test(v)).map(Number);
  return {
    fill: seen.length / vals.length,
    uniq: distinct / seen.length,
    len: median(seen.map((v) => v.length)),
    idish: seen.filter((v) => /^[A-Za-z0-9][A-Za-z0-9._\-/()]{0,19}$/.test(v) && /\d/.test(v)).length / seen.length,
    // Cells holding a LIST - one reference per line - are a cross-reference to another
    // framework, never this entry's own name or reference.
    multi: seen.filter((v) => /\n/.test(v)).length / seen.length,
    // A plain ascending integer column is the sheet's own row counter, not a reference.
    serial: ints.length === seen.length && distinct === seen.length
      && ints.every((n, k) => k === 0 || n > ints[k - 1]),
  };
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** 0 below `a`, 1 above `b`, straight line between. */
const up = (x: number, a: number, b: number) => clamp01((x - a) / (b - a));
const down = (x: number, a: number, b: number) => 1 - up(x, a, b);

function contentScore(f: FieldKey, c: ColStats, distinctGE2: boolean, informative = true): number {
  // On a short table the counts below carry no information, so they are set aside
  // rather than believed: only length, fill and shape remain.
  const uniqUp = (a: number, b: number) => (informative ? up(c.uniq, a, b) : 1);
  const uniqDown = (a: number, b: number) => (informative ? down(c.uniq, a, b) : 1);
  const repeats = informative ? (distinctGE2 ? 1 : 0) : 1;
  // Every field is wanted on every row, so a column that is mostly blank is not it,
  // whatever its heading says. A published workbook carries columns left blank for the
  // reader to fill in - "Assessment Procedure", "Notes / Errata" - and one of them
  // matched the description aliases and was imported as the body of 5,956 entries.
  const present = up(c.fill, 0.5, 0.9);
  switch (f) {
    case "ref_id":
      return c.idish * uniqUp(0.5, 0.9) * down(c.len, 12, 40) * present * (c.serial ? 0.2 : 1);
    case "title":
      return down(c.idish, 0.3, 0.8) * uniqUp(0.3, 0.7) * up(c.len, 3, 12) * down(c.len, 90, 400) * present;
    case "category":
      // A category is a label, not a code: "Access Control", not "V1". Both repeat down
      // the table, so without this the shorter of the two wins on length alone.
      // What makes a category is that it REPEATS down the table. On a table too short
      // to see that, there is no evidence either way - so none is offered, rather than
      // a full mark for every short column that happens to be filled in.
      return informative
        ? repeats * uniqDown(0.05, 0.6) * down(c.idish, 0.2, 0.7) * down(c.len, 60, 160) * present
        : 0;
    case "description":
      return up(c.len, 40, 120) * present;
  }
}

/** How much the model's opinion is worth for one field: the gap between its best column
 *  and the runner-up, measured against the spread of its own scores.
 *
 *  It is deliberately RELATIVE. A fixed cosine threshold is not defined across models:
 *  all-MiniLM-L6 scores these headers between 0.13 and 0.69, bge-small between 0.49 and
 *  0.77, so one cut-off either silences the first model or lets the second through
 *  everywhere. A margin is on the same scale for both. */
function embedEvidence(headers: string[], f: FieldKey, score: (field: FieldKey, header: string) => number)
  : { at: number; weight: number } {
  const s = headers.map((h) => score(f, h));
  if (s.length < 2) return { at: -1, weight: 0 };
  let bi = 0;
  for (let i = 1; i < s.length; i++) if (s[i] > s[bi]) bi = i;
  const rest = s.filter((_, i) => i !== bi);
  const second = Math.max(...rest), low = Math.min(...s);
  const spread = s[bi] - low;
  return { at: bi, weight: spread > 1e-6 ? clamp01((s[bi] - second) / spread) : 0 };
}

const W_ALIAS = 0.8, W_CONTENT = 1.0, W_EMBED = 0.7, FLOOR = 0.55;

/** Below this many rows the shape of a column says nothing: one row is unique, one row
 *  has one distinct value, one row is as long as its only cell. The wording is then the
 *  only evidence there is, and it is taken at face value. */
const ENOUGH_ROWS = 8;

/** The most the model may add: enough to settle a near-tie, not to overturn evidence. */
const TIE_BREAK = 0.25;

/** What the values say the heading CANNOT mean. Each of these was a real mis-import:
 *  a title that repeats every twenty rows ("chapter_name" in OWASP ASVS), a reference
 *  that repeats ("chapter_id" in the same file), a column blank in seven rows of ten
 *  taken as the title ("Relevant CMMC 2.0 L2 Control" in the SCF workbook). */
function veto(f: FieldKey, c: ColStats, informative: boolean): number {
  if (!informative) return 1;
  const no = 0.4;
  if ((f === "title" || f === "ref_id") && c.fill < 0.5) return no;
  if ((f === "title" || f === "ref_id") && c.multi > 0.2) return no;
  if (f === "title" && c.uniq < 0.2) return no;
  if (f === "ref_id" && c.uniq < 0.5) return no;
  if (f === "category" && c.uniq > 0.8) return no;
  return 1;
}

/**
 * Map table headers to catalog fields.
 *
 * Three kinds of evidence are weighed together and the best whole assignment is chosen:
 * the header's wording, what the column's own values look like, and - when offered - an
 * embedding model's opinion. No field is decided before the others.
 *
 * The order matters less than the fact that there IS no order any more. Taking the first
 * matching column per field, as this did, made two mistakes that no later step could
 * undo: in OWASP ASVS "chapter_id" was claimed as the reference before "req_id" was ever
 * considered, and in the SCF catalogue "SCF Control" - a control's NAME - was claimed as
 * the reference because "control" appears in the reference aliases. Both columns are
 * plainly wrong on their contents: one repeats across rows, the other holds sentences.
 *
 * `rows` is optional; without it only the wording and the model can speak. `title` always
 * resolves (falls back to the first unused column) so items are never value-less;
 * `ref_id` may stay unmapped (it is optional).
 *
 * `score` is the way in for a model, and nothing in the product passes it any more. It
 * was offered as a "Suggest with AI" button, and the button was removed on the
 * measurement rather than on taste: over seven published catalogues and both bundled
 * embedding models it improved no mapping and spoilt two. It was given every chance
 * first - showing the model each column's own VALUES instead of its heading, and real
 * field values from the catalogues shipped here, lifted what the model manages alone
 * from 10 of 28 to 18. A real gain, and still far under the 26 that the wording and the
 * values reach without it, wrong on exactly the same two columns. The hook stays,
 * because a stronger model is a different question and harness/embed-import.mjs still
 * asks it; the button does not, because a press that can only cost the user is not a
 * feature.
 */
export function guessMapping(
  headers: string[],
  opts: { rows?: string[][]; score?: (field: FieldKey, header: string) => number } = {},
): Mapping {
  const { rows, score } = opts;
  const informative = (rows?.length ?? 0) >= ENOUGH_ROWS;
  const norm = headers.map(normHeader);
  const stats = headers.map((_, i) => (rows?.length ? columnStats(rows, i) : null));
  const ge2 = headers.map((_, i) =>
    !rows?.length ? false : new Set(rows.slice(0, 300).map((r) => (r[i] ?? "").trim()).filter(Boolean)).size >= 2);

  // evidence[field][column]
  const evidence: number[][] = FIELD_KEYS.map((f) => headers.map((_, i) => {
    const named = ALIASES[f].test(norm[i]);
    const st = stats[i];
    if (!st) return named ? W_ALIAS : 0;          // headers only: the wording is all there is
    if (st.fill < 0.05) return 0;                 // an empty column cannot feed anything
    const content = contentScore(f, st, ge2[i], informative);
    // The title is the one field with a safe fallback - an entry can be named by its
    // reference - so it is never filled on the strength of a heading alone. "section_name"
    // and "chapter_name" both read like names and both repeat down the table; taking
    // either would name sixty entries the same thing.
    if (f === "title" && informative && content <= 0) return 0;
    return (named ? W_ALIAS * veto(f, st, informative) : 0) + W_CONTENT * content;
  }));
  if (score) {
    FIELD_KEYS.forEach((f, fi) => {
      const e = embedEvidence(headers, f, score);
      // Capped, so the model breaks ties and never overturns them. Measured over seven
      // published catalogues and both shipped models, its opinion has never once
      // improved a mapping and has twice displaced a right answer; a tie-break is as
      // much weight as that record supports.
      if (e.at >= 0) evidence[fi][e.at] += Math.min(W_EMBED * e.weight, TIE_BREAK);
    });
  }

  // Best whole assignment over the plausible candidates, rather than field by field.
  // Eight per field is far more than any real table needs and keeps this at 8^4 checks
  // even for the 372-column workbooks publishers actually ship.
  const cands = FIELD_KEYS.map((_, fi) =>
    headers.map((_, i) => i)
      .filter((i) => evidence[fi][i] >= FLOOR)
      .sort((a, b) => evidence[fi][b] - evidence[fi][a] || a - b)
      .slice(0, 8));

  let bestTotal = -1, bestPick: (number | null)[] = FIELD_KEYS.map(() => null);
  const pick: (number | null)[] = FIELD_KEYS.map(() => null);
  const taken = new Set<number>();
  const walk = (fi: number, total: number) => {
    if (fi === FIELD_KEYS.length) {
      if (total > bestTotal) { bestTotal = total; bestPick = [...pick]; }
      return;
    }
    for (const i of cands[fi]) {
      if (taken.has(i)) continue;
      pick[fi] = i; taken.add(i);
      walk(fi + 1, total + evidence[fi][i]);
      taken.delete(i); pick[fi] = null;
    }
    pick[fi] = null; // leaving the field unmapped is a valid choice
    walk(fi + 1, total);
  };
  walk(0, 0);

  const map: Mapping = {};
  FIELD_KEYS.forEach((f, fi) => { if (bestPick[fi] != null) map[f] = bestPick[fi]!; });

  // A title has to come from somewhere. Pick the most title-like column still free -
  // never simply the first, which in a workbook is as often a row counter as a name.
  // If nothing left is plausible, leave it: tableToItems falls back to the reference,
  // and an entry named by its reference beats one named "V1" for twenty rows running.
  if (map.title == null) {
    const used = new Set(Object.values(map).filter((v): v is number => typeof v === "number"));
    let best = -1, bs = rows?.length ? 0.15 : -1;
    for (let i = 0; i < headers.length; i++) {
      if (used.has(i)) continue;
      const s2 = stats[i] ? contentScore("title", stats[i]!, ge2[i], informative) : 0;
      if (s2 > bs) { bs = s2; best = i; }
      if (!rows?.length) break;                   // headers only: the first free column
    }
    if (best >= 0) map.title = best;
  }
  return map;
}

/** Apply a mapping to produce catalog items — verbatim, trimmed, blank rows skipped. */
export function tableToItems(t: ParsedTable, map: Mapping): FrameworkItem[] {
  const cell = (row: string[], f: FieldKey) => {
    const m = map[f];
    if (m == null) return "";
    if (Array.isArray(m)) return joinCells(m.filter((i) => i >= 0).map((i) => row[i] ?? ""));
    return m >= 0 ? (row[m] ?? "").trim() : "";
  };
  const items: FrameworkItem[] = [];
  for (const row of t.rows) {
    const ref_id = cell(row, "ref_id");
    const title = cell(row, "title") || ref_id;
    if (!ref_id && !title) continue;
    const category = cell(row, "category");
    const description = cell(row, "description");
    items.push({ ref_id, title, category: category || undefined, description: description || undefined });
  }
  return items;
}

/** True when the text looks like JSON (dispatch JSON vs. table at the call site). */
export function looksLikeJson(text: string): boolean {
  return /^\s*[[{]/.test(text);
}
