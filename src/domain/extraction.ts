// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Embeddings-based candidate extraction — fully taxonomy- and entity-neutral:
// nothing about any specific schema, type or example is hard-coded. Every signal
// is derived at runtime from (a) the taxonomy passed in and (b) the entities the
// active study already contains.
//
// Design (anti-overfitting):
//  A. Type PROTOTYPES from real data — each type is represented by the centroid
//     of the embeddings of the records that type already has in the study, and
//     falls back to its own label when it has none. No synthetic "concept" string
//     of field/option words (which biased matching), no baked-in examples.
//  B. RELATIVE, self-calibrating decisions — a sentence is accepted on an
//     absolute floor, and flagged "uncertain" when the margin between the best
//     and second-best type is small (abstention instead of confident-wrong).
//  C. STRUCTURE as a soft prior — a section heading nudges its sentences toward a
//     type, but when no heading exists the prior is absent and only the sentence
//     decides. No structural assumption is load-bearing.
import type { EntityRecord, EntityTypeDef, FieldValue, Taxonomy } from "./types";
import { fieldLabel, typeLabel, typeLabelPlural } from "./taxonomy";
import { cosine, embed } from "./embeddings";

export interface Candidate { name: string; snippet: string; score: number; uncertain?: boolean; typeKey: string; values: Record<string, FieldValue> }
export interface TypeCandidates { typeKey: string; label: string; candidates: Candidate[] }

interface Seg { text: string; heading: string | null }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
function unit(v: number[]): number[] { let m = 0; for (const x of v) m += x * x; m = Math.sqrt(m) || 1; return v.map((x) => x / m); }
function centroid(vecs: number[][]): number[] {
  const out = new Array(vecs[0].length).fill(0);
  for (const v of vecs) for (let i = 0; i < v.length; i++) out[i] += v[i];
  return unit(out);
}

/** True if a line reads like a section heading rather than a sentence. */
function isHeading(line: string): boolean {
  if (/^#{1,6}\s+\S/.test(line)) return true;                 // markdown heading
  if (/^\s*\d+[.)]\s+\S/.test(line) && line.split(/\s+/).length <= 12) return true; // "3. Feared events"
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length >= 1 && words.length <= 7 && !/[.!?]$/.test(line) && !/[;]/.test(line)) return true; // short label line
  return false;
}
const headingText = (line: string) => line.replace(/^#{1,6}\s+/, "").replace(/^\s*\d+[.)]\s+/, "").replace(/:$/, "").trim();

function splitSentences(paragraph: string): string[] {
  return paragraph.split(/(?<=[.!?])\s+(?=[A-Z(“"'\d])/).map((s) => s.trim()).filter(Boolean);
}

// Enumerations inside one sentence ("A, B, C and D", often after a ":" or dash)
// → one item each, so a list-style sentence extracts as well as one-item-per-
// sentence prose. Pure text heuristic, no schema knowledge.
function enumItems(sentence: string): string[] {
  let s = sentence.trim();
  const intro = s.match(/[:\-–—]\s+(.+)$/); // a list usually follows a ":" or dash
  if (intro) s = intro[1];
  const parts = s.split(/\s*,\s*|\s+and\s+|\s+or\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return [];
  const items = parts
    .map((p) => p.replace(/^(the|a|an)\s+/i, "").replace(/[.;:]+$/, "").trim())
    .filter((p) => p.length >= 3 && p.length <= 40 && p.split(/\s+/).length <= 5 && /[a-z]/i.test(p));
  // Only a list when nearly every fragment was a short, noun-ish item (otherwise
  // it is prose that merely contains commas).
  return items.length >= 3 && items.length >= parts.length - 1 ? items : [];
}

/** Parse into sentence segments, each carrying its section heading (title dropped). */
export function parseSegments(text: string): Seg[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: Seg[] = [];
  let heading: string | null = null;
  lines.forEach((line, i) => {
    if (i === 0) return;                        // first non-empty line = document title → skip
    if (isHeading(line)) { heading = headingText(line); return; }
    for (const s of splitSentences(line))
      if (s.length >= 12 && s.length <= 280) out.push({ text: s, heading });
  });
  if (!out.length) for (const s of splitSentences(text.replace(/\s+/g, " ")))
    if (s.length >= 12 && s.length <= 280) out.push({ text: s, heading: null });
  return out;
}

function shortName(seg: string): string {
  const words = seg.split(/\s+/).slice(0, 9).join(" ");
  return (words.length > 68 ? words.slice(0, 68) + "…" : words).replace(/[.,;:]+$/, "");
}

// The generic text of an existing record: its title plus its long-text field —
// derived from the taxonomy structure only, never from named fields.
function recordText(t: EntityTypeDef, rec: EntityRecord): string {
  const title = String(rec.values[t.titleField ?? "name"] ?? "").trim();
  const descF = t.fields.find((f) => f.type === "textarea");
  const desc = descF ? String(rec.values[descF.key] ?? "").trim() : "";
  return [title, desc].filter(Boolean).join(". ");
}

const HEADING_WEIGHT = 0.5;  // how much a section heading anchors its sentences
const SOFT_MARGIN = 0.05;    // top1−top2 below this → shown but flagged "uncertain"
const MAX_PROTO = 8;         // few-shot records per type prototype

export interface ExtractOpts { studyEntities?: EntityRecord[]; threshold?: number }

/** Extract candidates from text, grouped by type, with enum fields pre-filled.
 *  Favours recall: keeps everything over a modest floor and only *flags* the
 *  ambiguous ones (never drops them) — the embedding engine's job is to surface
 *  candidates, the user (or the smart engine) decides. */
export async function extractByEmbeddings(tax: Taxonomy, text: string, opts: ExtractOpts = {}): Promise<TypeCandidates[]> {
  const threshold = opts.threshold ?? 0.12;
  const segs = parseSegments(text);
  if (!segs.length) return [];

  const types = tax.entityTypes;
  const labelSet = new Set(types.flatMap((t) => [norm(typeLabel(t)), norm(typeLabelPlural(t))]));

  // (A) Prototype text pool per type: label/plural + up to MAX_PROTO real records.
  const byType = new Map<string, EntityRecord[]>();
  for (const e of opts.studyEntities ?? []) { const a = byType.get(e.type) ?? []; a.push(e); byType.set(e.type, a); }
  const protoTexts: string[] = [];
  const protoSpan: { start: number; count: number }[] = [];
  for (const t of types) {
    const start = protoTexts.length;
    protoTexts.push(`${typeLabel(t)}, ${typeLabelPlural(t)}`);
    for (const rec of (byType.get(t.key) ?? []).slice(0, MAX_PROTO)) { const txt = recordText(t, rec); if (txt) protoTexts.push(txt); }
    protoSpan.push({ start, count: protoTexts.length - start });
  }

  // Enum options across the taxonomy → embedded once, grouped by type|field.
  const optTexts: string[] = [];
  const optRef: { key: string; option: string }[] = [];
  for (const t of types) for (const f of t.fields) if (f.type === "enum" && f.options?.length)
    for (const o of f.options) { optRef.push({ key: t.key + "|" + f.key, option: o }); optTexts.push(`${fieldLabel(f)}: ${o}`); }

  const headings = [...new Set(segs.map((s) => s.heading).filter((h): h is string => !!h))];
  const headingIdx = new Map(headings.map((h, i) => [h, i]));

  const protoVecsFlat = await embed(protoTexts);
  const segVecs = await embed(segs.map((s) => s.text));
  const headVecs = headings.length ? await embed(headings) : [];
  const optVecs = optTexts.length ? await embed(optTexts) : [];

  const protoVecs = protoSpan.map((s) => centroid(protoVecsFlat.slice(s.start, s.start + s.count)));
  const headScore = headings.map((_, hi) => protoVecs.map((pv) => cosine(headVecs[hi], pv)));
  const optByField = new Map<string, { option: string; vec: number[] }[]>();
  optRef.forEach((r, i) => { const a = optByField.get(r.key) ?? []; a.push({ option: r.option, vec: optVecs[i] }); optByField.set(r.key, a); });

  // Score every segment; keep everything over the floor (favour recall), and
  // flag — but never drop — the ones where the top two types are close.
  interface Raw { i: number; bi: number; b1: number; margin: number }
  const raws: Raw[] = [];
  const seen = new Set<string>();
  segs.forEach((seg, i) => {
    const nseg = norm(seg.text);
    if (labelSet.has(nseg) || seen.has(nseg)) return; // drop heading echoes / duplicates
    seen.add(nseg);
    const hs = seg.heading != null ? headScore[headingIdx.get(seg.heading)!] : null;
    // (C) blend of the sentence's own similarity and its heading's prior.
    const scores = protoVecs.map((pv, ci) => {
      const s = cosine(segVecs[i], pv);
      return hs ? HEADING_WEIGHT * hs[ci] + (1 - HEADING_WEIGHT) * s : s;
    });
    let b1 = -1, b2 = -1, bi = -1;
    scores.forEach((s, ci) => { if (s > b1) { b2 = b1; b1 = s; bi = ci; } else if (s > b2) b2 = s; });
    if (bi < 0 || b1 < threshold) return;
    raws.push({ i, bi, b1, margin: b1 - b2 });
  });

  const out = new Map<string, Candidate[]>();
  for (const r of raws) {
    const t = types[r.bi];
    const seg = segs[r.i];
    const uncertain = r.margin < SOFT_MARGIN;
    const descF = t.fields.find((f) => f.type === "textarea");
    // Enum-field guesses from the sentence embedding (shared by all its items).
    const enumVals: Record<string, FieldValue> = {};
    for (const f of t.fields) if (f.type === "enum" && f.options?.length) {
      const options = optByField.get(t.key + "|" + f.key) ?? [];
      let best = "", bs = -1;
      for (const o of options) { const s = cosine(segVecs[r.i], o.vec); if (s > bs) { bs = s; best = o.option; } }
      if (best && bs >= 0.16) enumVals[f.key] = best;
    }
    // Only a CONFIDENT sentence that is a clear enumeration is expanded into one
    // candidate per list item (assigned its type); prose is never split — so a
    // list of assets extracts each item without misreading a comma-heavy sentence.
    const items = !uncertain && r.b1 >= threshold + 0.06 ? enumItems(seg.text) : [];
    const names = items.length >= 3 ? items : [shortName(seg.text)];
    const arr = out.get(t.key) ?? [];
    for (const nm of names) {
      const values: Record<string, FieldValue> = { ...enumVals };
      values[t.titleField ?? "name"] = nm;
      if (descF) values[descF.key] = seg.text; else values.description = seg.text;
      arr.push({ name: nm, snippet: seg.text, score: r.b1, uncertain, typeKey: t.key, values });
    }
    out.set(t.key, arr);
  }

  return types
    .map((t) => ({ typeKey: t.key, label: typeLabelPlural(t), candidates: (out.get(t.key) ?? []).sort((a, b) => b.score - a.score).slice(0, 20) }))
    .filter((tc) => tc.candidates.length > 0);
}
