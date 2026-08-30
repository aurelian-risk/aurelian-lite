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
const { reportMarkdown, reportHtml } = await import(pathToFileURL(need("MOD_R")).href);
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

// ── 4. the loss figures are readable, and true ──────────────────────────────
// A curve nobody can read is a picture, not a finding. The report has to say which
// ordinary year actually costs anything - and it must not invent one that does not.
{
  ok("the report says how many years cost nothing", /\d+ years in 100 cost nothing at all/.test(md));
  const ref = md.match(/one year in (two|five|ten|twenty|fifty|a hundred)/);
  ok("...and names an ordinary year, in words", !!ref, ref?.[0]);
  // With N% of years quiet, the marked year cannot be more frequent than the rest.
  const quiet = Number(md.match(/(\d+) years in 100 cost nothing/)?.[1] ?? 0);
  const chance = { "two": 50, "five": 20, "ten": 10, "twenty": 5, "fifty": 2, "a hundred": 1 }[ref?.[1] ?? ""] ?? 0;
  ok("...one that actually happens, given how many years are quiet", chance <= 100 - quiet,
    `${ref?.[0]} against ${100 - quiet}% of years with any loss`);
  ok("the curve is read as frequencies, not as bare percentages", /1 in 50|1 in 20|1 in 10/.test(md));
  ok("...and no longer as a bare probability axis", !/P\(loss/.test(md));
}

// ── 5. still offline ────────────────────────────────────────────────────────
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

// ── 5b. quantification is opt-in, in the report too ─────────────────────────
// The app derives a monetary figure only for the scenarios someone picked. The report
// used to quantify every scenario that had a kill chain, so a study with the
// quantification switched off still left the building carrying annual-loss figures.
{
  const optedIn = study.quantScenarios ?? [];
  ok("the sample has opted a scenario in", optedIn.length > 0, `${optedIn.length}`);
  ok("...and the report quantifies it", /## Quantitative risk/.test(md));

  const off = JSON.parse(JSON.stringify(study));
  delete off.quantScenarios;
  const mdOff = reportMarkdown(tax, off);
  ok("a study that quantifies nothing gets no quantification section",
    !/## Quantitative risk/.test(mdOff));
  ok("...and no monetary figure anywhere", !/€|Expected annual loss|ALE/.test(mdOff),
    (mdOff.match(/.{0,30}(€|ALE).{0,30}/) ?? ["-"])[0]);

  // One of two: the other must not appear.
  const one = JSON.parse(JSON.stringify(study));
  one.quantScenarios = [optedIn[0]];
  const mdOne = reportMarkdown(tax, one);
  const opTitles = study.entities.filter((e) => e.type === "operational_scenario")
    .map((e) => ({ id: e.id, name: String(e.values.name) }));
  const kept = opTitles.find((o) => o.id === optedIn[0]);
  const dropped = opTitles.find((o) => o.id !== optedIn[0]);
  const quantPart = mdOne.slice(mdOne.indexOf("## Quantitative risk"));
  ok("quantifying one scenario quantifies only that one",
    quantPart.includes(kept.name) && !quantPart.includes(dropped.name),
    `kept ${kept.name}, dropped ${dropped.name}`);
}

// ── 5c. the attack-path diagram, at the size a real study reaches ───────────
// It lays a risk source at the mean height of the scenarios it feeds. With interleaved
// scenarios two of those means coincide and the boxes cover each other - 26 overlapping
// pairs at 90 boxes, measured. And the sheet grew with the study: 2772px, endlessly.
{
  const grown = JSON.parse(JSON.stringify(study));
  const seedO = grown.entities.find((e) => e.type === "risk_origin");
  const seedF = grown.entities.find((e) => e.type === "feared_event");
  const seedS = grown.entities.find((e) => e.type === "strategic_scenario");
  const os = [], fs = [];
  for (let i = 0; i < 20; i++) {
    os.push({ ...seedO, id: `o-${i}`, values: { ...seedO.values, name: `Actor ${i}` } });
    fs.push({ ...seedF, id: `f-${i}`, values: { ...seedF.values, name: `Feared ${i}` } });
  }
  grown.entities.push(...os, ...fs);
  // Round robin, so the means the outer columns are placed at land on top of each other.
  for (let row = 0; row < 40; row++) {
    grown.entities.push({ ...seedS, id: `s-${row}`, values: { ...seedS.values,
      name: `Scenario ${row}`, risk_origin: os[row % os.length].id, feared_event: fs[row % fs.length].id } });
  }
  const svg = (() => { const m = reportMarkdown(tax, grown); const i = m.indexOf("## Attack paths"); return m.slice(i, m.indexOf("</svg>", i)); })();
  const boxes = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="9"/g)]
    .map((m) => ({ x: +m[1], y: +m[2], h: +m[4] }));
  let over = 0;
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.x === b.x && a.y < b.y + b.h && b.y < a.y + a.h) over++;
  }
  ok("the grown study really is big enough to be a test", boxes.length > 60, `${boxes.length} boxes`);
  ok("no two boxes in a column cover each other", over === 0, `${over} overlapping pairs`);
  const h = +(/height="([\d.]+)" viewBox/.exec(svg) ?? [0, 0])[1];
  ok("the sheet does not grow without limit", h > 0 && h <= 1600, `${h}px`);
  ok("...and says so where it stopped drawing", /not drawn/.test(svg));
}

// ── 5d. out of scope is out of the figures ──────────────────────────────────
// A record taken out of scope keeps its judgement and leaves every count. That was true
// for measures and requirements; scenarios and assets can be taken out now too, and a
// state that only half the report honours is worse than no state at all.
{
  const out = JSON.parse(JSON.stringify(study));
  const op = out.entities.find((e) => e.type === "operational_scenario");
  const strat = out.entities.find((e) => e.type === "strategic_scenario");
  op.values.scope = "out of scope";
  strat.values.scope = "out of scope";
  const mdOut = reportMarkdown(tax, out);
  const quantPart = mdOut.includes("## Quantitative risk") ? mdOut.slice(mdOut.indexOf("## Quantitative risk")) : "";
  ok("an operational scenario out of scope is not quantified",
    !quantPart.includes(String(op.values.name)), String(op.values.name));
  const chain = mdOut.includes("## Chain defence") ? mdOut.slice(mdOut.indexOf("## Chain defence"), mdOut.indexOf("---", mdOut.indexOf("## Chain defence"))) : "";
  ok("...and does not appear in chain defence", !chain.includes(String(op.values.name)));
  const paths = mdOut.slice(mdOut.indexOf("## Attack paths"), mdOut.indexOf("</svg>", mdOut.indexOf("## Attack paths")));
  ok("a strategic scenario out of scope is off the attack-path diagram",
    !paths.includes(String(strat.values.name)), String(strat.values.name));
  const matrix = mdOut.slice(mdOut.indexOf("## Risk matrix"), mdOut.indexOf("</svg>", mdOut.indexOf("## Risk matrix")));
  ok("...and off the risk matrix", !matrix.includes(String(strat.values.name)));
}

// ── 6. how it is set ────────────────────────────────────────────────────────
// Typesetting, not wording - but the same kind of drift: the report grew tables and kept
// printing all of them as the one table it had a style for.
{
  const html = reportHtml(tax, study);
  const reqs = study.entities.filter((e) => e.type === "requirement");
  ok("the sample has a register long enough to be one", reqs.length > 12, `${reqs.length} requirements`);
  // Past a dozen, a register is read across its rows. A card each turns a document about
  // this organisation into a reprint of the framework it works to.
  const regRow = /\|\s*Requirement\s*\|/.test(md);
  ok("a long register is printed as a table", regRow);
  ok("...with no card left behind", !reqs.some((r) => md.includes(`#### ${r.values.name}`)));
  // A short one still gets the room a card gives it.
  const assets = study.entities.filter((e) => e.type === "business_asset");
  ok("a short register is still a card each", assets.length <= 12
    && assets.every((a) => md.includes(`#### ${a.values.name}`)), `${assets.length} business assets`);

  // Figures line up on the right; words do not. The rule used to be positional - every
  // column but the first - which set owners and target dates flush right.
  ok("a figure is marked as one", (html.match(/class="num"/g) ?? []).length > 4);
  const dc = html.slice(html.indexOf("Document control"), html.indexOf("Overview"));
  ok("a table written as markdown is not set as a table of figures",
    !/qt-tbl/.test(dc) && !/class="num"/.test(dc));
  ok("...and a short single-token cell is not broken across lines", /<td class="nw">/.test(html));

  // A cell that could end its row or its column early: the value is neutralised, so the
  // table keeps its shape whatever a record is called.
  const wrecked = JSON.parse(JSON.stringify(study));
  const victim = wrecked.entities.find((e) => e.type === "requirement");
  victim.values.name = "Pipes | and\nnewlines";
  const rows = reportMarkdown(tax, wrecked).split("\n").filter((l) => /^\|/.test(l));
  const widths = new Set(rows.filter((l) => !/^\|[\s:|-]+\|$/.test(l)).map((l) => l.split("|").length));
  ok("a value cannot end its row or its column early", widths.size <= 3, [...widths].join(","));

  // Dozens of rows are not read the way six are, and are set to fit a page.
  const many = JSON.parse(JSON.stringify(study));
  const seed = many.entities.find((e) => e.type === "requirement");
  for (let i = 0; i < 25; i++) many.entities.push({ ...seed, id: `req-extra-${i}`, values: { ...seed.values, name: `Extra requirement ${i}` } });
  ok("a register of dozens is set dense", /<table class="dense">/.test(reportHtml(tax, many)));
}

console.log(`\n${pass}/${pass + fail} report assertions passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
