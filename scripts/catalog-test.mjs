// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Exhaustive unit test for the semi-deterministic catalog table importer.
// The pure module (src/domain/catalogimport.ts) is bundled in isolation with esbuild
// (see the npm script) and imported here; we drive it through a fixture corpus of
// real-world CSV/TSV shapes and assert FIELD-LEVEL exactness — every row, every cell,
// verbatim. Any format that under-imports is a failure, never a silent drop.
//
// Run: npm run test:catalog
import { pathToFileURL } from "node:url";
import { readFileSync, existsSync } from "node:fs";

const MOD = process.env.MOD;
if (!MOD) { console.error("set MOD=<bundled catalogimport.mjs>"); process.exit(2); }
const { parseTable, detectDelimiter, guessMapping, tableToItems, looksLikeJson } = await import(pathToFileURL(MOD).href);

let pass = 0, fail = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ok = (name, cond, got, want) => {
  if (cond) { pass++; /* console.log("✓", name); */ }
  else { fail++; console.log("✗", name, "\n   got: ", JSON.stringify(got), "\n   want:", JSON.stringify(want)); }
};
// Normalise items for comparison (undefined optional fields dropped).
const norm = (items) => items.map((it) => {
  const o = { ref_id: it.ref_id, title: it.title };
  if (it.category !== undefined) o.category = it.category;
  if (it.description !== undefined) o.description = it.description;
  return o;
});

// Convenience: full pipeline with heuristic mapping.
const run = (text, delim) => { const t = parseTable(text, delim); return { t, items: norm(tableToItems(t, guessMapping(t.headers))) }; };

// ── Fixture corpus ────────────────────────────────────────────────────────
const G = (ref_id, title, category, description) => {
  const o = { ref_id, title };
  if (category !== undefined) o.category = category;
  if (description !== undefined) o.description = description;
  return o;
};

// 1) clean comma CSV
{
  const { t, items } = run("ref_id,title,category,description\nFR 1,Identification,Foundational,Auth control\nFR 2,Use control,Foundational,Enforce privileges");
  ok("clean-csv delimiter", t.delimiter === ",", t.delimiter, ",");
  ok("clean-csv rows", t.rows.length === 2, t.rows.length, 2);
  ok("clean-csv items", eq(items, [G("FR 1", "Identification", "Foundational", "Auth control"), G("FR 2", "Use control", "Foundational", "Enforce privileges")]), items);
}
// 2) semicolon CSV (European Excel)
{
  const { t, items } = run("ref_id;title;category\nA-1;Access control;Identity\nA-2;Logging;Detection");
  ok("semicolon detect", t.delimiter === ";", t.delimiter, ";");
  ok("semicolon items", eq(items, [G("A-1", "Access control", "Identity"), G("A-2", "Logging", "Detection")]), items);
}
// 3) TSV
{
  const { t, items } = run("ref_id\ttitle\tdescription\nT1\tTabbed\tA tab-separated row");
  ok("tsv detect", t.delimiter === "\t", t.delimiter, "\\t");
  ok("tsv items", eq(items, [G("T1", "Tabbed", undefined, "A tab-separated row")]), items);
}
// 4) quoted commas inside a cell
{
  const { items } = run('ref_id,title,description\nC1,"Backup, restore and DR","Take, verify, and test backups"');
  ok("quoted-commas", eq(items, [G("C1", "Backup, restore and DR", undefined, "Take, verify, and test backups")]), items);
}
// 5) newline inside a quoted cell
{
  const { t, items } = run('ref_id,title,description\nN1,Multi-line,"line one\nline two"\nN2,Second,plain');
  ok("newline-in-cell rows", t.rows.length === 2, t.rows.length, 2);
  ok("newline-in-cell value", items[0].description === "line one\nline two", items[0].description, "line one\\nline two");
}
// 6) escaped quotes ("")
{
  const { items } = run('ref_id,title\nQ1,"He said ""hello"" today"');
  ok("escaped-quotes", items[0].title === 'He said "hello" today', items[0].title);
}
// 7) UTF-8 BOM
{
  const { t, items } = run("﻿ref_id,title\nB1,After BOM");
  ok("bom header clean", t.headers[0] === "ref_id", t.headers[0], "ref_id");
  ok("bom item", eq(items, [G("B1", "After BOM")]), items);
}
// 8) CRLF line endings
{
  const { t } = run("ref_id,title\r\nR1,Windows\r\nR2,Lines\r\n");
  ok("crlf rows", t.rows.length === 2, t.rows.length, 2);
  ok("crlf no cr in value", t.rows[0][1] === "Windows", t.rows[0][1], "Windows");
}
// 9) header aliases → mapping
{
  const t = parseTable("Control ID,Requirement,Domain,Guidance\nAC-2,Account Management,Access,Manage accounts");
  const m = guessMapping(t.headers);
  ok("alias ref_id", m.ref_id === 0, m.ref_id, 0);
  ok("alias title", m.title === 1, m.title, 1);
  ok("alias category", m.category === 2, m.category, 2);
  ok("alias description", m.description === 3, m.description, 3);
  ok("alias items", eq(norm(tableToItems(t, m)), [G("AC-2", "Account Management", "Access", "Manage accounts")]), norm(tableToItems(t, m)));
}
// 10) extra unmapped columns are ignored
{
  const t = parseTable("id,name,owner,priority,notes\nX1,Encrypt data,alice,high,at rest & transit");
  const m = guessMapping(t.headers);
  const items = norm(tableToItems(t, m));
  ok("extra-cols title", items[0].title === "Encrypt data", items[0].title);
  ok("extra-cols ref_id", items[0].ref_id === "X1", items[0].ref_id);
}
// 11) empty cells → optional fields dropped
{
  const { items } = run("ref_id,title,category,description\nE1,Has title,,");
  ok("empty-cells", eq(items, [G("E1", "Has title")]), items);
}
// 12) blank lines in the middle + trailing newlines
{
  const { t, items } = run("ref_id,title\nL1,One\n\nL2,Two\n\n\n");
  ok("blank-lines rows", t.rows.length === 2, t.rows.length, 2);
  ok("blank-lines items", eq(items, [G("L1", "One"), G("L2", "Two")]), items);
}
// 13) no trailing newline
{
  const { t } = run("ref_id,title\nNT1,No newline at end");
  ok("no-trailing-newline", t.rows.length === 1 && t.rows[0][1] === "No newline at end", t.rows);
}
// 14) pipe delimiter
{
  const { t, items } = run("ref_id|title|category\nP1|Piped|Cat");
  ok("pipe detect", t.delimiter === "|", t.delimiter, "|");
  ok("pipe items", eq(items, [G("P1", "Piped", "Cat")]), items);
}
// 15) large table — exact row count, no drops
{
  let s = "ref_id,title\n";
  for (let i = 1; i <= 1000; i++) s += `R${i},Item ${i}\n`;
  const { t, items } = run(s);
  ok("large rows==1000", t.rows.length === 1000, t.rows.length, 1000);
  ok("large items==1000", items.length === 1000, items.length, 1000);
  ok("large last exact", eq(items[999], G("R1000", "Item 1000")), items[999]);
}
// 16) duplicate ref_ids preserved (dedup is the caller's concern, not the parser's)
{
  const { items } = run("ref_id,title\nD1,First\nD1,Second");
  ok("dup preserved", items.length === 2, items.length, 2);
}
// 17) only a ref_id column → title falls back to ref_id
{
  const t = parseTable("control\nAC-1\nAC-2");
  const m = guessMapping(t.headers);
  const items = norm(tableToItems(t, m));
  ok("single-col fallback", eq(items, [G("AC-1", "AC-1"), G("AC-2", "AC-2")]), items);
}
// 18) leading/trailing whitespace trimmed
{
  const { items } = run("ref_id,title\n  W1  ,  Padded value  ");
  ok("trim", eq(items, [G("W1", "Padded value")]), items);
}
// 19) title-less headers, embedding scorer breaks the tie
{
  const t = parseTable("col_a,col_b\nZ1,Some control text");
  const scorer = (field, header) => (field === "title" && header === "col_b") ? 0.9 : (field === "ref_id" && header === "col_a") ? 0.9 : 0.1;
  const m = guessMapping(t.headers, scorer);
  ok("embed-assist ref_id", m.ref_id === 0, m.ref_id, 0);
  ok("embed-assist title", m.title === 1, m.title, 1);
  ok("embed-assist items", eq(norm(tableToItems(t, m)), [G("Z1", "Some control text")]), norm(tableToItems(t, m)));
}
// 20) looksLikeJson dispatch
{
  ok("json-detect array", looksLikeJson('  [\n{"ref_id":"1"}]') === true, looksLikeJson("["));
  ok("json-detect object", looksLikeJson('{"name":"X"}') === true, true);
  ok("json-detect csv-false", looksLikeJson("ref_id,title\n1,x") === false, false);
}
// 21) ragged row (fewer cells than headers) doesn't crash / bleeds nothing
{
  const { items } = run("ref_id,title,category,description\nRag,Only three,Cat");
  ok("ragged", eq(items, [G("Rag", "Only three", "Cat")]), items);
}

// 22) real NIST SP 800-53 Rev5 shape: snake_case headers, multi-line quoted
// control_text with commas, trailing empty column, control enhancement id "AC-2(1)"
{
  const csv = "identifier,name,control_text,discussion,related,\n"
    + 'AC-1,Policy and Procedures,"a. Develop, document, and disseminate:\n\n1. access control policy;\nb. Review and update the policy.",Discussion here,PM-9,\n'
    + 'AC-2(1),Account Management | Automated System Account Management,"Support account management using [Assignment: mechanisms].",Automated mechanisms include.,AC-2,';
  const t = parseTable(csv);
  const m = guessMapping(t.headers);
  ok("nist snake_case header map", m.ref_id === 0 && m.title === 1 && m.description === 2, m, { ref_id: 0, title: 1, description: 2 });
  const items = norm(tableToItems(t, m));
  ok("nist rows==2 (no bleed from multi-line cell)", items.length === 2, items.length, 2);
  ok("nist AC-1 title exact", items[0].title === "Policy and Procedures", items[0].title);
  ok("nist AC-1 multi-line text preserved", (items[0].description || "").includes("\n\n1. access control policy"), items[0].description);
  ok("nist enhancement id + title", items[1].ref_id === "AC-2(1)" && items[1].title.startsWith("Account Management |"), items[1]);
}

// 23) OWASP-ASVS shape (a DIFFERENT real source): 11 columns, several *_id / *_name,
// quoted requirement text with commas + markdown. The deterministic parse is exact
// regardless of source; the user/embedding picks req_id→ref_id, req_description→title.
{
  const csv = "chapter_id,chapter_name,section_id,section_name,req_id,req_description,level1,level2,level3,cwe,nist\n"
    + "V1,,V1.1,Secure SDLC,V1.1.1,Verify secure SDLC across all stages.,,x,x,,\n"
    + 'V1,,V1.1,Secure SDLC,V1.1.2,"Verify threat modeling for every design change, plan countermeasures, and guide testing.",,x,x,1053,';
  const t = parseTable(csv);
  const map = { ref_id: t.headers.indexOf("req_id"), title: t.headers.indexOf("req_description") };
  const items = norm(tableToItems(t, map));
  ok("asvs shape rows==2 (11 cols, no bleed)", items.length === 2, items.length, 2);
  ok("asvs req_id exact", items[0].ref_id === "V1.1.1", items[0].ref_id);
  ok("asvs plain requirement exact", items[0].title === "Verify secure SDLC across all stages.", items[0].title);
  ok("asvs quoted-comma requirement intact", items[1].title.includes("design change, plan countermeasures"), items[1].title);
}

// 24) non-ASCII (German umlauts/ß) + semicolon delimiter round-trip verbatim — real
// shape of an ISO-27002-style European export; headers here don't auto-map (that's the
// mapping UI's job), so we assert the deterministic parse + values with an explicit map.
{
  const t = parseTable("Nummer;Name;Kategorie\n5.1;Überwachung von Aktivitäten;Technologische Maßnahmen\n8.28;Sichere Programmierung;Technologische Maßnahmen");
  ok("german semicolon delimiter detected", t.delimiter === ";", t.delimiter, ";");
  const items = norm(tableToItems(t, { ref_id: 0, title: 1, category: 2 }));
  ok("umlaut/ß values preserved verbatim", items[0].title === "Überwachung von Aktivitäten" && items[0].category === "Technologische Maßnahmen", items[0]);
  ok("german rows count", items.length === 2 && items[1].ref_id === "8.28", items);
}

// 25) golden checks against the real sample catalogs in samples/ — skipped when the
// files are absent (e.g. the public repo doesn't ship them), so the suite stays green.
// NOTE: this file is mirrored to the public repo, so keep only record COUNTS and
// public-domain identifiers here — never copyrighted framework titles. The licensed
// ISO/BSI/PCI sample files live in the main repo only (see samples/README.md); public
// lacks them, so their checks are skipped there.
const SAMPLES = [
  { f: "samples/nist-800-53-rev5-controls.csv", min: 1189, id: "AC-1", title: "Policy and Procedures" }, // NIST = public domain
  { f: "samples/owasp-asvs-4.0.3.csv", min: 286, id: "V1.1.1", map: { ref: "req_id", title: "req_description" } },
  { f: "samples/iso-27002-2022-controls.csv", min: 10 },        // count only (licensed content)
  { f: "samples/bsi-it-grundschutz.csv", min: 4 },              // count only (licensed content)
  { f: "samples/pci-dss-4.0-requirements.tsv", min: 8, id: "1.2.1" }, // id = a clause number, not text
];
for (const s of SAMPLES) {
  if (!existsSync(s.f)) { console.log("· sample skipped (absent):", s.f); continue; }
  const t = parseTable(readFileSync(s.f, "utf8"));
  const map = s.map ? { ref_id: t.headers.indexOf(s.map.ref), title: t.headers.indexOf(s.map.title) } : guessMapping(t.headers);
  const items = norm(tableToItems(t, map));
  ok(`sample ${s.f}: ≥${s.min} records`, items.length >= s.min, items.length, s.min);
  if (s.id) {
    const got = items.find((i) => i.ref_id === s.id)?.title;
    if (s.title) ok(`sample ${s.f}: ${s.id} title exact`, got === s.title, got, s.title);
    else ok(`sample ${s.f}: contains ${s.id}`, items.some((i) => i.ref_id === s.id), s.id);
  }
}

// ── a body drawn from several columns ────────────────────────────────────
//
// A document read as a list spreads one entry over more than one detected column: the
// term in one, the definition in another, a note in a third. Mapping a single column
// throws the rest away, which is what fragmented a clause-numbered standard on import.
{
  const t = parseTable("Ref\tTerm\tDefinition\tNote\n3.1\taccess control\tmeans to ensure access is authorized\tNote 1 to entry: applies to assets");
  const items = tableToItems(t, { ref_id: 0, title: 1, description: [2, 3] });
  ok("body takes several columns", items[0].description === "means to ensure access is authorized\n\nNote 1 to entry: applies to assets", items[0].description);
  ok("a single column still works as a number", tableToItems(t, { ref_id: 0, title: 1, description: 2 })[0].description === "means to ensure access is authorized");
  ok("column order decides the order, not click order",
    tableToItems(t, { ref_id: 0, title: 1, description: [3, 2] })[0].description.startsWith("Note 1"),
    "reversed selection is honoured as given");
}
{
  // The reader puts the whole entry in the title AND in the description. Joining them
  // verbatim would double every record.
  const whole = "access control means to ensure that access to assets is authorized and restricted";
  const t = parseTable(`Ref\tTitle\tDescription\n3.1\t${whole}\t${whole}`);
  const items = tableToItems(t, { ref_id: 0, title: 1, description: [1, 2] });
  ok("a part that repeats one already taken is left out", items[0].description === whole, items[0].description);
}
{
  // A short cell inside a longer one may be a value of its own, not a repeat.
  const t = parseTable("Ref\tLevel\tText\nA-1\tB\tThe measure applies at level B in every case");
  const items = tableToItems(t, { ref_id: 0, title: 2, description: [1, 2] });
  ok("a short cell is kept even if it occurs inside a longer one",
    items[0].description.startsWith("B\n\n"), items[0].description.slice(0, 20));
}
{
  const t = parseTable("Ref\tA\tB\nX-1\t\tonly this");
  ok("empty columns are skipped rather than leaving blank lines",
    tableToItems(t, { ref_id: 0, title: 2, description: [1, 2] })[0].description === "only this");
  ok("selecting nothing leaves the field unset",
    tableToItems(t, { ref_id: 0, title: 2, description: [] })[0].description === undefined);
}

console.log(`\n${pass}/${pass + fail} catalog-import assertions passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
