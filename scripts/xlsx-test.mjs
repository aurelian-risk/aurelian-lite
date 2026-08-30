// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Unit test for the .xlsx reader. The workbooks are BUILT here, byte by byte, rather
// than committed: a real catalogue may not live in this repository, and a fixture cut
// from one would invite tuning the reader until that one file passes. The real files
// are read at run time by harness/embed-import.mjs instead.
//
// Run: npm run test:xlsx
import { pathToFileURL } from "node:url";
import { zip } from "./xlsx-fixture.mjs";

/** The reader takes an ArrayBuffer, as it gets from File.arrayBuffer() in the app. */
const ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

const MOD = process.env.MOD_X;
if (!MOD) { console.error("set MOD_X=<bundled xlsx.mjs>"); process.exit(2); }
const { readWorkbook, isSpreadsheet, sheetToCsv } = await import(pathToFileURL(MOD).href);

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? (pass++, console.log("✓", name)) : (fail++, console.log("✗", name, extra)); };
const eq = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

const wbXml = (names) =>
  `<workbook><sheets>${names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`;
const relsXml = (n) =>
  `<Relationships>${Array.from({ length: n }, (_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`;
const ssXml = (strings) => `<sst>${strings.map((s) => `<si><t>${s}</t></si>`).join("")}</sst>`;

// ── a workbook of two sheets, shared + inline strings, a number and a date ───
const styles = `<styleSheet><numFmts><numFmt numFmtId="165" formatCode="dd\\.mm\\.yyyy"/></numFmts>`
  + `<cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="165"/><xf numFmtId="14"/></cellXfs></styleSheet>`;
const sheet1 = `<worksheet><sheetData>`
  + `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>`
  + `<row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2" t="inlineStr"><is><t>Account Management</t></is></c><c r="C2"><v>42</v></c><c r="D2" s="1"><v>45000</v></c></row>`
  // C3 is missing entirely: a gap inside a row must stay a gap, not shift the row left.
  + `<row r="3"><c r="A3" t="s"><v>5</v></c><c r="B3" t="s"><v>6</v></c><c r="D3" s="2"><v>45001</v></c></row>`
  // row 4 skipped by the writer, row 5 present
  + `<row r="5"><c r="A5" t="s"><v>7</v></c><c r="B5" t="str"><v>quoted &quot;thing&quot; &amp; co</v></c></row>`
  + `</sheetData></worksheet>`;
const sheet2 = `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>8</v></c></row></sheetData></worksheet>`;

const book = zip([
  ["xl/workbook.xml", wbXml(["Controls", "Notes &amp; Errata"])],
  ["xl/_rels/workbook.xml.rels", relsXml(2)],
  ["xl/sharedStrings.xml", ssXml(["Control Identifier", "Name", "Weight", "Reviewed",
    "AC-1", "AC-2", "Account, Management", "AC-3", "read me"])],
  ["xl/styles.xml", styles],
  ["xl/worksheets/sheet1.xml", sheet1],
  ["xl/worksheets/sheet2.xml", sheet2],
]);

const sheets = await readWorkbook(ab(book));

ok("both sheets are returned, in the workbook's order", sheets.length === 2 && sheets[0].name === "Controls");
ok("a sheet name's entities are decoded", sheets[1].name === "Notes & Errata");
eq("the header row reads as text", sheets[0].rows[0], ["Control Identifier", "Name", "Weight", "Reviewed"]);
eq("shared and inline strings both resolve", sheets[0].rows[1].slice(0, 2), ["AC-1", "Account Management"]);
ok("a plain number stays a number", sheets[0].rows[1][2] === "42");
ok("a custom date format is read as a date, not a serial number",
  sheets[0].rows[1][3] === "2023-03-15", sheets[0].rows[1][3]);
ok("a built-in date format is read as a date too",
  sheets[0].rows[2][3] === "2023-03-16", sheets[0].rows[2][3]);
eq("a missing cell leaves a gap rather than shifting the row", sheets[0].rows[2], ["AC-2", "Account, Management", "", "2023-03-16"]);
ok("a row number the writer skipped leaves an empty row", sheets[0].rows[3].length === 0);
ok("row 5 lands at index 4", (sheets[0].rows[4] ?? [])[0] === "AC-3");
ok("entities inside a cell are decoded", sheets[0].rows[4][1] === 'quoted "thing" & co');

// ── the CSV handoff has to survive the very characters catalogues contain ────
const csv = sheetToCsv(sheets[0].rows);
ok("a cell containing the delimiter is quoted", csv.includes('"Account, Management"'));
ok("a quote inside a cell is doubled", csv.includes('"quoted ""thing"" & co"'));
eq("the sheet is rectangular after the handoff",
  [...new Set(csv.split("\n").map((l) => l.split(",").length >= 4))], [true]);

// ── what it must NOT claim ──────────────────────────────────────────────────
ok("an .xlsx name is claimed", isSpreadsheet("catalog.xlsx"));
ok("the Excel mime type is claimed", isSpreadsheet("x", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
ok("the old binary .xls is NOT claimed", !isSpreadsheet("catalog.xls"));
ok(".ods is NOT claimed", !isSpreadsheet("catalog.ods"));
ok(".csv is NOT claimed", !isSpreadsheet("catalog.csv"));

// ── a file that is not a workbook must come back empty, not throw ───────────
const notZip = new TextEncoder().encode("ref_id,title\nA-1,Something").buffer;
ok("a non-ZIP file yields no sheets", (await readWorkbook(notZip)).length === 0);
const emptyZip = zip([["docProps/app.xml", "<Properties/>"]]);
ok("a ZIP that is not a workbook yields no sheets", (await readWorkbook(ab(emptyZip))).length === 0);

console.log(`\n${pass}/${pass + fail} xlsx assertions passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
