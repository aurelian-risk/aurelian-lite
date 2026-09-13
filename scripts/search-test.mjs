// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Does the study-wide search find what is there, and say where it found it?
//
// Run against the sample study, because the question this feature answers is about a real
// analysis: the words an analyst half-remembers are spread over five workshops, and a hit
// is only useful if it names the record, the workshop and the field it came from.
//
// Run: npm run test:search
import { pathToFileURL } from "node:url";

const need = (k) => { const v = process.env[k]; if (!v) { console.error(`set ${k}`); process.exit(2); } return v; };
const { searchStudy, searchCounts, snippetOf } = await import(pathToFileURL(need("MOD_SE")).href);
const { DEFAULT_TAXONOMY: tax } = await import(pathToFileURL(need("MOD_P")).href);
const { makeSampleStudy } = await import(pathToFileURL(need("MOD_S")).href);
const { scaleLabel } = await import(pathToFileURL(need("MOD_T")).href);

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail && !cond ? `  (${detail})` : ""}`);
};

// The same reading the tables use: a value is searched as it is DISPLAYED, so a scale is
// found by its label rather than by the number behind it.
const display = (f, v) => {
  if (v == null || v === "") return "";
  if (f.type === "scale") return typeof v === "number" ? scaleLabel(f, v) : "";
  if (f.type === "boolean") return v ? "yes" : "no";
  if (f.type === "ref" || f.type === "multiref") return "";
  return String(v);
};

const study = makeSampleStudy();
const find = (q, filters) => searchStudy(tax, study, q, display, filters);
const titleOf = (h) => String(h.record.values[h.type.titleField ?? "name"] ?? "");

// ── it finds things, across workshops ───────────────────────────────────────
{
  const hits = find("maintenance");
  ok("a word that runs through the study is found across it", hits.length >= 4, String(hits.length));
  const groups = new Set(hits.map((h) => h.type.group));
  ok("...in more than one workshop", groups.size >= 3, [...groups].join(","));
  const types = new Set(hits.map((h) => h.type.key));
  ok("...and in more than one type", types.size >= 3, [...types].join(","));
}

// ── a title hit comes first, and is marked as one ───────────────────────────
{
  const hits = find("phishing");
  ok("something matches 'phishing'", hits.length > 0);
  ok("a record whose NAME matches comes first", hits[0].titleHit, titleOf(hits[0]));
  ok("...with the match marked in the name itself",
    !!hits[0].titleMark && titleOf(hits[0]).slice(hits[0].titleMark.from, hits[0].titleMark.to).toLowerCase() === "phishing",
    JSON.stringify(hits[0].titleMark));
  ok("...and a card that has nothing marked still has a line to show",
    find("ransomware").every((h) => h.titleMark || h.snippet || h.preview !== undefined));
  const body = hits.find((h) => !h.titleHit);
  ok("a record matching only in its text is found too", !!body, String(hits.length));
  ok("...and says which field it was found in", !!body?.field, body?.field?.key ?? "none");
  ok("...with the match marked inside the snippet",
    !!body?.snippet && body.snippet.text.slice(body.snippet.from, body.snippet.to).toLowerCase() === "phishing",
    body?.snippet ? body.snippet.text.slice(body.snippet.from, body.snippet.to) : "none");
}

// ── the query rules are the tables' rules ───────────────────────────────────
{
  ok("every term must appear", find("maintenance gateway").length < find("maintenance").length);
  ok("...in any field, not only one", find("ransomware clinical").length > 0);
  const phrase = find('"maintenance gateway"');
  ok("a quoted phrase holds together", phrase.length > 0 && phrase.length <= find("maintenance gateway").length,
    `${phrase.length} vs ${find("maintenance gateway").length}`);
  ok("a word nobody wrote finds nothing", find("zzzznothing").length === 0);
  ok("an empty query is not a search", find("").length === 0 && find("   ").length === 0);
  ok("case is not a criterion", find("PHISHING").length === find("phishing").length);
}

// ── the order is a property of the data, not of the run ─────────────────────
{
  const a = find("access").map((h) => h.record.id).join(",");
  const b = find("access").map((h) => h.record.id).join(",");
  ok("the same query twice gives the same order", a === b && a.length > 0);
  const hits = find("access");
  const firstBody = hits.findIndex((h) => !h.titleHit);
  const lastTitle = hits.map((h) => h.titleHit).lastIndexOf(true);
  ok("every title hit sorts before every text hit", firstBody === -1 || lastTitle < firstBody,
    `${lastTitle} / ${firstBody}`);
}

// ── filters, and the counts behind their chips ──────────────────────────────
{
  const all = find("access");
  const g = all[0].type.group;
  const inGroup = find("access", { groups: [g] });
  ok("a workshop filter narrows to that workshop", inGroup.length > 0 && inGroup.length < all.length
    && inGroup.every((h) => h.type.group === g), `${inGroup.length} of ${all.length}`);
  const t = all[0].type.key;
  const inType = find("access", { types: [t] });
  ok("a type filter narrows to that type", inType.every((h) => h.type.key === t) && inType.length > 0);

  const counts = searchCounts(tax, study, "access", display, { groups: [g] });
  ok("the workshop counts are of the whole query, not of the filtered result",
    [...counts.groups.values()].reduce((a2, b2) => a2 + b2, 0) === all.length,
    `${[...counts.groups.values()].reduce((a2, b2) => a2 + b2, 0)} vs ${all.length}`);
  ok("...while the type counts are counted inside the chosen workshop",
    [...counts.types.values()].reduce((a2, b2) => a2 + b2, 0) === inGroup.length);
  ok("the total follows every filter", counts.total === inGroup.length);
}

// ── records outside the scope are found, and marked ─────────────────────────
{
  const type = tax.entityTypes.find((t) => t.fields.some((f) => f.toggle));
  const toggle = type?.fields.find((f) => f.toggle);
  const rec = study.entities.find((e) => e.type === type?.key);
  if (type && toggle && rec) {
    const word = "zzsetback";
    rec.values = { ...rec.values, [toggle.key]: toggle.options?.[0], description: `${rec.values.description ?? ""} ${word}` };
    const hits = find(word);
    ok("a record that is set back is still found", hits.length === 1, String(hits.length));
    ok("...and says so, rather than being hidden", hits[0].setBack);
    ok("...and can be left out on request", find(word, { inScopeOnly: true }).length === 0);
  } else ok("the sample has a scope switch to test with", false);
}

// ── the snippet itself ──────────────────────────────────────────────────────
{
  const long = "a".repeat(200) + " needle " + "b".repeat(200);
  const s = snippetOf(long, "needle");
  ok("a long value is cut down around the match", !!s && s.text.length < 140, String(s?.text.length));
  ok("...and says on both sides that it was cut", !!s && s.text.startsWith("…") && s.text.endsWith("…"), s?.text.slice(0, 20));
  ok("...with offsets that point at the match itself", !!s && s.text.slice(s.from, s.to) === "needle");
  ok("a value shorter than the window is shown whole",
    snippetOf("short needle here", "needle")?.text === "short needle here");
  ok("a term that is not there has no snippet", snippetOf("nothing here", "needle") === null);
}

console.log(`\n${pass}/${pass + fail} search assertions passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
