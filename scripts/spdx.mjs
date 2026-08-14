// Keeps the licence marker on every source file.
//
// MPL-2.0 is copyleft PER FILE: what is covered is decided by which files carry the
// notice, not by the licence sitting at the root. A new file without it is a file whose
// status is arguable, so this runs as a check rather than as a one-off edit.
//
//   npm run spdx          add the marker wherever it is missing
//   npm run spdx:check    list files without it and exit non-zero
//
// Third-party files are never touched: everything here is walked from src/ and scripts/,
// which contain this project's own code only.
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOLDER = "Aurelian-Risk";
const ID = "MPL-2.0";

/** The SPDX identifier is the marker; the full Exhibit A notice sits in LICENSE, in
 *  index.html and in the README. Kept to one line per file on purpose - every module here
 *  opens with a comment explaining what it is for, and that is the more useful thing to
 *  read first. */
const line = (open, close) => `${open} SPDX-License-Identifier: ${ID} · Copyright (c) ${HOLDER}${close}`;
const STYLE = {
  ".ts": line("//", ""), ".tsx": line("//", ""), ".mjs": line("//", ""), ".js": line("//", ""),
  ".css": line("/*", " */"),
};

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "media"]);
const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = resolve(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (STYLE[extname(p)]) out.push(p);
  }
  return out;
};

const files = [...walk(resolve(root, "src")), ...walk(resolve(root, "scripts"))];
const check = process.argv.includes("--check");
const missing = [];
let added = 0;

for (const f of files) {
  const text = readFileSync(f, "utf8");
  if (text.includes("SPDX-License-Identifier:")) continue;
  const rel = f.slice(root.length + 1);
  if (check) { missing.push(rel); continue; }
  // Prepended, so it survives a file whose first line is a shebang-free comment block.
  writeFileSync(f, `${STYLE[extname(f)]}\n${text}`);
  added++;
}

if (check) {
  if (missing.length) {
    console.log(`${missing.length} file${missing.length === 1 ? "" : "s"} without a licence marker:`);
    for (const m of missing) console.log("  " + m);
    console.log(`\nRun: npm run spdx`);
    process.exit(1);
  }
  console.log(`${files.length} source files carry the ${ID} marker`);
} else {
  console.log(`${added} marker${added === 1 ? "" : "s"} added · ${files.length} source files total`);
}
