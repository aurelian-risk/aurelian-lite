// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Reading a control catalogue that arrives as text rather than as a table.
//
// Most published catalogues share one shape once flattened: an identifier at the start
// of a line, a title, and often a short recurring marker in brackets. BSI Grundschutz,
// NIST SP 800-53, OWASP ASVS and CIS all look like that. So the reader here is not per
// publisher - it derives the identifier pattern and the marker vocabulary from the
// document itself, and every rejoining rule below corresponds to a named text-layout
// artefact rather than to a file that failed.
//
// Two deliberate limits. It under-detects rather than over-detects: a missed item shows
// up as a low count in the preview, an invented one does not. And it refuses input that
// does not look like a catalogue at all, instead of parsing noise into hundreds of rows.

/** One item as read off the text, before any mapping to entity fields. */
export interface ListItem {
  ref_id: string;
  title: string;
  /** The recurring bracketed marker, where the document uses one (BSI B/S/H, ASVS
   *  L1/L2/L3, NIST P1/P2/P3). Offered as a column; never interpreted here. */
  marker?: string;
  /** Text between this identifier and the next one. */
  description?: string;
  /** Nearest preceding heading, which usually names the group the item belongs to. */
  section?: string;
}

export interface ListRead {
  items: ListItem[];
  /** The identifier shape that won, as a readable pattern - shown in the preview so the
   *  analyst can see what the reader locked on to. */
  pattern: string;
  /** Distinct marker values found, in order of frequency. */
  markers: string[];
  /** Identifiers that appear in the text but were not read as items. Reported rather
   *  than hidden: it is the honest measure of how much the reader missed. */
  missed: string[];
}

export type Shape = "table" | "json" | "list" | "unknown";

export interface ShapeVerdict {
  shape: Shape;
  /** Why, in one line, for the preview. */
  reason: string;
}

// ── text repair ──────────────────────────────────────────────────────────
//
// PDF text extraction breaks lines at the width of the printed column, not at the end
// of a phrase. Each rule below repairs one such artefact. A rule with no artefact behind
// it does not belong here.

const NOISE = /[^\p{L}\p{N}\p{P}\p{Z}\n\r\t]/gu;

/** Share of characters that no text layer would legitimately produce. High values mean
 *  binary streams leaked out of the extractor, and nothing downstream should trust it. */
export function noiseRatio(text: string): number {
  if (!text) return 1;
  return (text.match(NOISE) ?? []).length / text.length;
}

/** Strip the runs of binary rubbish an extractor leaves behind, keeping line structure. */
function denoise(text: string): string {
  return text
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      if (!t) return true;
      const bad = (t.match(NOISE) ?? []).length;
      return bad / t.length < 0.2;                       // a line that is mostly noise is noise
    })
    .join("\n");
}

// ── marker discovery ─────────────────────────────────────────────────────

/** A short bracketed token that recurs across many items with few distinct values is a
 *  classification the publisher applied - BSI's B/S/H, ASVS's L1/L2/L3. Derived, so a
 *  scheme nobody anticipated is picked up too. */
function findMarkers(heads: string[]): Set<string> {
  const count = new Map<string, number>();
  for (const h of heads) {
    for (const m of h.matchAll(/\(([^()]{1,6})\)/g)) {
      const v = m[1].trim();
      if (!v || /^\d+$/.test(v)) continue;
      count.set(v, (count.get(v) ?? 0) + 1);
    }
  }
  const total = heads.length || 1;
  const common = [...count].filter(([, n]) => n / total >= 0.15);
  // Few distinct values, covering much of the catalogue - otherwise it is prose in
  // brackets, not a classification.
  if (common.length === 0 || common.length > 8) return new Set();
  const covered = common.reduce((a, [, n]) => a + n, 0) / total;
  return covered >= 0.4 ? new Set(common.map(([v]) => v)) : new Set();
}

// ── identifier discovery ─────────────────────────────────────────────────

/** Abstract a token to its shape: letters → A, digits → 9, separators kept. Two
 *  identifiers of the same scheme collapse to the same signature, which is what lets
 *  the reader find the scheme instead of being told it. */
function signature(tok: string): string {
  return tok.replace(/\p{Lu}/gu, "A").replace(/\p{Ll}/gu, "a").replace(/\d+/g, "9");
}

const CANDIDATE = /^([\p{Lu}\d][\p{Lu}\p{Ll}\d]*(?:[.\-_][\p{Lu}\p{Ll}\d]+)+)(?:[\s.:)\]]|$)/u;

/** Find the identifier scheme the document actually uses. */
function findScheme(lines: string[]): { sig: string; tokens: Map<string, number[]> } | null {
  const bySig = new Map<string, Map<string, number[]>>();
  lines.forEach((line, i) => {
    const m = CANDIDATE.exec(line.trim());
    if (!m) return;
    const tok = m[1];
    // A scheme needs at least one digit, or it is a word, not an identifier.
    if (!/\d/.test(tok)) return;
    const sig = signature(tok);
    const forSig = bySig.get(sig) ?? new Map<string, number[]>();
    (forSig.get(tok) ?? forSig.set(tok, []).get(tok)!).push(i);
    bySig.set(sig, forSig);
  });

  // Several schemes usually compete - a document numbers its sections as well as its
  // controls. Picking the most frequent would hand it to the section numbering, which
  // is what happened on the first run. Two properties separate them without naming any
  // publisher: a control scheme carries a recurring classification marker, and its
  // identifiers are more specific than a bare section number.
  const scored = [...bySig].filter(([, t]) => t.size >= 5).map(([sig, tokens]) => {
    const heads = [...tokens.values()].map((idxs) => lines[idxs[0]] ?? "");
    const markers = findMarkers(heads);
    const covered = markers.size
      ? heads.filter((h) => [...markers].some((m) => h.includes(`(${m})`))).length / heads.length
      : 0;
    const segments = (sig.match(/[.\-_]/g) ?? []).length;
    const hasLetters = /[Aa]/.test(sig) ? 1 : 0;
    return { sig, tokens, score: covered * 2 + hasLetters + segments * 0.25 + Math.min(1, tokens.size / 50) };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0] ? { sig: scored[0].sig, tokens: scored[0].tokens } : null;
}

// ── the reader ───────────────────────────────────────────────────────────

const HEADING = /^(?:\d+(?:\.\d+)*\s+)?\p{Lu}[\p{L}\p{Z}\d,&/'’-]{4,80}$/u;
/** How far a title may run past its identifier before the reader gives up on it. Set
 *  from the longest requirement titles seen in published catalogues, not tuned per file. */
const TITLE_MAX = 300;

export function readList(rawText: string): ListRead {
  const text = denoise(rawText);
  const lines = text.split("\n").map((l) => l.replace(/\s+/g, " ").trim());
  const scheme = findScheme(lines);
  if (!scheme) return { items: [], pattern: "", markers: [], missed: [] };

  // An identifier usually appears several times: once in a contents list, once where it
  // is defined, and again in cross-references. Taking the first occurrence picks the
  // contents entry, which carries no title and no body. The defining occurrence is the
  // one followed by the most prose, so that is the one taken.
  // The defining line carries the title; a contents entry carries dots and a page
  // number, and a cross-reference carries nothing at all. Counting letters on the line
  // itself separates them, and does not depend on what happens to follow.
  const substance = (at: number): number => {
    const l = lines[at];
    // Dot leaders belong to a contents entry and nowhere else. A line carrying them is
    // never the place a control is defined, however many words it holds.
    if (/\.{4,}/.test(l)) return 0;
    return (l.replace(CANDIDATE, "").match(/\p{L}/gu) ?? []).length;
  };
  const heads: { id: string; line: number }[] = [];
  for (const [tok, idxs] of scheme.tokens) {
    const at = idxs.length === 1 ? idxs[0] : idxs.reduce((a, b) => (substance(b) > substance(a) ? b : a));
    heads.push({ id: tok, line: at });
  }
  heads.sort((a, b) => a.line - b.line);

  // Build the head text of each item by rejoining wrapped lines.
  const headText = (start: number, stop: number): string => {
    let out = lines[start].replace(CANDIDATE, "").trim();
    let hyphenRun = false;
    for (let i = start + 1; i < stop && out.length < TITLE_MAX; i++) {
      const n = lines[i];
      if (n === "") continue;                                  // typographic line spacing
      // A hyphen that stood on a line of its own was its own text run, so it belongs to
      // the word - "Vier-Augen-Prinzip". A hyphen trailing a word is the printer breaking
      // that word at the column edge, so it goes - "authori-sation".
      if (/^[-–—]$/.test(n)) { out = out.replace(/[-–—]\s*$/, "") + "-"; hyphenRun = true; continue; }
      if (/[-–—]$/.test(out)) {
        out = out.replace(/[-–—]\s*$/, "") + (hyphenRun ? "-" : "") + n;
        hyphenRun = false; continue;
      }
      if (/\($/.test(out)) { out = out + n; }                   // bracket split across the break
      else out += " " + n;
      // A short closed bracket at the end is the publisher's classification, and the
      // heading block ends there.
      if (/\([^()]{1,6}\)\s*$/.test(out)) break;
      // A heading block rarely runs past a sentence end.
      if (/[.:;!?]$/.test(n)) break;
    }
    return out.replace(/\s+/g, " ").trim();
  };

  const raw = heads.map((h, k) => ({
    ...h,
    head: headText(h.line, Math.min(h.line + 8, heads[k + 1]?.line ?? lines.length)),
  }));
  const markers = findMarkers(raw.map((r) => r.head));

  let section = "";
  const sectionAt = new Map<number, string>();
  lines.forEach((l, i) => { if (HEADING.test(l) && !CANDIDATE.test(l)) sectionAt.set(i, l); });

  const items: ListItem[] = [];
  for (let k = 0; k < raw.length; k++) {
    const r = raw[k];
    for (const [i, h] of sectionAt) if (i < r.line) section = h;
    let title = r.head;
    let marker: string | undefined;
    if (markers.size) {
      for (const m of title.matchAll(/\(([^()]{1,6})\)/g)) {
        if (markers.has(m[1].trim())) { marker = m[1].trim(); title = title.slice(0, m.index).trim(); break; }
      }
    }
    title = title
      .replace(/\s*\.{3,}[\s.\d]*$/, "")        // dot leader and the page number behind it
      .replace(/\s*\[[^\]]*$/, "")
      .replace(/[\s.:,-]+$/, "").trim();
    if (!title) continue;                                       // an identifier with no title is a cross-reference
    const nextLine = raw[k + 1]?.line ?? lines.length;
    const body = lines.slice(r.line + 1, Math.min(nextLine, r.line + 40)).join(" ").replace(/\s+/g, " ").trim();
    items.push({
      ref_id: r.id, title: title.slice(0, TITLE_MAX), marker,
      description: body.slice(0, 2000) || undefined,
      section: section || undefined,
    });
  }

  const found = new Set(items.map((i) => i.ref_id));
  const missed = [...scheme.tokens.keys()].filter((t) => !found.has(t));
  return {
    items, pattern: scheme.sig,
    markers: [...markers],
    missed,
  };
}

// ── shape detection ──────────────────────────────────────────────────────

/** Decide what kind of input this is before anything tries to parse it. The point of
 *  this function is the `unknown` verdict: without it, arbitrary text gets read as a
 *  delimited table and produces hundreds of meaningless rows. */
export function detectShape(text: string, tableRows: number, tableCols: number): ShapeVerdict {
  const t = text.trim();
  if (!t) return { shape: "unknown", reason: "empty" };
  if (/^[[{]/.test(t)) return { shape: "json", reason: "starts as JSON" };

  // Judge the noise on what survives cleaning, not on the raw stream: extractors leak
  // binary runs that sit in their own lines and are simply dropped. Only if little
  // readable text is left is the input genuinely unusable.
  const clean = denoise(t);
  if (clean.replace(/\s/g, "").length < t.replace(/\s/g, "").length * 0.35) {
    return { shape: "unknown", reason: "most of the file is not text - it may have no text layer" };
  }
  if (noiseRatio(clean) > 0.05) {
    return { shape: "unknown", reason: `${Math.round(noiseRatio(clean) * 100)}% of the remaining characters are not text` };
  }

  const lines = t.split("\n").filter((l) => l.trim());
  // A real delimited table has a stable column count on most of its lines.
  if (tableCols >= 2 && tableRows >= 2) {
    const delim = [",", "\t", ";", "|"].map((d) => ({ d, n: lines.filter((l) => l.split(d).length === tableCols).length }))
      .sort((a, b) => b.n - a.n)[0];
    if (delim && delim.n / lines.length >= 0.6) {
      return { shape: "table", reason: `${tableCols} columns on ${Math.round(delim.n / lines.length * 100)}% of lines` };
    }
  }
  const probe = readList(t);
  if (probe.items.length >= 5) {
    return { shape: "list", reason: `${probe.items.length} entries of the form ${probe.pattern}` };
  }
  return { shape: "unknown", reason: "no table with stable columns and no repeated identifier pattern" };
}
