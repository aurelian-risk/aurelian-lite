// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Reading a catalogue that arrives as text rather than as a table.
//
// This half of the testing is unit-level and its fixtures are invented, because no
// catalogue may be committed here and a fixture built from one would invite tuning the
// reader until that catalogue passes. What these reproduce are the LAYOUT ARTEFACTS a
// PDF text layer produces - hyphenation at the line break, a bracket split across it,
// blank lines inside a heading, a contents list that repeats every identifier. Those
// are what the reader has to survive, and they are publisher-independent.
//
// The other half runs against the publishers' own documents: `npm run test:corpus`
// fetches BSI, NIST, CIS, ISO, NIS2 and OWASP originals and checks the reader against
// the counts those publishers state. Neither test replaces the other - this one says
// why the reader fails when it fails, that one says whether it works on real files.
//
// Run: npm run test:list
import { pathToFileURL } from "node:url";

const need = (n) => { const v = process.env[n]; if (!v) { console.error(`set ${n}`); process.exit(2); } return v; };
const { readList, detectShape, noiseRatio } = await import(pathToFileURL(need("MOD_L")).href);
const { parseTable } = await import(pathToFileURL(need("MOD_CI")).href);

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? (pass++, console.log("✓", name)) : (fail++, console.log("✗", name, extra)); };

// ── 1. the shapes a reader has to recognise ──────────────────────────────
//
// Four invented schemes, none of them any publisher's. What matters is that the reader
// derives the scheme rather than being told it.
const schemes = [
  { name: "dotted with a letter segment", ids: (i) => `ZZZ.7.A${i}`, sig: "AAA.9.A9" },
  { name: "hyphenated two-letter", ids: (i) => `QQ-${i}`, sig: "AA-9" },
  { name: "purely numeric, three levels", ids: (i) => `9.4.${i}`, sig: "9.9.9" },
  { name: "letter-prefixed version style", ids: (i) => `W${i}.2.1`, sig: "A9.9.9" },
];
for (const s of schemes) {
  const text = Array.from({ length: 12 }, (_, k) =>
    `${s.ids(k + 1)} Some requirement title number ${k + 1}\nA sentence of body text belonging to it.\n`).join("\n");
  const r = readList(text);
  ok(`derives the scheme: ${s.name}`, r.items.length === 12 && r.pattern === s.sig,
    `${r.items.length} items, pattern ${r.pattern}`);
}

// ── 2. layout artefacts of a PDF text layer ─────────────────────────────
{
  // Hyphenation: the printer broke a word at the column edge.
  const t = `AB-1 Identity and authori-\nsation management concept (X)\nBody.\n\nAB-2 Second item (Y)\nBody.\n` +
    Array.from({ length: 8 }, (_, k) => `AB-${k + 3} Filler item ${k} (X)\nBody.\n`).join("\n");
  const r = readList(t);
  const first = r.items.find((i) => i.ref_id === "AB-1");
  ok("rejoins a word broken at the line end", !!first && /authorisation/.test(first.title), first?.title);
}
{
  // The hyphen ends up on a line of its own - common when the extractor emits each
  // text-showing operator separately.
  const t = `CD-1 Four\n-\nEyes\n-\nPrinciple for administration (H)\nBody.\n` +
    Array.from({ length: 8 }, (_, k) => `CD-${k + 2} Filler ${k} (B)\nBody.\n`).join("\n");
  const r = readList(t);
  const first = r.items.find((i) => i.ref_id === "CD-1");
  ok("rejoins a hyphen left on its own line", !!first && /Four-Eyes-Principle/.test(first.title), first?.title);
}
{
  // The classification marker itself is torn across the break. The vocabulary is kept
  // balanced on purpose: a marker that appears once is legitimately too rare to count as
  // a classification, and testing the healing must not depend on that separate rule.
  const t = `EF-1 Maintaining information security (\nS)\nBody.\n` +
    Array.from({ length: 9 }, (_, k) => `EF-${k + 2} Filler ${k} (${k % 2 ? "S" : "B"})\nBody.\n`).join("\n");
  const r = readList(t);
  const first = r.items.find((i) => i.ref_id === "EF-1");
  ok("heals a marker split across the line break", !!first && first.marker === "S", JSON.stringify(first));
}
{
  // Blank lines inside the heading block, from line spacing in the original.
  const t = `GH-1\n\nPreconditions for online backup (S)\nBody.\n` +
    Array.from({ length: 8 }, (_, k) => `GH-${k + 2} Filler ${k} (B)\nBody.\n`).join("\n");
  const r = readList(t);
  const first = r.items.find((i) => i.ref_id === "GH-1");
  ok("looks past blank lines inside a heading", !!first && /Preconditions/.test(first.title), first?.title);
}
{
  // A contents list repeats every identifier before the body defines it. Taking the
  // first occurrence would collect the contents entries, which carry no title.
  const body = Array.from({ length: 10 }, (_, k) => `IJ-${k + 1} Real title of item ${k + 1} (B)\nSeveral words of body text that make this the substantial occurrence of the identifier.\n`).join("\n");
  const toc = Array.from({ length: 10 }, (_, k) => `IJ-${k + 1} ....... ${k + 3}`).join("\n");
  const r = readList(`Contents\n${toc}\n\n${body}`);
  ok("prefers the defining occurrence over a contents entry",
    r.items.length === 10 && r.items.every((i) => /Real title/.test(i.title)),
    `${r.items.length} items, first "${r.items[0]?.title}"`);
}

// ── 3. what must be derived, not enumerated ─────────────────────────────
{
  // A classification vocabulary nobody anticipated.
  const t = Array.from({ length: 12 }, (_, k) =>
    `KL-${k + 1} Item ${k + 1} (${["ALPHA", "BETA", "GAMMA"][k % 3]})\nBody.\n`).join("\n");
  const r = readList(t);
  ok("derives an unfamiliar marker vocabulary",
    r.markers.length === 3 && r.markers.includes("ALPHA") && r.items[0].marker === "ALPHA",
    JSON.stringify(r.markers));
}
{
  // Section numbering competes with the control scheme. The control scheme is the one
  // carrying the recurring marker.
  const sections = Array.from({ length: 14 }, (_, k) => `${k + 1}.1 Section heading ${k + 1}\nIntro prose.\n`).join("\n");
  const controls = Array.from({ length: 10 }, (_, k) => `MN-${k + 1} Control title ${k + 1} (B)\nBody text.\n`).join("\n");
  const r = readList(`${sections}\n${controls}`);
  ok("prefers the classified scheme over section numbering", r.pattern === "AA-9",
    `chose ${r.pattern} with ${r.items.length} items`);
}

// ── 4. refusing what is not a catalogue ─────────────────────────────────
//
// The failure this whole module exists to prevent: arbitrary text read as a delimited
// table, yielding hundreds of rows that look like a result.
{
  const prose = "This is an ordinary report about an incident. ".repeat(80);
  const v = detectShape(prose, parseTable(prose));
  ok("refuses continuous prose", v.shape === "unknown", `${v.shape}: ${v.reason}`);
}
{
  const binary = Array.from({ length: 400 }, (_, i) => String.fromCharCode((i * 7) % 30)).join("") + "|a|b|c";
  const v = detectShape(binary, parseTable(binary));
  ok("refuses a stream with no text layer", v.shape === "unknown", `${v.shape}: ${v.reason}`);
}
{
  const csv = "id,title,level\n" + Array.from({ length: 20 }, (_, k) => `A-${k},Title ${k},B`).join("\n");
  const v = detectShape(csv, parseTable(csv));
  ok("still recognises a real table", v.shape === "table", `${v.shape}: ${v.reason}`);
}
{
  const list = Array.from({ length: 12 }, (_, k) => `OP-${k + 1} Title ${k + 1} (B)\nBody.\n`).join("\n");
  const v = detectShape(list, parseTable(list));
  ok("recognises an identifier-led list", v.shape === "list", `${v.shape}: ${v.reason}`);
}
// Every dash a publisher breaks a word with, not just the hyphen. The class /[-–—]/ is
// three characters that look alike and sort alike, so a blanket "normalise the dashes"
// pass over a tree can rewrite one INSIDE the class and leave every assertion green -
// which is what happened in the sibling product. Naming all three here fails loudly on a
// class that has lost one.
for (const [name, dash] of [["hyphen", "-"], ["en dash", "\u2013"], ["em dash", "\u2014"]]) {
  const text = Array.from({ length: 8 }, (_, k) =>
    `A-${k + 1} authori${dash}\nsation of access\nBody text.\n`).join("\n");
  const r = readList(text);
  ok(`a word broken with ${name === "hyphen" ? "a" : "an"} ${name} is joined`,
    r.items.length === 8 && /authorisation/.test(r.items[0]?.title ?? ""),
    (r.items[0]?.title ?? "").slice(0, 30));
}

// The gate has to answer on the SAME reading as the parser behind it. A control text
// that runs over several lines, or carries a comma, breaks a raw newline/delimiter split
// while the parser reads it correctly - and a gate stricter than its parser can only
// refuse work that parser could have done. Both shapes below did exactly that.
{
  const wrapped = 'id,title,text\n'
    + Array.from({ length: 30 }, (_, k) =>
        `A-${k},Title ${k},"First sentence.\nSecond, with a comma.\nThird."`).join("\n");
  const p = parseTable(wrapped);
  ok("a field may run over several lines", p.rows.length === 30 && p.headers.length === 3,
    `${p.rows.length} x ${p.headers.length}`);
  const v = detectShape(wrapped, p);
  ok("...and the gate reads it as the table it is", v.shape === "table", `${v.shape}: ${v.reason}`);
}
{
  const commas = 'id,title,text\n'
    + Array.from({ length: 30 }, (_, k) => `A-${k},Title ${k},"One, two, three, four"`).join("\n");
  const v = detectShape(commas, parseTable(commas));
  ok("a comma inside a field does not make it prose", v.shape === "table", `${v.shape}: ${v.reason}`);
}
{
  // The refusal still has to hold where the parser itself found no shape.
  const ragged = "Heading\nsome text, more text\nand a line\n" + "prose, prose, prose\n".repeat(20);
  const v = detectShape(ragged, parseTable(ragged));
  ok("ragged text is still refused", v.shape !== "table", `${v.shape}: ${v.reason}`);
}
{
  ok("noise ratio separates text from a binary stream",
    noiseRatio("plain readable text") < 0.01
    && noiseRatio(Array.from({ length: 200 }, (_, i) => String.fromCharCode(i % 25)).join("")) > 0.5);
}

// ── 5. under-detect rather than over-detect ─────────────────────────────
{
  // Cross-references without a title must not become items.
  const t = Array.from({ length: 10 }, (_, k) => `QR-${k + 1} Genuine title ${k + 1} (B)\nBody mentioning QR-3 and QR-7 again.\n`).join("\n")
    + "\nRelated:\nQR-3\nQR-7\n";
  const r = readList(t);
  ok("a bare identifier does not become an entry", r.items.length === 10, `${r.items.length} items`);
}
{
  const r = readList("nothing here but words, and not many of them");
  ok("returns nothing rather than guessing", r.items.length === 0 && r.pattern === "");
}

console.log(`\n${pass}/${pass + fail} list-import assertions passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
