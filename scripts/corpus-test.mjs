// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Reading real catalogues, from the publishers' own files.
//
// The unit test beside this one (listimport-test.mjs) uses invented fixtures, because
// no catalogue may be committed here and a fixture built from one would invite tuning
// the reader until that one passes. This test does the opposite job: it fetches the
// original documents at run time and checks the reader against counts the publishers
// state themselves. Nothing is stored in the repository - only the addresses and the
// numbers to expect.
//
// It runs the real path: the same docextract.ts the app uses, in a browser, so pdf.js
// handles fonts and encodings. Running it in Node would silently exercise the fallback
// scanner instead and give quite different figures.
//
// Needs network. Run: npm run test:corpus
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const cache = resolve(root, "node_modules/.cache/corpus");
mkdirSync(cache, { recursive: true });

const BSI = "https://www.bsi.bund.de/SharedDocs/Downloads/DE/BSI/Grundschutz/IT-GS-Kompendium_Einzel_PDFs_2023";

/** `expect` is what the publisher states, or - where a publisher states no number - the
 *  behaviour that matters. `note` explains anything that is not a simple count. */
const SOURCES = [
  { id: "bsi-orp4", name: "BSI Grundschutz ORP.4", set: "development",
    url: `${BSI}/02_ORP_Organisation_und_Personal/ORP_4_Identitaets_und_Berechtigungsmanagement_Editon_2023.pdf?__blob=publicationFile`,
    expect: { shape: "list", pattern: "AAA.9.A9", minItems: 20, markers: ["B", "S"] } },
  { id: "bsi-con3", name: "BSI Grundschutz CON.3", set: "development",
    url: `${BSI}/03_CON_Konzepte_und_Vorgehensweisen/CON_3_Datensicherungskonzept_Edition_2023.pdf?__blob=publicationFile`,
    expect: { shape: "list", pattern: "AAA.9.A9", minItems: 13, markers: ["B", "S"] } },

  { id: "bsi-sys11", name: "BSI Grundschutz SYS.1.1", set: "validation",
    url: `${BSI}/07_SYS_IT_Systeme/SYS_1_1_Allgemeiner_Server_Edition_2023.pdf?__blob=publicationFile`,
    expect: { shape: "list", pattern: "AAA.9.9.A9", minItems: 30 } },
  { id: "bsi-net11", name: "BSI Grundschutz NET.1.1", set: "validation",
    url: `${BSI}/09_NET_Netze_und_Kommunikation/NET_1_1_Netzarchitektur_und_design_Edition_2023.pdf?__blob=publicationFile`,
    expect: { shape: "list", pattern: "AAA.9.9.A9", minItems: 30 } },

  { id: "nist-80053", name: "NIST SP 800-53r5", set: "validation",
    url: "https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-53r5.pdf",
    // NIST states 322 base controls for Revision 5.
    expect: { shape: "list", pattern: "AA-9", items: 322 } },
  { id: "cis-v8", name: "CIS Controls v8", set: "validation",
    url: "https://cybernetsecurity.com/industry-papers/CIS_Controls_v8_Online.22.02.pdf",
    // CIS states 153 Safeguards across the 18 Controls of version 8.
    expect: { shape: "list", pattern: "9.9", items: 153 } },
  { id: "iso-27000", name: "ISO/IEC 27000:2018", set: "validation",
    url: "https://www.mn.uio.no/ifi/forskning/grupper/sec/sikkerhetsledelse/iso_iec_27000_2018.pdf",
    // The one freely published standard of the series - a vocabulary, so the test is
    // that clause-numbered entries are read from the body and not from the contents.
    expect: { shape: "list", pattern: "9.9", minItems: 50, notContents: true } },
  { id: "nis2", name: "NIS2 Directive (EU) 2022/2555", set: "validation",
    url: "https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:32022L2555",
    // A directive is not a control catalogue. Reading a handful of numbered fragments
    // out of it is the correct outcome; reading hundreds would not be.
    expect: { maxItems: 20, note: "not a catalogue" } },
  { id: "asvs", name: "OWASP ASVS 4.0.3", set: "validation",
    url: "https://github.com/OWASP/ASVS/releases/download/v4.0.3_release/OWASP.Application.Security.Verification.Standard.4.0.3-en.pdf",
    // KNOWN MISS, asserted as such so it cannot regress unnoticed: the reader locks
    // onto the chapter numbering (V1.1) rather than the requirement numbering, because
    // neither scheme carries a marker and the two score within 0.03 of each other.
    // Left alone deliberately - closing it by adjusting the weights would be fitting
    // the reader to one document.
    expect: { shape: "list", pattern: "A9.9", knownMiss: "reads chapters, not requirements" } },
];

/** Catalogues published as OSCAL. Parsed in Node - the reader is pure JSON handling, so
 *  unlike the PDF path there is no browser-only code to exercise. */
const OSCAL_SOURCES = [
  {
    id: "bsi-gspp", name: "BSI Grundschutz++ (Anwenderkatalog)",
    url: "https://raw.githubusercontent.com/BSI-Bund/Stand-der-Technik-Bibliothek/main/control_layer/Grundschutz%2B%2B/Grundschutz%2B%2B-resolved_catalog.json",
    // Counted from the published catalogue itself. The numbers are asserted separately
    // because they fail differently: `items` changes when the BSI edits the ruleset, the
    // property set changes when they change its data model.
    //
    // 1000 requirements over four nesting levels - 652 at the top, 327 one below, 19 and 2
    // deeper. Sub-requirements are requirements in their own right here: every one of the
    // 1000 carries its own statement, security level and effort level. Counting only the
    // top level would lose a third of the ruleset.
    expect: {
      title: "Anwenderkatalog Grundschutz++",
      items: 1000,
      topLevel: 652,
      practices: 20,
      props: ["action_word", "alt-identifier", "authenticity", "availability", "confidentiality",
        "documentation", "effort_level", "integrity", "modal_verb", "result", "sec_level", "tags", "threats"],
      statement: { id: "BER.1.1", contains: "Berechtigung MUSS Verfahren und Regelungen" },
    },
  },
];

let pass = 0, fail = 0, skipped = 0;
const ok = (name, cond, extra = "") => { cond ? (pass++, console.log("✓", name)) : (fail++, console.log("✗", name, extra)); };

async function fetchTo(url, file) {
  if (existsSync(file) && readFileSync(file).length > 10000) return true;
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 10000) return false;
    writeFileSync(file, buf);
    return true;
  } catch { return false; }
}

// The probe page bundles the very modules the app ships, so what is measured is the
// product's own behaviour rather than a copy of it.
const entry = resolve(cache, "entry.ts");
writeFileSync(entry, `
import { extractFileText } from ${JSON.stringify(resolve(root, "src/domain/docextract"))};
import { readList, detectShape } from ${JSON.stringify(resolve(root, "src/domain/listimport"))};
(window as any).probe = async (bytes: number[], name: string) => {
  const file = new File([new Uint8Array(bytes)], name, { type: "application/pdf" });
  const t = await extractFileText(file);
  const r = readList(t);
  return { shape: detectShape(t).shape, items: r.items.length, pattern: r.pattern,
    markers: r.markers, titles: r.items.slice(0, 3).map((i) => i.title) };
};`);
execFileSync("npx", ["esbuild", entry, "--bundle", "--format=iife",
  `--outfile=${resolve(cache, "probe.js")}`, "--log-level=error"], { cwd: root });
writeFileSync(resolve(cache, "index.html"), '<!doctype html><meta charset=utf-8><body><script src="probe.js"></script>');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.goto("file://" + resolve(cache, "index.html"));
await page.waitForFunction(() => !!window.probe, null, { timeout: 20000 });

for (const s of SOURCES) {
  const file = resolve(cache, s.id + ".pdf");
  if (!(await fetchTo(s.url, file))) {
    skipped++; console.log("–", `${s.name} unavailable (network or the publisher moved it)`);
    continue;
  }
  const bytes = Array.from(readFileSync(file));
  const r = await page.evaluate(([b, n]) => window.probe(b, n), [bytes, s.id + ".pdf"]);
  const e = s.expect;
  const label = `${s.name} [${s.set}]`;

  if (e.shape) ok(`${label}: recognised as a ${e.shape}`, r.shape === e.shape, `got ${r.shape}`);
  if (e.pattern) ok(`${label}: identifier scheme ${e.pattern}`, r.pattern === e.pattern, `got ${r.pattern}`);
  if (e.items != null) ok(`${label}: ${e.items} entries, the published count`, r.items === e.items, `got ${r.items}`);
  if (e.minItems != null) ok(`${label}: at least ${e.minItems} entries`, r.items >= e.minItems, `got ${r.items}`);
  if (e.maxItems != null) ok(`${label}: at most ${e.maxItems} entries (${e.note})`, r.items <= e.maxItems, `got ${r.items}`);
  if (e.markers) ok(`${label}: derives the levels ${e.markers.join("/")}`,
    e.markers.every((m) => r.markers.includes(m)), `got [${r.markers}]`);
  if (e.notContents) ok(`${label}: reads the body, not the contents list`,
    !r.titles.some((t) => /\.{4,}/.test(t)), JSON.stringify(r.titles[0] ?? "").slice(0, 70));
  if (e.knownMiss) console.log(`  known miss · ${label}: ${e.knownMiss} (pattern ${r.pattern}, ${r.items} entries)`);
}
await browser.close();

// ── OSCAL catalogues ────────────────────────────────────────────────────
execFileSync("npx", ["esbuild", resolve(root, "src/domain/oscal.ts"), "--bundle", "--format=esm",
  `--outfile=${resolve(cache, "oscal.mjs")}`, "--log-level=error"], { cwd: root });
const { parseOscalCatalog } = await import(pathToFileURL(resolve(cache, "oscal.mjs")).href);

for (const s of OSCAL_SOURCES) {
  const file = resolve(cache, s.id + ".json");
  if (!(await fetchTo(s.url, file))) {
    skipped++; console.log("–", `${s.name} unavailable (network or the publisher moved it)`);
    continue;
  }
  const e = s.expect;
  let fw;
  try { fw = parseOscalCatalog(readFileSync(file, "utf8"), s.id); }
  catch (err) { fail++; console.log("✗", `${s.name}: parses`, err.message); continue; }

  ok(`${s.name}: reads the catalogue's own title`, fw.name === e.title, fw.name);
  ok(`${s.name}: ${e.items} requirements`, fw.items.length === e.items, `got ${fw.items.length}`);

  const practices = new Set(fw.items.map((i) => (i.section ?? "").split(" / ")[0]).filter(Boolean));
  ok(`${s.name}: ${e.practices} practices`, practices.size === e.practices, `got ${practices.size}`);

  const seen = new Set();
  for (const it of fw.items) for (const k of Object.keys(it.props ?? {})) seen.add(k);
  const missing = e.props.filter((p) => !seen.has(p));
  ok(`${s.name}: carries every published property`, missing.length === 0, `missing ${missing.join(", ")}`);

  const one = fw.items.find((i) => i.ref_id === e.statement.id);
  ok(`${s.name}: ${e.statement.id} keeps its requirement text`,
    !!one && one.description.includes(e.statement.contains), (one?.description ?? "").slice(0, 80));
  ok(`${s.name}: every requirement has text`, fw.items.every((i) => (i.description ?? "").trim().length > 0),
    `${fw.items.filter((i) => !(i.description ?? "").trim()).length} without`);
  // Sub-requirements carry the same properties as their parents, so nothing is lost by
  // flattening them into one list.
  ok(`${s.name}: every requirement carries its own security and effort level`,
    fw.items.every((i) => i.props?.sec_level && i.props?.effort_level),
    `${fw.items.filter((i) => !(i.props?.sec_level && i.props?.effort_level)).length} without`);
  const top = fw.items.filter((i) => (i.ref_id.match(/\./g) ?? []).length <= 2).length;
  ok(`${s.name}: ${e.topLevel} of them at the top level`, top === e.topLevel, `got ${top}`);
}

console.log(`\n${pass}/${pass + fail} corpus assertions passed · ${fail} failed${skipped ? ` · ${skipped} sources unavailable` : ""}`);
process.exit(fail ? 1 : 0);
