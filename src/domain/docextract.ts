// Offline plain-text extraction from Word (.docx) and PDF, so a text corpus can be
// imported without any external service or CDN. Uses the built-in DecompressionStream
// (deflate) - no libraries. .docx is exact; PDF is best-effort (works for most
// digitally-generated PDFs; scanned or heavily-subset-font PDFs may not extract).

const DECOMP = typeof DecompressionStream !== "undefined";

async function inflate(bytes: Uint8Array, format: "deflate-raw" | "deflate"): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const decodeEntities = (s: string) => s
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, "&");

// ── .docx (a ZIP; the body is word/document.xml) ─────────────────────────────
async function extractDocx(buf: ArrayBuffer): Promise<string> {
  if (!DECOMP) return "";
  const u = new Uint8Array(buf), dv = new DataView(buf);
  // scan local file headers for word/document.xml
  for (let i = 0; i + 30 < u.length; ) {
    if (dv.getUint32(i, true) !== 0x04034b50) break; // not a local header → stop scanning
    const method = dv.getUint16(i + 8, true);
    const compSize = dv.getUint32(i + 18, true);
    const nameLen = dv.getUint16(i + 26, true), extraLen = dv.getUint16(i + 28, true);
    const name = new TextDecoder().decode(u.subarray(i + 30, i + 30 + nameLen));
    const dataStart = i + 30 + nameLen + extraLen;
    if (name === "word/document.xml") {
      const raw = u.subarray(dataStart, dataStart + compSize);
      const xmlBytes = method === 8 ? await inflate(raw, "deflate-raw") : raw;
      const xml = new TextDecoder().decode(xmlBytes);
      return decodeEntities(
        xml.replace(/<\/w:p>/g, "\n").replace(/<w:tab[^>]*\/>/g, "\t").replace(/<[^>]+>/g, ""),
      ).replace(/\n{3,}/g, "\n\n").trim();
    }
    i = dataStart + compSize;
    if (compSize === 0 && method !== 0) break; // streamed sizes (data descriptor) - give up cleanly
  }
  return "";
}

// ── PDF (best-effort): inflate FlateDecode streams, pull text-showing operators ─
function pdfStrings(content: string): string {
  let out = "";
  // literal ( ... ) strings and hex < ... > strings inside text objects
  const re = /\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]+>|\bTJ\b|\bTj\b|\bT\*|\bTd\b|\bTD\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const t = m[0];
    if (t === "T*" || t === "Td" || t === "TD") { out += "\n"; continue; }
    if (t === "Tj" || t === "TJ") continue;
    if (t[0] === "(") {
      const esc: Record<string, string> = { n: "\n", r: "\r", t: "\t", "(": "(", ")": ")", "\\": "\\" };
      out += t.slice(1, -1).replace(/\\([()\\nrt])/g, (_, c) => esc[c] ?? c).replace(/\\(\d{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
    } else if (t[0] === "<") {
      const hex = t.slice(1, -1).replace(/\s+/g, "");
      for (let i = 0; i + 1 < hex.length; i += 2) { const code = parseInt(hex.substr(i, 2), 16); if (code) out += String.fromCharCode(code); }
    }
  }
  return out;
}

async function extractPdfBasic(buf: ArrayBuffer): Promise<string> {
  const u = new Uint8Array(buf);
  let latin = ""; for (let i = 0; i < u.length; i++) latin += String.fromCharCode(u[i]);
  let text = "";
  const streamRe = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = streamRe.exec(latin))) {
    const start = m.index + m[0].length;
    const end = latin.indexOf("endstream", start);
    if (end < 0) continue;
    const dictStart = latin.lastIndexOf("<<", m.index);
    const dict = dictStart >= 0 ? latin.slice(dictStart, m.index) : "";
    let bytes: Uint8Array = u.subarray(start, end);
    if (/\/FlateDecode/.test(dict) && DECOMP) {
      try { bytes = await inflate(bytes, "deflate"); } catch { continue; }
    } else if (/\/FlateDecode/.test(dict)) { continue; }
    let content = ""; for (let i = 0; i < bytes.length; i++) content += String.fromCharCode(bytes[i]);
    if (/BT|Tj|TJ/.test(content)) text += pdfStrings(content) + "\n";
  }
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// pdf.js on the MAIN THREAD (no Web Worker): setting globalThis.pdfjsWorker makes
// pdf.js use a LoopbackPort instead of spawning a worker - the only way it runs from
// the file:// origin (module/blob workers hang there). Loaded on demand. Handles font
// encodings / ToUnicode, so it reads real PDFs the lightweight scanner can't.
// Falls back to the scanner if pdf.js can't parse the file.
let pdfjsReady: Promise<typeof import("pdfjs-dist")> | null = null;
function loadPdfjs() {
  if (!pdfjsReady) pdfjsReady = (async () => {
    const pdfjs = await import("pdfjs-dist");
    // @ts-expect-error - the worker module isn't typed; it carries WorkerMessageHandler.
    (globalThis as Record<string, unknown>).pdfjsWorker = await import("pdfjs-dist/build/pdf.worker.min.mjs");
    return pdfjs;
  })();
  return pdfjsReady;
}

async function extractPdf(buf: ArrayBuffer): Promise<string> {
  try {
    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      for (const it of tc.items) if ("str" in it) text += it.str + (it.hasEOL ? "\n" : " ");
      text += "\n";
      page.cleanup();
    }
    await doc.destroy();
    const out = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (out) return out;
  } catch { /* fall back to the scanner */ }
  return extractPdfBasic(buf);
}

const ext = (name: string) => (name.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();

/** True for the binary formats we can extract text from (Word / PDF). */
export function isExtractable(name: string, mime: string): boolean {
  const e = ext(name);
  return e === "docx" || e === "pdf" || mime === "application/pdf" || mime.includes("wordprocessingml");
}

/** Extract plain text from a Word/PDF file; "" if nothing could be read. */
export async function extractFileText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const e = ext(file.name);
  try {
    if (e === "pdf" || file.type === "application/pdf") return await extractPdf(buf);
    if (e === "docx" || file.type.includes("wordprocessingml")) return await extractDocx(buf);
  } catch { /* fall through */ }
  return "";
}
