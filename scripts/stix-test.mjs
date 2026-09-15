// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Does a STIX bundle read as a graph, walk from any object, and project onto the study?
//
// Two sources: a synthetic CTI bundle (samples/stix-story.json - an invented actor,
// campaign and feed-own technique around real ATT&CK ids, with a dangling and a revoked
// relationship on purpose), and, when it is on disk, the real ATT&CK Enterprise bundle
// (docs/sources/enterprise-attack.json, 54 MB, not in git) for the sizes a walk has to
// cope with.
//
// Run: npm run test:stix
import { pathToFileURL } from "node:url";
import { existsSync, readFileSync } from "node:fs";

const need = (k) => { const v = process.env[k]; if (!v) { console.error(`set ${k}`); process.exit(2); } return v; };
const { readStix, typeCounts, hops, reach, touches, buckets, labelOf, extId, tacticsOf, project, stixRecordId, techniqueValueOf } = await import(pathToFileURL(need("MOD_X")).href);
const { STIX_RULES, STIX_NOT_MAPPED, DEFAULT_TAXONOMY, makeSampleStudy } = await import(pathToFileURL(need("MOD_P")).href);
const { TACTICS } = await import(pathToFileURL(need("MOD_M")).href);

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "✓" : "✗"} ${name}${detail && !cond ? `  (${detail})` : ""}`);
};
const rule = (t) => STIX_RULES.find((r) => r.stixType === t);
const typeOf = (k) => DEFAULT_TAXONOMY.entityTypes.find((t) => t.key === k);

// ── the synthetic story ───────────────────────────────────────────────────────
const ix = readStix(readFileSync("samples/stix-story.json", "utf8"));
const id = (t, n) => `${t}--00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id("threat-actor", 10), nightjar = id("intrusion-set", 11), campaign = id("campaign", 20);
const t1566 = id("attack-pattern", 30), t1566001 = id("attack-pattern", 35), t1021 = id("attack-pattern", 31), t1562 = id("attack-pattern", 32), own = id("attack-pattern", 34);
const hospital = id("identity", 1), mfa = id("course-of-action", 50);

ok("the bundle reads: every object indexed", ix.bundle.objects === 74, String(ix.bundle.objects));
ok("a dangling relationship is set aside, not thrown", ix.aside.dangling === 1);
const counts = Object.fromEntries(typeCounts(ix).map((c) => [c.type, c.count]));
ok("types are counted", counts["attack-pattern"] === 11 && counts["threat-actor"] === 2 && counts["identity"] === 4, JSON.stringify(counts));
ok("relationships are bookkeeping, not a content type", !("relationship" in counts));

// From the actor: what a "story" opens with.
const fromActor = hops(ix, actor);
const g = (rel, dir, type) => fromActor.find((h) => h.rel === rel && h.dir === dir && h.type === type);
ok("actor → uses attack-pattern: seven techniques, grouped", g("uses", "out", "attack-pattern")?.items.length === 7);
ok("actor → uses malware and tool: each its own group", g("uses", "out", "malware")?.items.length === 1 && g("uses", "out", "tool")?.items.length === 1);
ok("actor → targets identity: the hospital and its class; the location apart", g("targets", "out", "identity")?.items.length === 2 && g("targets", "out", "identity")?.items.some((x) => x.id === hospital) && g("targets", "out", "location")?.items.length === 1);
ok("actor ← attributed-to campaign: the campaign comes along", g("attributed-to", "in", "campaign")?.items[0]?.id === campaign);
ok("actor ← object_refs report, ← sighting_of_ref sighting: embedded refs are edges too", g("object_refs", "in", "report")?.items.length === 1 && g("sighting_of_ref", "in", "sighting")?.items.length === 1);
ok("the dangling relationship is not a hop, nor the revoked attribution", !fromActor.some((h) => h.items.some((x) => !x)) && !fromActor.some((h) => h.rel === "attributed-to" && h.dir === "out"));

// From a technique: the other way round.
const fromTech = hops(ix, t1566001);
ok("sub-technique ← uses: actor and campaign, each its own group",
  fromTech.filter((h) => h.rel === "uses" && h.dir === "in").map((h) => h.type).sort().join() === "campaign,threat-actor");
ok("technique ← mitigates: the training that answers to phishing", hops(ix, t1566).some((h) => h.rel === "mitigates" && h.dir === "in"));
ok("technique ← mitigates course-of-action", hops(ix, t1021).some((h) => h.rel === "mitigates" && h.dir === "in" && h.items[0].id === mfa));

// From a sector: who targets it.
const fromSector = hops(ix, hospital);
ok("the hospital ← targets: the two actors and the campaign that go after it", fromSector.filter((h) => h.rel === "targets" && h.dir === "in").reduce((n, h) => n + h.items.length, 0) === 3);
ok("...and not the one that targets another sector", !fromSector.some((h) => h.items.some((x) => x.id === nightjar)));

// From a dead end: what the story reaches beyond the first hop.
const wanted = (t) => !!rule(t);
const fromIndicator = reach(ix, id("indicator", 60), wanted);
ok("indicator: nothing mappable one hop away, the actor two hops away via the malware",
  !fromIndicator.some((r) => r.depth === 1) && fromIndicator.some((r) => r.obj.id === actor && r.depth === 2 && r.via.length === 1 && r.via[0].name === "Bedside Loader"));
ok("...and its techniques three hops away, shortest path kept", fromIndicator.filter((r) => r.obj.type === "attack-pattern").length === 8 && fromIndicator.every((r) => r.depth <= 3));

// A revoked relationship is not walked.
ok("a revoked relationship is not a hop", !hops(ix, nightjar).some((h) => h.items.some((x) => x.id === id("attack-pattern", 33))));

// Labels and tactics.
ok("a technique is labelled by ATT&CK id and name", labelOf(ix.objects.get(t1566)) === "T1566 Phishing");
ok("a feed-own technique has no ATT&CK id and keeps its name", extId(ix.objects.get(own)) === null && labelOf(ix.objects.get(own)) === "Badge cloning at the loading dock");
ok("an old phase name reads to the successor tactic", tacticsOf(ix.objects.get(t1562)).join() === "Stealth");
ok("a current phase name reads to its tactic", tacticsOf(ix.objects.get(t1021)).join() === "Lateral Movement");
ok("a revoked technique's value names what ATT&CK calls it now", /^T1685 /.test(techniqueValueOf(ix.objects.get(t1562)) ?? ""), techniqueValueOf(ix.objects.get(t1562)));

// ── projection ────────────────────────────────────────────────────────────────
const pa = project(ix, ix.objects.get(actor), rule("threat-actor"));
const roType = typeOf("risk_origin");
ok("a threat-actor projects to a risk source", pa.type === "risk_origin" && pa.values.name === "Vireo Syndicate");
ok("category from threat_actor_types, in the taxonomy's vocabulary", roType.fields.find((f) => f.key === "category").options.includes(pa.values.category) && pa.values.category === "Cybercriminals");
ok("capability from sophistication, on the scale", pa.values.capability === 3);
ok("resources from resource_level, on the scale", pa.values.resources === 3);
ok("aliases and goals composed into the description", /Aliases: VIREO, GOLD FINCH/.test(pa.values.description) && /Goals: Extort a ransom/.test(pa.values.description));
ok("no gaps where the feed said everything", pa.gaps.length === 0, JSON.stringify(pa.gaps));
const pi = project(ix, ix.objects.get(id("threat-actor", 12)), rule("threat-actor"));
ok("an insider archetype reads to Insider, minimal to 1, individual to 1", pi.values.category === "Insider" && pi.values.capability === 1 && pi.values.resources === 1);
ok("the record id is a function of the STIX id", pa.id === stixRecordId(actor) && /^stix-[0-9a-f]{24}$/.test(pa.id));
ok("provenance names the object", pa.source === `stix:${actor}`);

const pn = project(ix, ix.objects.get(nightjar), rule("intrusion-set"));
ok("an intrusion-set with no sophistication lists capability as a gap; its resource level is read", pn.values.name === "Nightjar" && pn.gaps.some((x) => x.field === "capability") && pn.gaps.some((x) => x.field === "category") && pn.values.resources === 4);
ok("...and the ATT&CK id in the description", /ATT&CK: G0999/.test(pn.values.description));

const pt = project(ix, ix.objects.get(t1562), rule("attack-pattern"));
ok("a technique projects to a step under its tactic", pt.type === "kill_chain_step" && pt.values.tactic === "Stealth");
ok("...with the technique read through to what ATT&CK calls it now", pt.values.technique === "T1685 Disable or Modify Tools", pt.values.technique);
const po = project(ix, ix.objects.get(own), rule("attack-pattern"));
ok("a feed-own technique still becomes a step, by name", po.values.name === "Badge cloning at the loading dock" && po.values.tactic === "Initial Access");

const pc = project(ix, ix.objects.get(campaign), rule("campaign"));
ok("a campaign projects to an operational scenario with its dates", pc.type === "operational_scenario" && /First seen: 2026-01-10/.test(pc.values.description));

const pm = project(ix, ix.objects.get(mfa), rule("course-of-action"));
const smType = typeOf("security_measure");
ok("a mitigation projects to a recommended preventive measure carrying M1032", pm.values.measure_type === "Preventive" && pm.values.status === "Recommended" && pm.values.mitigations === "M1032");
ok("...within the taxonomy's vocabularies", smType.fields.find((f) => f.key === "status").options.includes(pm.values.status) && smType.fields.find((f) => f.key === "measure_type").options.includes(pm.values.measure_type));

// What the projected records touch in the sample study: a suggestion with its reason.
{
  const study = makeSampleStudy();
  const titleOf = (e) => String(e.values.name ?? e.id);
  const projected = [pa, pn, pt, pm, project(ix, ix.objects.get(id("attack-pattern", 33)), rule("attack-pattern")), project(ix, ix.objects.get(id("attack-pattern", 37)), rule("attack-pattern"))];
  const tl = touches(projected, study.entities, titleOf);
  ok("a technique the study's chain already has is a touch, by ATT&CK id", tl.some((t) => t.kind === "same-technique" && /T1486/.test(t.why)) && tl.some((t) => t.kind === "same-technique" && /T1078/.test(t.why)));
  ok("a mitigation an existing measure already names is a touch", tl.some((t) => t.kind === "same-mitigation" && /M1032/.test(t.why)));
  ok("an invented actor touches nothing by name", !tl.some((t) => t.kind === "same-name"));
  const renamed = [{ ...pa, values: { ...pa.values, name: "Ransomware group" } }];
  const byName = touches(renamed, study.entities, titleOf);
  ok("the same name on the same type is a touch; the id stays its own", byName.length === 1 && byName[0].kind === "same-name" && byName[0].recordId === pa.id);
  const aliased = [{ ...pa, values: { ...pa.values, description: "Aliases: Ransomware group, VIREO" } }];
  ok("an alias counts as a name", touches(aliased, study.entities, titleOf).some((t) => t.kind === "same-name"));
  ok("a record already in the study by id (a repeat import) is not a touch", touches([{ ...pa, id: study.entities[0].id, type: study.entities[0].type, values: study.entities[0].values }], study.entities, titleOf).length === 0);
}

// Every rule targets a type and fields the taxonomy has.
ok("every rule's entity type and fields exist in the taxonomy", STIX_RULES.every((r) => { const t = typeOf(r.entityType); return t && Object.keys(r.fields).every((k) => t.fields.some((f) => f.key === k)); }));
ok("what is not mapped is said, not silent", ["indicator", "malware", "identity", "report"].every((t) => t in STIX_NOT_MAPPED) && !STIX_RULES.some((r) => r.stixType in STIX_NOT_MAPPED));

// ── a type too large to draw: buckets ───────────────────────────────────────────
{
  const fake = Array.from({ length: 130 }, (_, i) => ({ id: `x--${i}`, type: "intrusion-set", name: `Group ${String.fromCharCode(65 + (i % 26))}${i}` }));
  const bk = buckets(fake, TACTICS, 40);
  ok("a large type without tactics is cut by letter into even buckets of drawable size", bk.length === 4 && bk.every((b) => b.items.length <= 40) && bk.reduce((n, b) => n + b.items.length, 0) === 130);
  ok("...each labelled by its first and last leading letters", bk.every((b) => /^[A-Z]\S* – [A-Z]\S*$/.test(b.label)));
  const techs = [...ix.byType.get("attack-pattern")];
  const tb = buckets(techs, TACTICS, 2);
  ok("techniques are cut by their first tactic, in matrix order", tb.map((b) => b.label).join() === "Initial Access,Execution,Persistence,Stealth,Lateral Movement,Exfiltration,Impact");
}

// ── the real bundle, when it is there ──────────────────────────────────────────
const real = "docs/sources/enterprise-attack.json";
if (existsSync(real)) {
  const t0 = Date.now();
  const ax = readStix(readFileSync(real, "utf8"));
  const ms = Date.now() - t0;
  ok(`ATT&CK Enterprise reads in under 3 s (${ms} ms)`, ms < 3000);
  const fin7 = [...ax.byType.get("intrusion-set")].find((o) => o.name === "FIN7");
  const h = hops(ax, fin7.id);
  const sandworm = hops(ax, [...ax.byType.get("intrusion-set")].find((o) => o.name === "Sandworm Team").id);
  const uses = h.find((x) => x.rel === "uses" && x.dir === "out" && x.type === "attack-pattern");
  ok("FIN7 → uses attack-pattern: the repertoire, in one group", uses?.items.length === 67, String(uses?.items.length));
  ok("...software in its own groups", h.filter((x) => x.rel === "uses" && ["malware", "tool"].includes(x.type)).reduce((n, x) => n + x.items.length, 0) === 19);
  ok("Sandworm Team ← attributed-to: its three campaigns", sandworm.find((x) => x.rel === "attributed-to" && x.dir === "in" && x.type === "campaign")?.items.length === 3);
  const ph = [...ax.byType.get("attack-pattern")].find((o) => extId(o) === "T1566");
  const users = hops(ax, ph.id).filter((x) => x.rel === "uses" && x.dir === "in");
  // ATT&CK hangs most "uses" on the sub-techniques; the parent itself has eleven.
  ok("T1566 ← uses: the objects that use the parent technique itself", users.reduce((n, x) => n + x.items.length, 0) === 11, String(users.reduce((n, x) => n + x.items.length, 0)));
  const sub = [...ax.byType.get("attack-pattern")].find((o) => extId(o) === "T1566.001");
  ok("T1566.001 ← uses: the sub-technique carries the many", hops(ax, sub.id).filter((x) => x.rel === "uses" && x.dir === "in").reduce((n, x) => n + x.items.length, 0) > 100);
  ok("every live technique reads to at least one v19 tactic", [...ax.byType.get("attack-pattern")].every((o) => tacticsOf(o).length > 0));
  const g = [...ax.byType.get("intrusion-set")].map((o) => project(ax, o, rule("intrusion-set")));
  ok("every intrusion-set projects to a named risk source", g.every((p) => p.values.name && p.type === "risk_origin"));
  ok("...and every one lists its scale gaps rather than guessing", g.every((p) => p.gaps.some((x) => x.field === "capability")));
  const tb = buckets([...ax.byType.get("attack-pattern")], TACTICS);
  ok("ATT&CK's 697 techniques open as fifteen tactic buckets", tb.length === 15 && tb[0].label === "Reconnaissance" && tb[tb.length - 1].label === "Impact");
  const gb = buckets([...ax.byType.get("intrusion-set")], TACTICS);
  ok("...its 176 groups as letter buckets no larger than the fan", gb.length === 5 && gb.every((b) => b.items.length <= 40));
  console.log(`  (ATT&CK ${ax.bundle.objects} objects, ${ax.aside.revoked} set aside as revoked/deprecated)`);
} else console.log("  (docs/sources/enterprise-attack.json not on disk - the real-bundle checks were skipped)");

console.log(`\n${pass}/${pass + fail} STIX assertions passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
