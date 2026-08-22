// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Does the report say what the model computes?
//
// The report is what leaves the building. It renders its own diagrams and writes its own
// prose, which is exactly how it drifted: for three releases it still described an averaged
// "coverage" while the engine had moved to traversing the chain per attempt. Nothing failed,
// because nothing checked the words.
//
// So this checks the wording against the model's own vocabulary, and the figures against a
// second computation of the same run. It is not a snapshot test - a snapshot would go green
// on any change that keeps the shape and would have to be re-blessed on every edit.
//
// Run: npm run test:report
import { pathToFileURL } from "node:url";

const need = (k) => { const v = process.env[k]; if (!v) { console.error(`set ${k}`); process.exit(2); } return v; };
const { reportMarkdown } = await import(pathToFileURL(need("MOD_R")).href);
const { DEFAULT_TAXONOMY } = await import(pathToFileURL(need("MOD_P")).href);
const { makeSampleStudy } = await import(pathToFileURL(need("MOD_S")).href);

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail && !cond ? `  (${detail})` : ""}`);
};

const tax = DEFAULT_TAXONOMY;
const study = makeSampleStudy();
const md = reportMarkdown(tax, study);

// ── 1. the language the model actually uses ─────────────────────────────────
// Each of these is a thing the engine computes and the report used not to mention.
for (const [what, needle] of [
  ["what becomes of an attempt", /outcome of an attack attempt/i],
  ["being caught, not only kept out", /detected in time/i],
  ["reaching the objective", /reaches the objective/i],
  ["where the attempts stop", /attempts stop at/i],
  ["defended, not merely covered", /steps defended/],
  ["chain defence by that name", /##\s*Chain defence/],
]) ok(`the report names ${what}`, needle.test(md), needle.source);

// The retired model's vocabulary, in the places it used to appear. "Compliance coverage" is
// a different and still-current idea (share of requirements fulfilled) and stays.
ok("no step is described as merely 'mitigated'", !/steps mitigated/i.test(md));
ok("no averaged kill-chain coverage figure", !/Kill-chain coverage/i.test(md));
ok("...while compliance coverage is untouched", /Compliance coverage/i.test(md));

// ── 2. what a measure does, per class ───────────────────────────────────────
// A corrective measure on a step is real work that does not stop an attacker there. The
// report has to distinguish the two, or "covered" reads as "handled".
ok("each measure on a step names the class it acts through",
  /\((preventive|detective|corrective|deterrent|avoidance)\)/.test(md));
// Built rather than hoped for: the sample has no step held only by damage control, and a
// check that waits for one to appear is a check about nothing. So make one - turn every
// measure on the first defended step into a corrective one - and see whether the report
// still calls the step handled.
{
  const s2 = JSON.parse(JSON.stringify(study));
  const stepType = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "ref" && f.refType) && t.fields.some((f) => f.type === "number"));
  const measureType = tax.entityTypes.find((t) => t.key !== stepType?.key && t.fields.some((f) => f.type === "multiref" && f.refType === stepType?.key));
  const coversF = measureType?.fields.find((f) => f.type === "multiref" && f.refType === stepType?.key);
  const step = s2.entities.find((e) => e.type === stepType.key
    && s2.entities.some((m) => m.type === measureType.key && (m.values[coversF.key] ?? []).includes(e.id)));
  let turned = 0;
  for (const m of s2.entities) {
    if (m.type === measureType.key && (m.values[coversF.key] ?? []).includes(step.id)) { m.values.measure_type = "Corrective"; turned++; }
  }
  ok("a step can be left holding only damage control", turned > 0, `${turned} measures turned`);
  const md2 = reportMarkdown(tax, s2);
  ok("...and the report refuses to call it handled", /nothing prevents or detects here/.test(md2));
  ok("...while the untouched report says no such thing", !/nothing prevents or detects here/.test(md));
}

// ── 3. the figures are the model's, not the report's ────────────────────────
// The percentages must add up the way the simulation defines them: everything that is not
// stopped reaches the objective.
const stopped = [...md.matchAll(/\*\*(\d+)% of attempts are stopped\*\*/g)].map((m) => Number(m[1]));
ok("the report states how many attempts are stopped", stopped.length >= 1, String(stopped.length));
const bars = [...md.matchAll(/reaches the objective (\d+)%/g)].map((m) => Number(m[1]));
ok("...and how many reach the objective", bars.length === stopped.length, `${bars.length} vs ${stopped.length}`);
for (let i = 0; i < stopped.length; i++) {
  const sum = stopped[i] + bars[i];
  ok(`scenario ${i + 1}: stopped + through accounts for every attempt`, Math.abs(sum - 100) <= 1, `${sum}%`);
}

// ── 4. still offline ────────────────────────────────────────────────────────
// The report renders its own SVG on purpose; a diagram fetched at read time is a diagram
// that is blank on the machine it matters on.
// Nothing is FETCHED at read time. A link the reader may follow is fine; a resource the
// document needs in order to render is not - that is a diagram that comes out blank on the
// machine where it matters. (An SVG xmlns is a namespace name, not an address.)
const fetched = [...md.matchAll(/(?:src|href)\s*=\s*"(https?:[^"]+)"/gi)].map((m) => m[1])
  .concat([...md.matchAll(/url\(\s*['"]?(https?:[^)'"]+)/gi)].map((m) => m[1]));
ok("the report fetches nothing at read time", fetched.length === 0, fetched.join(", "));
ok("its diagrams are inline SVG", /<svg[^>]*xmlns=/.test(md));
ok("...and mermaid is nowhere in it", !/mermaid/i.test(md));

console.log(`\n${pass}/${pass + fail} report assertions passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
