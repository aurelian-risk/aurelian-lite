// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Deterministic import of a structured catalog table (CSV / TSV / delimited) into
// catalog items — verbatim, no model. An embedding model can only *assist* header
// mapping (see guessMapping's optional scorer); the values are always parsed, never
// inferred. See [[killchain-predecessors-design]]-style rationale: for structured
// input a deterministic parse is more complete and exact than any model.
//
// This module has NO app dependencies (only a type import, erased at build) so it can
// be bundled and unit-tested in isolation — see scripts/catalog-test.mjs.
import type { FrameworkItem } from "./frameworks";

export type FieldKey = "ref_id" | "title" | "category" | "description";
export const FIELD_KEYS: FieldKey[] = ["ref_id", "title", "category", "description"];
export interface ParsedTable { headers: string[]; rows: string[][]; delimiter: string }
export type Mapping = Partial<Record<FieldKey, number>>;

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

// Header → field aliases (word-boundary, case-insensitive). First matching, unused
// column wins per field, in FIELD_KEYS priority order.
const ALIASES: Record<FieldKey, RegExp> = {
  ref_id: /\b(ref[\s_-]?id|identifier|^id$|\bid\b|ref|control[\s_-]?(id|no|number)?|code|number|no\.?|clause|section|art(icle)?)\b/i,
  title: /\b(title|name|label|requirement|control|measure|safeguard|summary|short[\s_-]?desc(ription)?)\b/i,
  category: /\b(categor(y|ies)|family|families|domain|group|grouping|function|class|theme|area|topic)\b/i,
  description: /\b(description|desc|text|detail(s)?|guidance|note(s)?|statement|explanation|long[\s_-]?desc(ription)?)\b/i,
};

/**
 * Map table headers to catalog fields. Heuristic aliases first; for any field still
 * unmapped, an optional `score(field, header)` (e.g. embedding cosine) breaks ties.
 * `title` always resolves (falls back to the first unused column) so items are never
 * value-less; `ref_id` may stay unmapped (it is optional).
 */
// Normalise a header for alias matching: snake_case / kebab / camelCase → words, so
// e.g. "control_text" → "control text" lets \btext\b match (real NIST 800-53 header).
function normHeader(h: string): string {
  return h.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
}

export function guessMapping(headers: string[], score?: (field: FieldKey, header: string) => number): Mapping {
  const used = new Set<number>();
  const map: Mapping = {};
  const norm = headers.map(normHeader);
  // 1) alias pass
  for (const f of FIELD_KEYS) {
    for (let i = 0; i < headers.length; i++) {
      if (!used.has(i) && ALIASES[f].test(norm[i])) { map[f] = i; used.add(i); break; }
    }
  }
  // 2) embedding fallback for anything still unmapped
  if (score) {
    for (const f of FIELD_KEYS) {
      if (map[f] != null) continue;
      let best = -1, bs = 0.34; // threshold: below this, don't guess
      for (let i = 0; i < headers.length; i++) {
        if (used.has(i)) continue;
        const s = score(f, headers[i]);
        if (s > bs) { bs = s; best = i; }
      }
      if (best >= 0) { map[f] = best; used.add(best); }
    }
  }
  // 3) title must exist — first unused column
  if (map.title == null) {
    for (let i = 0; i < headers.length; i++) if (!used.has(i)) { map.title = i; used.add(i); break; }
  }
  return map;
}

/** Apply a mapping to produce catalog items — verbatim, trimmed, blank rows skipped. */
export function tableToItems(t: ParsedTable, map: Mapping): FrameworkItem[] {
  const cell = (row: string[], f: FieldKey) => { const i = map[f]; return i != null && i >= 0 ? (row[i] ?? "").trim() : ""; };
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
