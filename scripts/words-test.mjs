// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Do the word tables still point at anything?
//
// Proposed by the fork, and it closes a hole our own lookup rule opens: "nothing found,
// show what was authored" makes a STALE key indistinguishable from a MISSING one. Rename a
// type and its entry is orphaned; the register quietly falls back to English and nobody is
// told. From outside, that looks exactly like a language nobody has translated yet.
//
// So the tables are checked against the thing they describe, both ways:
//
//   no entry without a target — every key resolves to a type, group, field or check
//   no half-covered kind      — a kind is translated wholly or not at all, because the
//                               half that is missing shows in the other language and
//                               reads like a bug in the product rather than a gap
//
// Bundled WITH the language-model flag on, so the table is measured against every key the
// interface can declare. The words for that branch sit behind the same build gate as the
// branch itself — a translation of "Smart engine · Language model" is data and would
// otherwise ride into a build that cannot run one, which is what it did until it was
// caught here.
//
// It needs neither the browser nor the layer: it compares tables against the taxonomy.
// Run: npm run test:words
import { pathToFileURL } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const need = ["MOD_P", "MOD_L", "MOD_S", "MOD_W"];
for (const v of need) if (!process.env[v]) { console.error(`set ${need.join(" ")}`); process.exit(2); }
const { DEFAULT_TAXONOMY, WORDS } = await import(pathToFileURL(process.env.MOD_P).href);
const { lintStudy } = await import(pathToFileURL(process.env.MOD_L).href);
const { makeSampleStudy } = await import(pathToFileURL(process.env.MOD_S).href);
const { ENGINE_WORDS } = await import(pathToFileURL(process.env.MOD_W).href);

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { cond ? pass++ : fail++; console.log(`${cond ? "✓" : "✗"} ${name}${cond || !detail ? "" : `  — ${detail}`}`); };

// ── every key this build could answer ───────────────────────────────────────
/** Which checks EXIST, not which ones fired.
 *
 *  A lint run over the sample study answers the second question, and the fork showed why
 *  that is not the same: a check switched off, or one whose condition the sample does not
 *  meet, never appears — and its two entries then read as orphans. So the run and the
 *  declarations are put together; neither alone is the list. */
const checkIds = new Set([
  ...lintStudy(DEFAULT_TAXONOMY, makeSampleStudy()).map((c) => c.id),
  ...[...readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/domain/lint.ts"), "utf8")
    .matchAll(/\badd\(\s*"([a-z0-9-]+)"/g)].map((m) => m[1]),
]);
const known = new Set();
const kindOf = new Map();                       // key → which kind it belongs to
/** And WHICH TABLE answers for it. A kind may be split across the seam — the engine
 *  declares its own completeness checks, a product declares its own — so measuring a kind
 *  against one table reports a gap that is not that table's to fill. Raised by the fork,
 *  which words 32 checks of 52 and was told it had half a kind. */
const ownerOf = new Map();
const note = (key, kind, owner = "product") => { known.add(key); kindOf.set(key, kind); ownerOf.set(key, owner); };

for (const t of DEFAULT_TAXONOMY.entityTypes) {
  note(`type.${t.key}.label`, "type label");
  note(`type.${t.key}.plural`, "type plural");
  for (const f of t.fields) {
    for (const part of ["label", "help", "relation", "scale", "options"]) {
      note(`field.${f.key}.${part}`, `field ${part}`);
      note(`field.${t.key}.${f.key}.${part}`, `field ${part}`);
    }
  }
}
for (const g of DEFAULT_TAXONOMY.groups ?? []) {
  note(`group.${g.key}.label`, "group label");
  note(`group.${g.key}.description`, "group description");
}
for (const id of checkIds) { note(`check.${id}.title`, "check title", "engine"); note(`check.${id}.hint`, "check hint", "engine"); }
note("product.tagline", "product");

// The interface's own keys are READ OFF THE SOURCE, because that is where they are
// declared — `tr("ui.dash.new-study", "New study")`. A list kept here by hand would be a
// second place for them to live, and the first thing this test exists to catch is a key
// that has lost touch with the thing it names.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = [resolve(root, "src/App.tsx"),
  ...readdirSync(resolve(root, "src/components")).filter((f) => f.endsWith(".tsx")).map((f) => resolve(root, "src/components", f)),
  ...readdirSync(resolve(root, "src/domain")).filter((f) => f.endsWith(".ts")).map((f) => resolve(root, "src/domain", f))];
let uiKeys = 0, plurals = 0;
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/\b(?:tr|t)\(\s*['"]([a-z][a-zA-Z0-9_.-]+)['"]/g)) {
    if (/^(type|group|field|check|product)\./.test(m[1])) continue;   // already noted above
    // Per AREA, not as one blob of 380: a reader meets one screen at a time, so a screen
    // half in the other language is the defect — a screen not yet started is not. This is
    // also what makes the work possible in blocks without the check having to be lied to.
    note(m[1], `interface:${m[1].split(".")[1]}`, "engine"); uiKeys++;
  }
  // A counted phrase declares two keys, not one.
  for (const m of src.matchAll(/\btn\(\s*['"]([a-zA-Z0-9_.-]+)['"]/g)) {
    note(`${m[1]}.one`, "counted phrase", "engine"); note(`${m[1]}.many`, "counted phrase", "engine"); plurals++;
  }
  for (const m of src.matchAll(/<Sentence\s+k="([^"]+)"/g)) note(m[1], `interface:${m[1].split(".")[1]}`, "engine");
}
// Counts, not assertions. How far a tree has got with keying its own call sites is a
// milestone, not a property: a tree that has not started is not broken, and a threshold
// here would fail in every tree except the one it was written in. That the scanner works
// is shown where it matters — by the planted stale key below, which it has to catch.
console.log(`   read off the source: ${uiKeys} interface keys, ${plurals} counted phrases`);

ok("the taxonomy offers keys to translate", known.size > 100, `${known.size}`);
ok("the checks were read from a real run, not a copied list", checkIds.size > 0, `${checkIds.size} checks`);

// ── no entry without a target ───────────────────────────────────────────────
const orphans = [];
for (const [where, tables] of [["engine", ENGINE_WORDS], ["product", WORDS]]) {
  for (const [lang, overlay] of Object.entries(tables ?? {})) {
    for (const key of Object.keys(overlay)) if (!known.has(key)) orphans.push(`${where}/${lang}: ${key}`);
  }
}
ok("no entry points at something that is not there", orphans.length === 0, orphans.slice(0, 4).join(" · "));

// ── no half-covered kind ────────────────────────────────────────────────────
/** A kind translated in part is worse than one not translated at all: the missing half
 *  shows in the other language, in the middle of a screen that is otherwise translated,
 *  and reads as a defect rather than as a gap. */
function partial(tables, where) {
  const bad = [];
  for (const [lang, overlay] of Object.entries(tables ?? {})) {
    const byKind = new Map();
    for (const [key, kind] of kindOf) {
      // Only the keys THIS table is responsible for. Averaging both tables would hide a
      // real gap on one side behind the other's fullness.
      if (ownerOf.get(key) !== where) continue;
      const a = byKind.get(kind) ?? { have: 0, all: 0 };
      a.all++; if (key in overlay) a.have++;
      byKind.set(kind, a);
    }
    for (const [kind, a] of byKind) {
      // "field label" counts both the shared and the type-scoped key, so a table that
      // answers every field once covers half of them by construction. Only a kind that is
      // touched but plainly incomplete is reported.
      if (a.have > 0 && a.have < a.all && !kind.startsWith("field")) bad.push(`${where}/${lang}: ${kind} ${a.have}/${a.all}`);
    }
  }
  return bad;
}
const half = [...partial(ENGINE_WORDS, "engine"), ...partial(WORDS, "product")];
ok("no kind is translated only in part", half.length === 0, half.slice(0, 4).join(" · "));

// ── the checks have to be able to fail ──────────────────────────────────────
{
  const stale = { de: { "type.no_such_type.label": "Erfunden" } };
  const found = Object.keys(stale.de).filter((k) => !known.has(k));
  ok("a stale key IS detectable", found.length === 1, JSON.stringify(found));
  // "product" because a group label is the product's to word — the check now measures
  // each table against the keys it is responsible for, so the owner has to be the real one.
  const halfDone = { de: { [`group.${(DEFAULT_TAXONOMY.groups ?? [])[0]?.key}.label`]: "Eins" } };
  ok("a half-covered kind IS detectable", partial(halfDone, "product").some((s) => s.includes("group label")),
    partial(halfDone, "product").join(" · "));
}

console.log(`\n${pass}/${pass + fail} word-table assertions passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
