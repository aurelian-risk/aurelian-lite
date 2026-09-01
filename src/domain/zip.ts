// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// ZIP, read and written, with no library.
//
// The reader here is the one `xlsx.ts` has been using: it walks the CENTRAL DIRECTORY
// rather than the local headers, because a local header may carry no sizes at all (they
// follow the data instead) and a walk then loses its place. `docextract.ts` gets away with
// the local walk because it wants one member and stops.
//
// The writer exists for one reason: an export that carries the SOURCE FILES. A study
// references documents, and until now only their extracted text was kept — so a study
// handed to somebody else arrived without the PDFs it argues from. Base64 in the JSON was
// the alternative and is a bad one: it costs a third of the size again, and it turns a
// diffable text export into a wall of characters.
//
// Deflate is used where it pays and STORE where it does not, decided by measuring the
// member rather than by guessing from its name: a PDF is usually already compressed, and
// deflating it again spends time to gain nothing.
//
// No app dependencies, so it can be bundled and unit-tested on its own — scripts/zip-test.mjs.

export interface ZipEntry {
  name: string;
  /** Bytes as they are to be stored. */
  data: Uint8Array;
  /** Modification time; the ZIP clock has 2-second resolution. Defaults to the epoch, so
   *  the same input produces the same archive — a deterministic export stays diffable. */
  date?: Date;
}

const HAS_STREAMS = typeof DecompressionStream !== "undefined" && typeof CompressionStream !== "undefined";

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** CRC-32, which the format requires per member and in the directory. Table built once. */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS date/time, which is what the format stores. Two-second resolution, and years
 *  before 1980 cannot be expressed — those are clamped rather than written as garbage. */
function dosTime(d: Date): { time: number; date: number } {
  const y = Math.max(1980, d.getUTCFullYear());
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1),
    date: ((y - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

/** Read the members a caller asks for. Returns their inflated bytes by name.
 *
 *  A member that cannot be read is skipped rather than failing the whole archive: one
 *  unreadable part of a workbook is better than no workbook. */
export async function readZip(buf: ArrayBuffer, want: (name: string) => boolean = () => true): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  if (!HAS_STREAMS) return out;
  const u = new Uint8Array(buf), dv = new DataView(buf);
  // The end-of-directory record sits last, behind a comment of unknown length.
  let eocd = -1;
  for (let i = u.length - 22; i >= 0 && i > u.length - 22 - 65536; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return out;
  const entries = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  if (entries === 0xffff || p === 0xffffffff) return out;   // ZIP64 is not produced here
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

/** Just the member names and sizes, without inflating anything. */
export function listZip(buf: ArrayBuffer): { name: string; size: number }[] {
  const out: { name: string; size: number }[] = [];
  const u = new Uint8Array(buf), dv = new DataView(buf);
  let eocd = -1;
  for (let i = u.length - 22; i >= 0 && i > u.length - 22 - 65536; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return out;
  const entries = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let n = 0; n < entries && p + 46 <= u.length; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const size = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const cmtLen = dv.getUint16(p + 32, true);
    out.push({ name: dec.decode(u.subarray(p + 46, p + 46 + nameLen)), size });
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return out;
}

/** Build an archive. Members are written in the order given.
 *
 *  Whether a member is deflated is DECIDED BY MEASURING it: compressed if that comes out
 *  smaller, stored if it does not. A PDF, a JPEG or an already-zipped office file grows
 *  under deflate, and paying time to grow a file is the wrong trade. */
export async function writeZip(entries: ZipEntry[]): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const e of entries) {
    const name = enc.encode(e.name);
    const crc = crc32(e.data);
    let method = 0, body = e.data;
    if (HAS_STREAMS && e.data.length > 64) {
      try {
        const packed = await deflateRaw(e.data);
        if (packed.length < e.data.length) { method = 8; body = packed; }
      } catch { /* store it, then */ }
    }
    const { time, date } = dosTime(e.date ?? new Date(Date.UTC(1980, 0, 1)));

    const lh = new Uint8Array(30 + name.length);
    const ldv = new DataView(lh.buffer);
    ldv.setUint32(0, 0x04034b50, true);
    ldv.setUint16(4, 20, true);                 // version needed
    ldv.setUint16(6, 0x0800, true);             // UTF-8 names
    ldv.setUint16(8, method, true);
    ldv.setUint16(10, time, true);
    ldv.setUint16(12, date, true);
    ldv.setUint32(14, crc, true);
    ldv.setUint32(18, body.length, true);
    ldv.setUint32(22, e.data.length, true);
    ldv.setUint16(26, name.length, true);
    lh.set(name, 30);
    locals.push(lh, body);

    const ch = new Uint8Array(46 + name.length);
    const cdv = new DataView(ch.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(4, 20, true);                 // version made by
    cdv.setUint16(6, 20, true);                 // version needed
    cdv.setUint16(8, 0x0800, true);
    cdv.setUint16(10, method, true);
    cdv.setUint16(12, time, true);
    cdv.setUint16(14, date, true);
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, body.length, true);
    cdv.setUint32(24, e.data.length, true);
    cdv.setUint16(28, name.length, true);
    cdv.setUint32(42, offset, true);
    ch.set(name, 46);
    central.push(ch);

    offset += lh.length + body.length;
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const edv = new DataView(eocd.buffer);
  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(8, entries.length, true);
  edv.setUint16(10, entries.length, true);
  edv.setUint32(12, centralSize, true);
  edv.setUint32(16, offset, true);

  const total = offset + centralSize + 22;
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of [...locals, ...central, eocd]) { out.set(part, at); at += part.length; }
  return out;
}
