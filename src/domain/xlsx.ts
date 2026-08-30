// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Reading .xlsx offline, with no library: the file is a ZIP of XML parts and the
// built-in DecompressionStream inflates them, the same way docextract.ts reads .docx.
//
// A spreadsheet is not a document, so this does not produce prose: it produces ROWS,
// which the catalogue import already knows how to map. Every published control
// catalogue we tested ships as a workbook of several sheets - the controls, the
// evidence list, the assessment objectives - so the sheets are returned as a list and
// the caller asks which one is meant. Picking one silently would import the wrong
// table with no sign that it had happened.
//
// This module has NO app dependencies so it can be bundled and unit-tested in
// isolation - see scripts/xlsx-test.mjs.

export interface Sheet { name: string; rows: string[][] }

const DECOMP = typeof DecompressionStream !== "undefined";

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Read named members of a ZIP through its central directory.
 *
 *  docextract.ts walks the local headers instead, which is enough for .docx because it
 *  wants one member and stops. A workbook needs several from all over the file, and a
 *  local header may carry no sizes at all (they follow the data instead), so the walk
 *  would lose its place. The central directory states every offset outright. */
async function unzip(buf: ArrayBuffer, want: (name: string) => boolean): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  if (!DECOMP) return out;
  const u = new Uint8Array(buf), dv = new DataView(buf);
  // The end-of-directory record sits last, behind a comment of unknown length.
  let eocd = -1;
  for (let i = u.length - 22; i >= 0 && i > u.length - 22 - 65536; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return out;
  const entries = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  if (entries === 0xffff || p === 0xffffffff) return out; // ZIP64 - not produced for sheets this size
  const dec = new TextDecoder();
  for (let n = 0; n < entries && p + 46 <= u.length; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const cmtLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(u.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + cmtLen;
    if (!want(name)) continue;
    if (local + 30 > u.length || dv.getUint32(local, true) !== 0x04034b50) continue;
    const lNameLen = dv.getUint16(local + 26, true), lExtraLen = dv.getUint16(local + 28, true);
    const start = local + 30 + lNameLen + lExtraLen;
    const raw = u.subarray(start, start + compSize);
    try { out.set(name, method === 8 ? await inflateRaw(raw) : raw); } catch { /* skip a member we cannot read */ }
  }
  return out;
}

const decodeEntities = (s: string) => s
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&amp;/g, "&");

/** "BC" → 54. Column letters are base-26 with no zero. */
function colIndex(ref: string): number {
  let n = 0;
  for (const c of ref.replace(/[^A-Z]/g, "")) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/** Excel's serial day → ISO date. Day 1 is 1900-01-01, and the 1900 leap-year bug that
 *  the format keeps means the epoch to count from is 1899-12-30. */
function serialToDate(n: number): string {
  const ms = Math.round((n - 25569) * 86400000);
  const d = new Date(ms);
  if (!isFinite(d.getTime())) return String(n);
  const iso = d.toISOString();
  return n % 1 === 0 ? iso.slice(0, 10) : iso.slice(0, 16).replace("T", " ");
}

/** Which cell styles mean "this number is a date". Without this a date column reads as
 *  a five-digit number - wrong, and wrong silently, which is worse than refusing it. */
function dateStyles(stylesXml: string): Set<number> {
  const dateFmts = new Set<number>([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
  for (const m of stylesXml.matchAll(/<numFmt[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
    const code = decodeEntities(m[2]).replace(/\[[^\]]*\]/g, "").replace(/"[^"]*"/g, "");
    if (/[ymdhs]/i.test(code)) dateFmts.add(+m[1]);
  }
  const out = new Set<number>();
  const xfs = stylesXml.match(/<cellXfs[\s\S]*?<\/cellXfs>/)?.[0] ?? "";
  let i = 0;
  for (const m of xfs.matchAll(/<xf\b[^>]*>/g)) {
    const id = +(m[0].match(/numFmtId="(\d+)"/)?.[1] ?? 0);
    if (dateFmts.has(id)) out.add(i);
    i++;
  }
  return out;
}

function sharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let t = "";
    for (const m of si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) t += m[1];
    out.push(decodeEntities(t));
  }
  return out;
}

function sheetRows(xml: string, shared: string[], dates: Set<number>): string[][] {
  const rows: string[][] = [];
  for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const at = +(rm[1].match(/\br="(\d+)"/)?.[1] ?? rows.length + 1);
    const cells: string[] = [];
    for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1], body = cm[2] ?? "";
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      const style = +(attrs.match(/\bs="(\d+)"/)?.[1] ?? -1);
      let v = "";
      if (type === "inlineStr") {
        for (const m of body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) v += m[1];
        v = decodeEntities(v);
      } else {
        const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        if (raw != null) {
          if (type === "s") v = shared[+raw] ?? "";
          else if (type === "b") v = raw === "1" ? "TRUE" : "FALSE";
          else if (type === "e") v = decodeEntities(raw);
          else if (dates.has(style) && raw !== "" && isFinite(+raw)) v = serialToDate(+raw);
          else v = decodeEntities(raw);
        }
      }
      const i = ref ? colIndex(ref) : cells.length;
      while (cells.length < i) cells.push("");
      cells[i] = v;
    }
    // A skipped row number means empty rows the writer left out; keep the shape.
    while (rows.length < at - 1) rows.push([]);
    rows[at - 1] = cells;
  }
  return rows;
}

/** Every sheet of a workbook, in the order the workbook lists them. */
export async function readWorkbook(buf: ArrayBuffer): Promise<Sheet[]> {
  const parts = await unzip(buf, (n) =>
    n === "xl/workbook.xml" || n === "xl/_rels/workbook.xml.rels" || n === "xl/sharedStrings.xml"
    || n === "xl/styles.xml" || n.startsWith("xl/worksheets/"));
  const dec = new TextDecoder();
  const text = (n: string) => (parts.has(n) ? dec.decode(parts.get(n)!) : "");
  const wb = text("xl/workbook.xml");
  if (!wb) return [];
  const rels: Record<string, string> = {};
  for (const m of text("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    rels[m[1]] = "xl/" + m[2].replace(/^\/?xl\//, "").replace(/^\.\//, "");
  }
  const shared = sharedStrings(text("xl/sharedStrings.xml"));
  const dates = dateStyles(text("xl/styles.xml"));
  const out: Sheet[] = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const name = decodeEntities(m[0].match(/\bname="([^"]*)"/)?.[1] ?? `Sheet ${out.length + 1}`);
    const rid = m[0].match(/r:id="([^"]+)"/)?.[1] ?? "";
    const path = rels[rid];
    const xml = path ? text(path) : "";
    if (!xml) { out.push({ name, rows: [] }); continue; }
    out.push({ name, rows: sheetRows(xml, shared, dates) });
  }
  return out;
}

const ext = (name: string) => (name.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();

/** True for a workbook this module can read. `.xls` (the old binary format) and `.ods`
 *  are NOT this format and are deliberately not claimed. */
export function isSpreadsheet(name: string, mime = ""): boolean {
  return ext(name) === "xlsx" || mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

const csvCell = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** Rows → CSV, so the existing table parser reads a sheet exactly as it reads a file.
 *  Trailing empty rows and columns are dropped; interior gaps are kept, because a blank
 *  cell in the middle of a catalogue is data. */
export function sheetToCsv(rows: string[][]): string {
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  const trimmed = rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ""));
  while (trimmed.length && trimmed[trimmed.length - 1].every((c) => c.trim() === "")) trimmed.pop();
  return trimmed.map((r) => r.map(csvCell).join(",")).join("\n");
}
