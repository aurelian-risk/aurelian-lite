// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Does the archive we write open anywhere else?
//
// Our own reader agreeing with our own writer proves nothing: two halves of one
// misunderstanding agree perfectly. So every archive built here is handed to Python's
// `zipfile` — an implementation that has never seen this code — and every archive Python
// builds is handed back to the reader. A format is a contract with strangers.
//
// Run: npm run test:zip
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MOD = process.env.MOD_Z;
if (!MOD) { console.error("set MOD_Z=<zip.mjs>"); process.exit(2); }
const { writeZip, readZip, listZip, crc32 } = await import(pathToFileURL(MOD).href);

let pass = 0, fail = 0;
const ok = (name, cond, got) => { cond ? pass++ : fail++; console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : `  got ${JSON.stringify(got)}`}`); };
const dir = mkdtempSync(join(tmpdir(), "zip-test-"));
const py = (code) => execFileSync("python3", ["-c", code], { encoding: "utf8" }).trim();
const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder().decode(b);

// ── CRC-32 against a known value ─────────────────────────────────────────────
// "123456789" is the standard check vector for CRC-32/ISO-HDLC.
ok("crc32 matches the published check vector", crc32(enc("123456789")) === 0xcbf43926, crc32(enc("123456789")).toString(16));

// ── what we write, a stranger reads ──────────────────────────────────────────
{
  // Three shapes on purpose: prose that compresses, bytes that do not, and a name with
  // non-ASCII in it - the flag that says "UTF-8 names" is easy to write and easy to forget.
  const prose = enc("the same sentence over and over. ".repeat(200));
  // Genuinely incompressible, and deterministic so the test is repeatable. The first
  // attempt used `(i * 2654435761) & 255`, which LOOKS like noise and deflates to a third
  // of its size - the writer measured it, chose deflate, and was right; the test was wrong.
  const noise = new Uint8Array(4096);
  let x = 0x9e3779b9;
  for (let i = 0; i < noise.length; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; noise[i] = x & 255; }
  const zip = await writeZip([
    { name: "bundle.json", data: enc(JSON.stringify({ kind: "ebios-bundle", version: 2 })) },
    { name: "docs/prose.txt", data: prose },
    { name: "docs/noise.bin", data: noise },
    { name: "docs/Prüfbericht Größe.pdf", data: enc("%PDF-1.4 fake") },
  ]);
  const f = join(dir, "ours.zip");
  writeFileSync(f, zip);

  const names = py(`import zipfile;print("|".join(zipfile.ZipFile(${JSON.stringify(f)}).namelist()))`);
  ok("python lists every member, names intact",
    names === "bundle.json|docs/prose.txt|docs/noise.bin|docs/Prüfbericht Größe.pdf", names);

  const bad = py(`import zipfile;z=zipfile.ZipFile(${JSON.stringify(f)});print(z.testzip() or "none")`);
  ok("...and every CRC checks out", bad === "none", bad);

  const body = py(`import zipfile;z=zipfile.ZipFile(${JSON.stringify(f)});print(z.read("docs/prose.txt").decode())`);
  ok("...and prose comes back byte-for-byte", body === dec(prose).trim(), body.slice(0, 40));

  const noiseHash = py(`import zipfile,hashlib;z=zipfile.ZipFile(${JSON.stringify(f)});print(hashlib.sha256(z.read("docs/noise.bin")).hexdigest()[:16])`);
  const expect = py(`import hashlib
x = 0x9e3779b9
out = bytearray()
for _ in range(4096):
    x ^= (x << 13) & 0xffffffff
    x ^= x >> 17
    x ^= (x << 5) & 0xffffffff
    out.append(x & 255)
print(hashlib.sha256(bytes(out)).hexdigest()[:16])`);
  ok("...and binary comes back unchanged", noiseHash === expect, `${noiseHash} vs ${expect}`);

  // Compression is a measurement, not a guess: prose shrinks, noise is stored as-is.
  const methods = py(`import zipfile;z=zipfile.ZipFile(${JSON.stringify(f)});print("|".join(f"{i.filename}:{i.compress_type}" for i in z.infolist()))`);
  ok("prose is deflated", /docs\/prose\.txt:8/.test(methods), methods);
  ok("...and incompressible bytes are stored, not grown", /docs\/noise\.bin:0/.test(methods), methods);
}

// ── what a stranger writes, we read ──────────────────────────────────────────
{
  const f = join(dir, "theirs.zip");
  py(`import zipfile
with zipfile.ZipFile(${JSON.stringify(f)}, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("bundle.json", '{"kind":"ebios-bundle"}')
    z.writestr("docs/a.txt", "hello " * 100)
    z.writestr("docs/b.bin", bytes(range(256)) * 4)
print("ok")`);
  const buf = readFileSync(f);
  const members = await readZip(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  ok("we read a python-made archive", members.size === 3, members.size);
  ok("...its json is intact", dec(members.get("bundle.json")) === '{"kind":"ebios-bundle"}', dec(members.get("bundle.json") ?? new Uint8Array()));
  ok("...its text is intact", dec(members.get("docs/a.txt")).startsWith("hello hello"), dec(members.get("docs/a.txt") ?? new Uint8Array()).slice(0, 20));
  const b = members.get("docs/b.bin");
  ok("...its bytes are intact", b?.length === 1024 && b[0] === 0 && b[255] === 255 && b[256] === 0, b?.length);
}

// ── the round trip, and the parts that are easy to get wrong ─────────────────
{
  const big = new Uint8Array(300 * 1024);
  for (let i = 0; i < big.length; i++) big[i] = i & 255;
  const zip = await writeZip([{ name: "big.bin", data: big }, { name: "empty.txt", data: new Uint8Array(0) }]);
  const back = await readZip(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength));
  const got = back.get("big.bin");
  ok("a large member survives the round trip", got?.length === big.length && got[12345] === big[12345], got?.length);
  ok("...and an empty one does not break the directory", back.get("empty.txt")?.length === 0, back.get("empty.txt")?.length);

  const listed = listZip(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength));
  ok("the listing gives names and ORIGINAL sizes without inflating",
    listed.length === 2 && listed[0].name === "big.bin" && listed[0].size === big.length, JSON.stringify(listed));
}

// ── the same input twice gives the same archive ──────────────────────────────
// A deterministic export is the point of this product's file format, and a timestamp taken
// from the clock would break it - two exports of an unchanged study would differ.
{
  const make = () => writeZip([{ name: "a.txt", data: enc("stable") }, { name: "b.bin", data: new Uint8Array([1, 2, 3]) }]);
  const [x, y] = [await make(), await make()];
  ok("two archives of the same input are byte-identical",
    x.length === y.length && x.every((v, i) => v === y[i]), `${x.length} vs ${y.length}`);
}

console.log(`\n${pass}/${pass + fail} zip assertions passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
