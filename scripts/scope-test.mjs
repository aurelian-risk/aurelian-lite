// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Taking something out of scope: what goes with it, and what stands in the way.
//
// The rule is easy to state and easy to get wrong in three directions at once. A cascade
// that is too eager silently removes half a study; one that is too timid leaves fragments
// pointing at nothing; and a refusal that cannot be explained is just a button that does
// not work. Each of those is a case below.
//
// Run: npm run test:scope
import { pathToFileURL } from "node:url";

const need = (k) => { const v = process.env[k]; if (!v) { console.error(`set ${k}`); process.exit(2); } return v; };
const { scopeChange, scopeValue, deleteChange } = await import(pathToFileURL(need("MOD_SC")).href);
const { DEFAULT_TAXONOMY } = await import(pathToFileURL(need("MOD_P")).href);
const { makeSampleStudy } = await import(pathToFileURL(need("MOD_S")).href);

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { c ? pass++ : fail++; console.log(`${c ? "✓" : "✗"} ${n}${d ? `  (${d})` : ""}`); };
const tax = DEFAULT_TAXONOMY;
const study = makeSampleStudy();
const of = (type) => study.entities.filter((e) => e.type === type);
const name = (r) => String(r.values.name ?? r.values.title ?? r.id);
const names = (rs) => rs.map((x) => name(x.record ?? x)).sort().join(", ");

// ── 1. a strategic scenario carries its operational scenarios ───────────────
{
  const strat = of("strategic_scenario").find((s) =>
    of("operational_scenario").some((o) => o.values.strategic_scenario === s.id));
  ok("the sample has a strategic scenario with operational ones under it", !!strat);
  const c = scopeChange(tax, study, strat.id);
  const carriedIds = new Set(c.carried.map((r) => r.id));
  const ops = of("operational_scenario").filter((o) => o.values.strategic_scenario === strat.id);
  ok("...and they are carried with it", ops.every((o) => carriedIds.has(o.id)),
    `${ops.length} operational scenario(s): ${names(ops)}`);
  // And down: a kill-chain step cannot stand without the operational scenario it is part of.
  const steps = of("kill_chain_step").filter((s) => ops.some((o) => o.id === s.values.operational_scenario));
  ok("...and their kill-chain steps below them", steps.length > 0 && steps.every((s) => carriedIds.has(s.id)),
    `${steps.length} step(s)`);
  ok("...while the rest of the study stays", c.carried.length < study.entities.length,
    `${c.carried.length} of ${study.entities.length}`);
}

// ── 2. a measure that would cover nothing goes too; one with other work stays ─
{
  const measures = of("security_measure");
  const single = measures.find((m) => (m.values.covers ?? []).length === 1);
  ok("the sample has a measure covering exactly one step", !!single, single && name(single));
  const step = of("kill_chain_step").find((s) => (single.values.covers ?? []).includes(s.id));

  // The sample's measure ALSO protects an asset that stays, so it is still needed and
  // stays - reported as weakened, with nothing left in the field that lost its target.
  const c = scopeChange(tax, study, step.id);
  ok("a measure that still protects something in scope is not carried",
    !c.carried.some((r) => r.id === single.id), name(single));
  ok("...but is reported as having nothing left to cover",
    c.weakened.some((w) => w.record.id === single.id && w.left === 0),
    JSON.stringify(c.weakened.filter((w) => w.record.id === single.id).map((w) => ({ f: w.field, left: w.left }))));

  // A measure whose every link points into the closure is a measure nobody needs any more.
  {
    const only = JSON.parse(JSON.stringify(study));
    const m = only.entities.find((e) => e.id === single.id);
    m.values.protects = []; m.values.fulfills = [];        // it covers that one step and nothing else
    const c3 = scopeChange(tax, only, step.id);
    ok("a measure left with no reason at all is carried out with it",
      c3.carried.some((r) => r.id === single.id), names(c3.carried));
  }

  const many = measures.find((m) => (m.values.covers ?? []).length > 1);
  const other = of("kill_chain_step").find((s) => (many.values.covers ?? []).includes(s.id));
  const c2 = scopeChange(tax, study, other.id);
  ok("a measure that still covers something else is not carried",
    !c2.carried.some((r) => r.id === many.id), name(many));
  // `left` is per FIELD: a measure can lose everything it covers and still stand because it
  // fulfils a requirement. The dialog needs exactly that detail, so the test asks for it.
  ok("...but is named as weakened, per field, with what that field has left",
    c2.weakened.some((w) => w.record.id === many.id && typeof w.left === "number"),
    JSON.stringify(c2.weakened.filter((w) => w.record.id === many.id).map((w) => ({ f: w.field, left: w.left }))));
}

// ── 2b. an ordering is not a reason to exist ────────────────────────────────
// A kill-chain step points at the steps before it. Reading that as dependence carried a
// whole chain out of scope because its first step went: one asked about, six carried.
{
  const steps = of("kill_chain_step");
  const withPreds = steps.find((s) => (s.values.predecessors ?? []).length > 0);
  ok("the sample has a step with a predecessor", !!withPreds, withPreds && name(withPreds));
  const pred = steps.find((s) => (withPreds.values.predecessors ?? []).includes(s.id));
  const c = scopeChange(tax, study, pred.id);
  ok("a successor is not carried out with its predecessor",
    !c.carried.some((r) => r.id === withPreds.id),
    `asked about ${name(pred)}, carried: ${names(c.carried)}`);
}

// ── 3. what stands in the way is named, not silently overruled ──────────────
{
  // A supporting asset a kill-chain step targets: the step stays in play and would be left
  // pointing at something the study no longer considers.
  const targeted = of("supporting_asset").find((a) =>
    of("kill_chain_step").some((s) => s.values.targets_asset === a.id));
  ok("the sample has an asset a step targets", !!targeted, targeted && name(targeted));
  const c = scopeChange(tax, study, targeted.id);
  ok("taking it out is blocked", c.blocked.length > 0, names(c.blocked));
  ok("...and the block names the field it hangs on",
    c.blocked.every((b) => typeof b.field === "string" && b.field.length > 0),
    c.blocked.map((b) => b.field).join(", "));
}

// ── 4. a record nothing hangs off goes on its own ───────────────────────────
{
  const lonely = of("security_measure").find((m) =>
    !of("requirement").some((r) => (m.values.fulfills ?? []).includes(r.id)) || true);
  const c = scopeChange(tax, study, lonely.id);
  ok("a measure is not blocked by the things it points AT",
    c.blocked.length === 0, names(c.blocked));
  ok("...and carries only itself", c.carried.length === 1, names(c.carried));
}

// ── 5. what is already out of play does not join in ─────────────────────────
{
  const back = study.entities.find((e) => e.type === "requirement");
  const copy = JSON.parse(JSON.stringify(study));
  const m = copy.entities.find((e) => e.type === "security_measure");
  m.values.scope = "not in use";                       // already set back
  const step = copy.entities.find((e) => e.type === "kill_chain_step" && (m.values.covers ?? []).includes(e.id));
  const c = scopeChange(tax, copy, step.id);
  ok("a record already out of play is neither carried nor counted as blocking",
    !c.carried.some((r) => r.id === m.id) && !c.blocked.some((b) => b.record.id === m.id)
    && !c.weakened.some((w) => w.record.id === m.id), name(m));
  ok("the sample has requirements to compare against", !!back);
}

// ── 6. the switch a caller has to write ─────────────────────────────────────
{
  const m = of("security_measure")[0];
  const off = scopeValue(tax, m, false), on = scopeValue(tax, m, true);
  ok("the value for out of play is the type's own first option", off?.value === "not in use", JSON.stringify(off));
  ok("...and back in play is the second", on?.value === "in use", JSON.stringify(on));
  ok("...written to the field the taxonomy names", off?.key === "scope");
}

// ── 5b. the refusal can be overruled, and then it has to close ──────────────
// Standing in the way is a judgement about the perimeter, not an impossibility - so the
// dialog offers to take those records out too. What that costs has to be the CLOSURE: the
// ones in the way, plus whatever stands in THEIR way, or the same contradiction reappears
// one step further out and the override would have created what it was meant to resolve.
{
  const asset = of("supporting_asset").find((a) =>
    of("kill_chain_step").some((st) => st.values.targets_asset === a.id));
  const c = scopeChange(tax, study, asset.id);
  ok("a record that is pointed at is refused", c.blocked.length > 0, `${c.blocked.length} in the way`);
  const forcedIds = new Set(c.forced.map((r) => r.id));
  ok("...but the override takes the ones in the way with it",
    c.blocked.every((b) => forcedIds.has(b.record.id)),
    `${c.forced.length} in all: ${names(c.forced)}`);
  ok("...and it includes the record asked about", forcedIds.has(asset.id));
  // The closure has to be stable: nothing outside it may still point INTO it.
  const rest = study.entities.filter((e) => !forcedIds.has(e.id));
  const dangling = rest.filter((e) => {
    const t = tax.entityTypes.find((x) => x.key === e.type);
    return (t?.fields || []).some((f) => f.type === "ref" && f.refType !== t.key
      && typeof e.values[f.key] === "string" && forcedIds.has(e.values[f.key]));
  });
  ok("...and nothing left in play still points into it", dangling.length === 0,
    dangling.map((e) => e.type).join(", "));
  // Where nothing is in the way, the override is the ordinary answer, not a bigger one.
  const lonely = of("security_measure")[0];
  const c2 = scopeChange(tax, study, lonely.id);
  ok("with nothing in the way the override equals the ordinary closure",
    c2.blocked.length === 0 && c2.forced.length === c2.carried.length,
    `${c2.forced.length} vs ${c2.carried.length}`);
}

// ── 6b. deleting: the same walk, the destructive answer ─────────────────────
// The warning shown before a delete and the deletion itself read THIS function, so what a
// reader is told is what happens. These assertions are about the three shapes a reference
// can have, because that is what the three lists in the dialog are.
{
  const strat = of("strategic_scenario").find((x) =>
    of("operational_scenario").some((o) => o.values.strategic_scenario === x.id));
  const d = deleteChange(tax, study, strat.id);
  const goneIds = new Set(d.removed.map((r) => r.id));
  const ops = of("operational_scenario").filter((o) => o.values.strategic_scenario === strat.id);
  const steps = of("kill_chain_step").filter((st) => ops.some((o) => o.id === st.values.operational_scenario));
  ok("a required single reference cannot survive its target",
    ops.every((o) => goneIds.has(o.id)) && steps.every((st) => goneIds.has(st.id)),
    `${d.removed.length} removed: ${names(d.removed)}`);
  ok("...and the survivors are exactly the rest",
    d.entities.length === study.entities.length - d.removed.length,
    `${d.entities.length} + ${d.removed.length} = ${study.entities.length}`);
  ok("...none of the removed is still in the result",
    !d.entities.some((r) => goneIds.has(r.id)));
  ok("...a measure that covered a deleted step is reported as shortened, not removed",
    d.shortened.some((x) => x.record.type === "security_measure") &&
    !d.removed.some((r) => r.type === "security_measure"),
    JSON.stringify(d.shortened.filter((x) => x.record.type === "security_measure").map((x) => `${x.field}: ${x.left} left`)));

  // An OPTIONAL single reference is emptied, and the record stays - the case the "deleted"
  // mark in the table is for.
  const asset = of("supporting_asset").find((a) =>
    of("kill_chain_step").some((st) => st.values.targets_asset === a.id));
  const d2 = deleteChange(tax, study, asset.id);
  ok("an optional single reference is emptied, and its record survives",
    d2.removed.length === 1 && d2.cleared.some((c) => c.record.type === "kill_chain_step"),
    `${d2.removed.length} removed, ${d2.cleared.length} cleared, ${d2.shortened.length} shortened`);
  ok("...and the surviving record really has null in that field",
    d2.entities.filter((r) => r.type === "kill_chain_step").some((r) => r.values.targets_asset === null));

  // Unlike setting a record back, a lost PREDECESSOR is worth saying: it is gone, not
  // merely reordered.
  const step = of("kill_chain_step").find((st) =>
    of("kill_chain_step").some((o) => (o.values.predecessors ?? []).includes(st.id)));
  const d3 = deleteChange(tax, study, step.id);
  ok("a deleted predecessor is reported, where setting one back is not",
    d3.shortened.some((x) => x.record.type === "kill_chain_step"),
    JSON.stringify(d3.shortened.map((x) => `${x.record.type}.${x.field}`)));
}

// ── 7. the heuristic is watched, because it is a heuristic ──────────────────
// "A relation within a type states an order, not a need" holds for a kill-chain step
// pointing at the step before it. It does NOT hold for a hierarchy: a sub-requirement that
// is meaningless without its parent SHOULD go with it. The closure already gets that right -
// it follows a required single reference whatever it points at - but the REPORTING of what
// is affected skips every self-reference, so an optional parent link would be neither
// carried nor named. Rather than guess which meaning a future field has, this asserts the
// shape that the reporting cannot express, and fails by name if one appears.
{
  // ONE predicate, asked twice. Written out a second time for the negative case it would
  // prove that the IDEA fires, not that this check does - and a check that has never been
  // red has not been tested, it has only been run. Where the case cannot occur on its own,
  // it has to be made to occur.
  const singleSelfRefs = (t9) => {
    const out = [];
    for (const t of t9.entityTypes)
      for (const f of t.fields || [])
        if (f.type === "ref" && f.refType === t.key)
          out.push(`${t.key}.${f.key}${f.required ? " (required)" : ""}`);
    return out;
  };
  const all = [];
  for (const t of tax.entityTypes)
    for (const f of t.fields || [])
      if ((f.type === "ref" || f.type === "multiref") && f.refType === t.key) all.push(`${t.key}.${f.key} (${f.type})`);
  const found = singleSelfRefs(tax);
  ok("no type points at itself through a SINGLE reference", found.length === 0,
    found.length ? found.join(", ") : `${all.length} self-reference(s), all multi-valued: ${all.join(", ")}`);
  // The same predicate against a taxonomy that declares the shape - if this comes back
  // empty, the check above is blind rather than satisfied.
  const planted = { entityTypes: [...tax.entityTypes,
    { key: "planted", label: "Planted", fields: [{ key: "parent", label: "Parent", type: "ref", refType: "planted", required: true }] }] };
  const caught = singleSelfRefs(planted);
  ok("...and the same check finds one that is planted in the taxonomy",
    caught.length === 1 && caught[0] === "planted.parent (required)", JSON.stringify(caught));
}

console.log(`\n${pass}/${pass + fail} scope assertions passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
