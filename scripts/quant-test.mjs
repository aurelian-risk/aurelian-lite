// Unit test for the kill-chain traversal in the quantification.
//
// The two modules are pure (no DOM), so they are bundled in isolation and driven here.
// What matters is not the absolute numbers - those are calibration - but the STRUCTURAL
// properties the model promises: decomposition invariance, correct AND/OR semantics,
// depth being credited, and gates on routes the attacker does not need being worthless.
//
// Run: npm run test:quant
import { pathToFileURL } from "node:url";

const need = (n) => { const v = process.env[n]; if (!v) { console.error(`set ${n}`); process.exit(2); } return v; };
const { chainOf, coverageOf, deriveInputs } = await import(pathToFileURL(need("MOD_Q")).href);
const { simulate } = await import(pathToFileURL(need("MOD_MC")).href);
const { DEFAULT_TAXONOMY } = await import(pathToFileURL(need("MOD_TAX")).href);
const { treatmentEffect, residualPos } = await import(pathToFileURL(need("MOD_T")).href);
const { DEFAULT_CALIBRATION } = await import(pathToFileURL(need("MOD_CAL")).href);
const { demandOf } = await import(pathToFileURL(need("MOD_D")).href);
const { attemptsPerYear, likelihoodCheck } = await import(pathToFileURL(need("MOD_F")).href);

/** A calibration with one table swapped out. Used to pin the demand explicitly in the
 *  COMPARISON cases below - those exist to test the arithmetic, not the derivation. */
const withDemand = (bar) => ({ ...DEFAULT_CALIBRATION,
  demand: { ...DEFAULT_CALIBRATION.demand, entryDefault: bar } });

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  cond ? (pass++, console.log("✓", name)) : (fail++, console.log("✗", name, extra));
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// ── fixtures ──────────────────────────────────────────────────────────────
const tax = DEFAULT_TAXONOMY;
const ts = "2026-01-01T00:00:00.000Z";
const rec = (id, type, values) => ({ id, type, values, createdAt: ts, updatedAt: ts });
const study = (entities) => ({ id: "s", name: "t", organization: "", scope: "", createdAt: ts, updatedAt: ts, entities });

const OP = rec("op", "operational_scenario", { name: "op", strategic_scenario: "ss", likelihood: 3, difficulty: 2 });
/** A step of the chain. `preds` are step ids, `cov` = implementation level of a covering measure (0 = undefended). */
const step = (id, order, preds = [], join = "all") =>
  rec(id, "kill_chain_step", { name: id, operational_scenario: "op", step_order: order, predecessors: preds, join });
const guard = (id, stepIds, level = 4) =>
  rec(id, "security_measure", { name: id, measure_type: "Preventive", status: "Implemented", implementation_level: level, covers: stepIds });

const chainFor = (entities, base = 0.46) => {
  const st = study([OP, ...entities]);
  return chainOf(tax, coverageOf(st, tax, OP), base);
};
/** Vulnerability under a chain, with everything else held fixed. */
const R = (min, mode, max) => ({ min, mode, max });
const BASE_INPUTS = {
  attemptRate: R(2, 3, 4),             // high rate so the sample of attempts is large
  adversaryStrength: R(0.3, 0.6, 0.9),
  controlStrength: R(0.31, 0.46, 0.58),
  directImpact: R(1e4, 1e5, 1e6),
  cascadingLikelihood: R(0.1, 0.2, 0.3),
  cascadingImpact: R(1e3, 1e4, 1e5),
};
const vulnOf = (chain, iter = 20000) => simulate(BASE_INPUTS, iter, chain).vuln;

// ── 1. chain construction ─────────────────────────────────────────────────
{
  const c = chainFor([step("a", 1), step("b", 2, ["a"]), step("c", 3, ["b"])]);
  ok("a declared chain is built", !!c && c.length === 3);
  ok("steps come out in topological order", c.map((s) => s.id).join() === "a,b,c");
  ok("predecessors are indices pointing backwards", c[1].preds.join() === "0" && c[2].preds.join() === "1");
  ok("only the last step is terminal", !c[0].terminal && !c[1].terminal && c[2].terminal);
  ok("undefended steps carry no gate", c.every((s) => s.gate === null));
}
{
  // Declared out of order: b is stored first but depends on a.
  const c = chainFor([step("b", 2, ["a"]), step("a", 1)]);
  ok("storage order does not decide traversal order", c.map((s) => s.id).join() === "a,b");
}
{
  // Legacy data: no predecessors anywhere -> read the chain as a line in step order.
  const c = chainFor([step("z", 3), step("x", 1), step("y", 2)]);
  ok("legacy chain falls back to step order", c.map((s) => s.id).join() === "x,y,z");
  ok("legacy fallback links each step to the previous one", c[1].preds.join() === "0" && c[2].preds.join() === "1");
  ok("legacy fallback marks only the last step terminal", c.filter((s) => s.terminal).length === 1 && c[2].terminal);
}
{
  // Cross-scenario predecessors model a cascade BETWEEN scenarios, not a prerequisite here.
  const other = rec("foreign", "kill_chain_step", { name: "foreign", operational_scenario: "other", step_order: 1 });
  const c = chainFor([other, step("a", 1, ["foreign"]), step("b", 2, ["a"])]);
  ok("cross-scenario predecessors are excluded from the chain", c.length === 2 && c[0].preds.length === 0);
}
{
  // Deliberately cyclic import: must not hang and must still produce every step.
  const c = chainFor([step("a", 1, ["b"]), step("b", 2, ["a"])]);
  ok("a cyclic chain is tolerated, not fatal", !!c && c.length === 2);
  ok("a cyclic chain still has a terminal step", c.some((s) => s.terminal));
}
{
  const c = chainFor([step("a", 1), step("b", 2, ["a"]), guard("m", ["b"])]);
  ok("a covered step becomes a gate", c[0].gate === null && !!c[1].gate);
  ok("the gate sits above the scenario baseline", c[1].gate.mode > 0.46);
  const weak = chainFor([step("a", 1), step("b", 2, ["a"]), guard("m", ["b"], 1)]);
  ok("a weakly implemented control gates less", weak[1].gate.mode < c[1].gate.mode);
}
{
  // Two steps, one terminal, fed by a shared predecessor - the sample's shape.
  const c = chainFor([step("a", 1), step("b", 2, ["a"]), step("c", 2, ["a"])]);
  ok("parallel branches are both terminal", c.filter((s) => s.terminal).length === 2);
}

// ── 2. traversal semantics ────────────────────────────────────────────────
const plain = vulnOf(undefined);
{
  const undef3 = chainFor([step("a", 1), step("b", 2, ["a"]), step("c", 3, ["b"])]);
  const undef8 = chainFor(Array.from({ length: 8 }, (_, i) => step(`s${i}`, i + 1, i ? [`s${i - 1}`] : [])));
  ok("an undefended chain is identical to no chain at all", near(vulnOf(undef3), plain));
  ok("DECOMPOSITION INVARIANCE: 3 vs 8 undefended steps make no difference", near(vulnOf(undef8), vulnOf(undef3)),
    `${vulnOf(undef8)} vs ${vulnOf(undef3)}`);
}
{
  const one = chainFor([step("a", 1), step("b", 2, ["a"]), guard("m", ["b"])]);
  const vOne = vulnOf(one);
  ok("a gate reduces vulnerability", vOne < plain, `${vOne} vs ${plain}`);

  const two = chainFor([step("a", 1), step("b", 2, ["a"]), guard("m1", ["a"]), guard("m2", ["b"])]);
  ok("DEPTH: a second gate on the same route reduces it further", vulnOf(two) < vOne, `${vulnOf(two)} vs ${vOne}`);

  const layered = chainFor([step("a", 1), step("b", 2, ["a"]), guard("m1", ["b"]), guard("m2", ["b"])]);
  ok("two controls on ONE step also help (defense in depth within a step)", vulnOf(layered) < vOne);
}
{
  // Two routes to the terminal step, joined by OR: gating only one of them is worthless,
  // because the attacker simply takes the other. Gating both bites.
  const routes = (guards) => chainFor([
    step("e", 1), step("a", 2, ["e"]), step("b", 2, ["e"]), step("t", 3, ["a", "b"], "any"), ...guards,
  ]);
  // NB: a gate is still ROLLED on the bypassed route, so the random stream diverges and
  // the two runs are equal statistically, not bitwise. The point is the size of the
  // difference: noise on one route, a real effect once both are gated.
  const open = vulnOf(routes([]));
  const oneRoute = vulnOf(routes([guard("m", ["a"])]));
  const bothRoutes = vulnOf(routes([guard("m1", ["a"]), guard("m2", ["b"])]));
  ok("a gate on a route the attacker does not need is worthless",
    Math.abs(oneRoute - open) < 0.01, `${oneRoute} vs ${open}`);
  ok("gating BOTH routes of an OR join bites", open - bothRoutes > 0.05, `${bothRoutes} vs ${open}`);
  ok("...and that effect dwarfs the single-route noise",
    (open - bothRoutes) > 20 * Math.abs(oneRoute - open), `${open - bothRoutes} vs ${Math.abs(oneRoute - open)}`);
}
{
  // The same two routes joined by AND: now every branch is a prerequisite, so gating a
  // single one already blocks the attempt.
  const mk = (join) => chainFor([
    step("e", 1), step("a", 2, ["e"]), step("b", 2, ["e"]), step("t", 3, ["a", "b"], join), guard("m", ["a"]),
  ]);
  ok("AND join: one gated prerequisite is enough to stop the chain", vulnOf(mk("all")) < vulnOf(mk("any")));
}

// ── 3. bookkeeping ────────────────────────────────────────────────────────
{
  const c = chainFor([step("a", 1), step("b", 2, ["a"]), step("c", 3, ["b"]), guard("m", ["b"])]);
  const r = simulate(BASE_INPUTS, 20000, c);
  ok("attempt bookkeeping adds up", near(r.blockedAtBaseline + r.breaks.reduce((n, b) => n + b.p, 0) + r.vuln, 1, 1e-9),
    `${r.blockedAtBaseline} + breaks + ${r.vuln}`);
  ok("breaks are attributed to the gated step", r.breaks.find((b) => b.id === "b").p > 0);
  ok("undefended steps never break the chain", r.breaks.filter((b) => b.id !== "b").every((b) => b.p === 0));
  ok("no chain reports no breaks", simulate(BASE_INPUTS, 5000).breaks.length === 0);
  ok("the simulation stays deterministic", simulate(BASE_INPUTS, 5000, c).ale.mean === simulate(BASE_INPUTS, 5000, c).ale.mean);
}

// ── 4. end to end through deriveInputs ────────────────────────────────────
{
  const entities = [
    rec("ba", "business_asset", { name: "ba", criticality: 4 }),
    rec("fe", "feared_event", { name: "fe", business_asset: "ba", severity: 3 }),
    rec("ro", "risk_origin", { name: "ro", capability: 3, resources: 3, activity: 3, relevance: 3 }),
    rec("ss", "strategic_scenario", { name: "ss", risk_origin: "ro", feared_event: "fe", likelihood: 3, gravity: 3 }),
    OP, step("a", 1), step("b", 2, ["a"]), guard("m", ["b"]),
  ];
  const st = study(entities);
  const withC = deriveInputs(st, tax, OP, true), without = deriveInputs(st, tax, OP, false);
  ok("the residual derivation carries a chain", !!withC.chain && withC.chain.length === 2);
  ok("the inherent derivation has none", without.chain === undefined);
  ok("baseline resistance no longer depends on coverage",
    JSON.stringify(withC.inputs.controlStrength) === JSON.stringify(without.inputs.controlStrength));
  const rW = simulate(withC.inputs, 20000, withC.chain), rWo = simulate(without.inputs, 20000, without.chain);
  ok("controls lower the expected annual loss", rW.ale.mean < rWo.ale.mean, `${rW.ale.mean} vs ${rWo.ale.mean}`);
  ok("controls lower vulnerability", rW.vuln < rWo.vuln);
  ok("provenance names the gated steps", /1\/2 gated/.test(withC.prov.controlStrength.label));
  ok("the bar is derived from the chain, not from the difficulty rating",
    withC.prov.controlStrength.source === "chain demand + measures");
}

// ── 4b. effect channels ───────────────────────────────────────────────────
//
// The point of the whole exercise: a measure has to move the factor its MECHANISM acts
// on, and leave the others alone. A backup must not make the attack less likely; a
// deterrent must not make the attacker weaker.
{
  const world = [
    rec("ba", "business_asset", { name: "ba", criticality: 4 }),
    rec("fe", "feared_event", { name: "fe", business_asset: "ba", severity: 3 }),
    rec("ro", "risk_origin", { name: "ro", capability: 3, resources: 3, activity: 3, relevance: 3 }),
    rec("ss", "strategic_scenario", { name: "ss", risk_origin: "ro", feared_event: "fe", likelihood: 3, gravity: 3 }),
    rec("sa", "supporting_asset", { name: "sa", supports: ["ba"] }),
  ];
  const chainOf3 = [
    rec("a", "kill_chain_step", { name: "a", operational_scenario: "op", step_order: 1, targets_asset: "sa" }),
    rec("b", "kill_chain_step", { name: "b", operational_scenario: "op", step_order: 2, predecessors: ["a"], targets_asset: "sa" }),
    rec("c", "kill_chain_step", { name: "c", operational_scenario: "op", step_order: 3, predecessors: ["b"], targets_asset: "sa" }),
  ];
  const measure = (cls, extra) => rec("m", "security_measure",
    { name: "m", measure_type: cls, status: "Implemented", implementation_level: 4, ...extra });
  const derive = (extra) => {
    const st = study([...world, OP, ...chainOf3, ...(extra ? [extra] : [])]);
    return deriveInputs(st, tax, OP, true);
  };
  const mean = (r) => (r.min + (r.lambda ?? 4) * r.mode + r.max) / ((r.lambda ?? 4) + 2);
  const plain = derive(null);

  const deterrent = derive(measure("Deterrent", { covers: ["a"] }));
  ok("a deterrent cuts the number of attempts", mean(deterrent.inputs.attemptRate) < mean(plain.inputs.attemptRate));
  ok("...and does NOT build a barrier", deterrent.chain.every((s) => s.gate === null));
  ok("...and does NOT change the loss", mean(deterrent.inputs.directImpact) === mean(plain.inputs.directImpact));

  const avoidance = derive(measure("Avoidance", { protects: ["sa"] }));
  ok("avoidance cuts how often the actor makes contact", mean(avoidance.inputs.attemptRate) < mean(plain.inputs.attemptRate));
  ok("...and does NOT build a barrier", avoidance.chain.every((s) => s.gate === null));

  const corrective = derive(measure("Corrective", { protects: ["sa"] }));
  ok("a corrective control cuts the loss", mean(corrective.inputs.directImpact) < mean(plain.inputs.directImpact));
  ok("...and contains the follow-on damage", mean(corrective.inputs.cascadingLikelihood) < mean(plain.inputs.cascadingLikelihood));
  ok("...but does NOT make the attack less likely to succeed", corrective.chain.every((s) => s.gate === null));
  ok("...and does NOT reduce the loss to nothing (fines and reputation remain)",
    mean(corrective.inputs.directImpact) > 0.3 * mean(plain.inputs.directImpact));

  const detective = derive(measure("Detective", { covers: ["b"] }));
  ok("a detective control builds no barrier", detective.chain.every((s) => s.gate === null));
  ok("...but can interrupt the intrusion where it is seen", detective.chain.find((s) => s.id === "b").interrupt > 0);
  ok("...and is worth nothing on the objective itself", detective.chain.find((s) => s.terminal).interrupt === 0);

  const preventive = derive(measure("Preventive", { covers: ["b"] }));
  ok("only a preventive control builds a barrier", !!preventive.chain.find((s) => s.id === "b").gate);

  // Detection is worth what the response makes of it.
  const seenOnly = derive(measure("Detective", { covers: ["b"] })).chain.find((s) => s.id === "b").interrupt;
  const bothSt = study([...world, OP, ...chainOf3,
    rec("m", "security_measure", { name: "m", measure_type: "Detective", status: "Implemented", implementation_level: 4, covers: ["b"] }),
    rec("m2", "security_measure", { name: "m2", measure_type: "Corrective", status: "Implemented", implementation_level: 4, protects: ["sa"] })]);
  const withResponse = deriveInputs(bothSt, tax, OP, true).chain.find((s) => s.id === "b").interrupt;
  ok("detection is worth far more once someone can respond to it", withResponse > seenOnly * 2,
    `${seenOnly.toFixed(3)} -> ${withResponse.toFixed(3)}`);

  // An interruption has to show up as a stop, and be reported as a catch.
  const det = derive(measure("Detective", { covers: ["b"] }));
  const r = simulate(det.inputs, 30000, det.chain);
  ok("interrupted intrusions are counted as stopped at that step", r.breaks.find((b) => b.id === "b").p > 0);
  ok("and reported as caught rather than resisted", r.detected > 0);
  ok("with nothing watching, nothing is caught", simulate(plain.inputs, 20000, plain.chain).detected === 0);

  // The inherent view must be free of every channel.
  const inh = deriveInputs(study([...world, OP, ...chainOf3, measure("Corrective", { protects: ["sa"] })]), tax, OP, false);
  ok("the inherent view ignores every effect channel",
    mean(inh.inputs.directImpact) === mean(plain.inputs.directImpact)
    && mean(inh.inputs.attemptRate) === mean(plain.inputs.attemptRate));
}

// ── 4c. the risk matrix reads the same model ──────────────────────────────
//
// The residual position used to come from an averaged coverage figure, so a chain
// defended only by monitoring - or only by backups - looked reduced in the matrix while
// the quantification of the SAME scenario said most attempts still succeed. The matrix
// now reads the traversal, and it has to split the effect across the right axes.
{
  const base = (extra) => study([
    rec("ba", "business_asset", { name: "ba", criticality: 4 }),
    rec("fe", "feared_event", { name: "fe", business_asset: "ba", severity: 3 }),
    rec("ro", "risk_origin", { name: "ro", capability: 3, resources: 3, activity: 3, relevance: 3 }),
    rec("ss", "strategic_scenario", { name: "ss", risk_origin: "ro", feared_event: "fe", likelihood: 4, gravity: 4 }),
    rec("sa", "supporting_asset", { name: "sa", supports: ["ba"] }),
    OP,
    rec("a", "kill_chain_step", { name: "a", operational_scenario: "op", step_order: 1, targets_asset: "sa" }),
    rec("b", "kill_chain_step", { name: "b", operational_scenario: "op", step_order: 2, predecessors: ["a"], targets_asset: "sa" }),
    ...extra,
  ]);
  const ctl = (cls, extra) => rec("m", "security_measure", { name: "m", measure_type: cls, status: "Implemented", implementation_level: 4, ...extra });
  const treat = (decision) => rec("t", "risk_treatment", { name: "t", strategic_scenario: "ss", decision });
  const ssOf = (st) => st.entities.find((e) => e.id === "ss");
  const pos = (st, decision = "Reduce") => residualPos(st, tax, ssOf(st), treat(decision), "likelihood", "gravity");

  const stPrev = base([ctl("Preventive", { covers: ["a"] })]);
  const ePrev = treatmentEffect(stPrev, tax, ssOf(stPrev));
  ok("resistance shows up as a frequency effect", ePrev.frequency > 0.1);
  ok("...and not as a magnitude effect", ePrev.magnitude < 0.01);
  const pPrev = pos(stPrev);
  ok("a resisting treatment moves the risk LEFT, not down", pPrev.x < 4 && pPrev.y === 4);

  const stCorr = base([ctl("Corrective", { protects: ["sa"] })]);
  const eCorr = treatmentEffect(stCorr, tax, ssOf(stCorr));
  ok("recovery shows up as a magnitude effect", eCorr.magnitude > 0.1);
  const pCorr = pos(stCorr);
  ok("a recovery-only treatment moves the risk DOWN, not left", pCorr.y < 4 && pCorr.x === 4,
    `(${pCorr.x}, ${pCorr.y}) · freq ${eCorr.frequency.toFixed(2)}`);

  // The case that used to lie: measures on the chain that defend nothing.
  const stWatch = base([ctl("Detective", { covers: ["a"] })]);
  ok("a chain defended only by monitoring is not treated as resisted",
    treatmentEffect(stWatch, tax, ssOf(stWatch)).frequency < ePrev.frequency);

  ok("accepting a risk leaves it where it is", pos(stPrev, "Accept").x === 4 && pos(stPrev, "Accept").y === 4);
  ok("avoiding a risk takes it to the minimum", pos(stPrev, "Avoid").x === 1 && pos(stPrev, "Avoid").y === 1);
  ok("sharing a risk always moves the impact at least one level", pos(stPrev, "Share").y <= 3 && pos(stPrev, "Share").x === 4);
  const untouched = base([]);
  ok("a risk with no measures at all does not move", pos(untouched).x === 4 && pos(untouched).y === 4);
}

// ── 5. calibration guardrails: THE COMPARISON ─────────────────────────────
//
// Two calibrations, held apart on purpose. This block pins the ARITHMETIC: given a bar
// and a set of measures, what share of attempts gets through. It therefore sets the bar
// EXPLICITLY (via the calibration) instead of deriving it - otherwise it would be
// testing the derivation at the same time, and a failure would not say which of the two
// broke. Section 6 pins the derivation separately.
//
// The numbers in the calibration are conventions, not measurements. What can be pinned
// down is how the model has to BEHAVE, and that is what these assertions hold: they exist
// so nobody can quietly move a constant back into the regime where the model acted as an
// on/off switch - where one click of a 1..4 scale swung the answer by 60 points, a single
// control removed 87 % of the risk, and a top-tier attacker was stopped 99.4 % of the time.
//
// The target bands are engineering judgements from widely reported practice, deliberately
// wide. They are not precise claims; they only rule out answers no practitioner would sign.
{
  const world = (id, type, values) => rec(id, type, values);
  /** A `n`-step chain, the first `g` steps covered by one measure each. */
  const situation = ({ cap, bar, n, g, lvl = 4, status = "Implemented", cls = "Preventive", responds = false }) => {
    const op = world("op", "operational_scenario", { name: "op", strategic_scenario: "ss", likelihood: 3, difficulty: 2 });
    const ents = [
      world("ba", "business_asset", { name: "ba", criticality: 4 }),
      world("fe", "feared_event", { name: "fe", business_asset: "ba", severity: 3 }),
      world("ro", "risk_origin", { name: "ro", capability: cap, resources: 3, activity: 3, relevance: 3 }),
      world("ss", "strategic_scenario", { name: "ss", risk_origin: "ro", feared_event: "fe", likelihood: 3, gravity: 3 }), op,
    ];
    for (let i = 0; i < n; i++) ents.push(world(`s${i}`, "kill_chain_step", { name: `s${i}`, operational_scenario: "op", step_order: i + 1, predecessors: i ? [`s${i - 1}`] : [] }));
    for (let i = 0; i < g; i++) ents.push(world(`m${i}`, "security_measure", { name: `m${i}`, measure_type: cls, status, implementation_level: lvl, covers: [`s${i}`] }));
    if (responds) ents.push(world("mr", "security_measure", { name: "mr", measure_type: "Corrective", status: "Implemented", implementation_level: 4, covers: [`s${n - 1}`] }));
    const d = deriveInputs(study(ents), tax, op, true, withDemand(bar));
    return simulate(d.inputs, 40000, d.chain).vuln;
  };
  const band = (name, v, lo, hi) => ok(name, v >= lo && v <= hi, `${(v * 100).toFixed(1)}% not in ${lo * 100}-${hi * 100}%`);

  // Five reference situations whose rough behaviour is not seriously disputed.
  band("nothing resists a competent crew", situation({ cap: 3, bar: 0.20, n: 5, g: 0 }), 0.85, 1.00);
  band("baseline hygiene helps a lot but incidents stay common", situation({ cap: 3, bar: 0.30, n: 5, g: 3, lvl: 3 }), 0.15, 0.45);
  band("a mature programme is breached far less often", situation({ cap: 3, bar: 0.40, n: 5, g: 5 }), 0.03, 0.15);
  band("a top-tier actor still gets into a mature programme", situation({ cap: 4, bar: 0.40, n: 5, g: 5 }), 0.20, 0.60);
  band("basic hygiene mostly, but not entirely, stops an opportunist", situation({ cap: 1, bar: 0.30, n: 5, g: 3, lvl: 3 }), 0.01, 0.15);
  // Watching without blocking: intrusions are seen and often broken off, but a
  // determined actor still finishes often enough - which is why monitoring alone is
  // never called a defence.
  band("monitoring without barriers helps, but is not a wall",
    situation({ cap: 3, bar: 0.30, n: 5, g: 3, cls: "Detective", responds: true }), 0.30, 0.70);
  band("detection nobody can act on is worth far less",
    situation({ cap: 3, bar: 0.30, n: 5, g: 3, cls: "Detective" }), 0.55, 0.90);

  // Security is never finished: no amount of control removes a capable adversary.
  const hardened = situation({ cap: 4, bar: 0.50, n: 5, g: 5 });
  ok("no configuration of controls reduces a top-tier actor to zero", hardened > 0.02,
    `everything money can buy still leaves ${(hardened * 100).toFixed(2)}%`);

  // No inherent situation may come out as impossible - if it did, no measure could ever
  // improve it and the whole scenario would drop out of the analysis.
  let floor = 1;
  for (const cap of [1, 2, 3, 4]) for (const bar of DEFAULT_CALIBRATION.demand.difficultyFallback) floor = Math.min(floor, situation({ cap, bar, n: 5, g: 0 }));
  ok("no inherent situation is written off as impossible", floor > 0.01, `lowest cell ${(floor * 100).toFixed(2)}%`);

  // One click on a coarse ordinal scale must not decide the analysis.
  const BARS = DEFAULT_CALIBRATION.demand.difficultyFallback;
  const byDiff = BARS.map((bar) => situation({ cap: 3, bar, n: 5, g: 0 }));
  let worst = 1;
  for (let i = 1; i < byDiff.length; i++) worst = Math.max(worst, byDiff[i - 1] / Math.max(byDiff[i], 1e-6));
  ok("one step on the fallback scale never swings the result by more than 3x", worst <= 3, `worst ${worst.toFixed(1)}x`);

  // A control shifts the odds; it does not settle the matter.
  const bare = situation({ cap: 3, bar: 0.30, n: 5, g: 0 });
  const oneCtl = situation({ cap: 3, bar: 0.30, n: 5, g: 1 });
  const factor = bare / oneCtl;
  ok("a single control is worth a factor of 2-4, not 8", factor >= 2 && factor <= 4, `${factor.toFixed(1)}x`);

  // Partly deployed is neither nothing nor everything.
  const partial = situation({ cap: 3, bar: 0.30, n: 5, g: 1, lvl: 2, status: "Planned" });
  const kept = (bare - partial) / (bare - oneCtl);
  ok("a half-deployed control keeps a visible but clearly partial share of the effect",
    kept > 0.10 && kept < 0.50, `keeps ${(kept * 100).toFixed(1)}%`);
}

// ── 6. calibration guardrails: THE DERIVATION ─────────────────────────────
//
// The other half of the split. Section 5 asks whether the arithmetic is right; this asks
// whether the CLASSIFICATION is right - does a chain the analyst modelled come out where
// a practitioner would put it. A failure here means the entry costs, the tooling table or
// the weights moved, not that the simulation broke.
{
  const D = DEFAULT_CALIBRATION.demand;
  const st = (technique, tactic, extra = {}) => ({ technique, tactic, ...extra });
  const bar = (steps) => demandOf(steps, D).total;
  const band = (name, v, lo, hi) => ok(name, v >= lo && v <= hi, `${v.toFixed(3)} not in ${lo}-${hi}`);

  // The two chains of the sample study, as an analyst modelled them.
  const ransomware = [
    st("T1566 Phishing", "Initial Access", { entry: true }),
    st("T1053 Scheduled Task/Job", "Persistence"),
    st("T1003 OS Credential Dumping", "Credential Access"),
    st("T1021 Remote Services", "Lateral Movement"),
    st("T1567 Exfiltration Over Web Service", "Exfiltration"),
    st("T1486 Data Encrypted for Impact", "Impact"),
  ];
  const insider = [
    st("T1078 Valid Accounts", "Initial Access", { entry: true }),
    st("T1005 Data from Local System", "Collection"),
    st("T1052 Exfiltration Over Physical Medium", "Exfiltration"),
  ];

  band("a phishing-led ransomware campaign demands a capable operator", bar(ransomware), 0.45, 0.65);
  band("an insider path from valid accounts demands very little", bar(insider), 0.08, 0.20);
  ok("...and the campaign is the harder of the two by a wide margin", bar(ransomware) > bar(insider) * 2,
    `${bar(ransomware).toFixed(3)} vs ${bar(insider).toFixed(3)}`);

  // The property that shapes every term: describing the same attack in more detail
  // must not change the answer.
  const split = [...ransomware, st("T1021 Remote Services", "Lateral Movement")];
  ok("DECOMPOSITION INVARIANCE: splitting a step leaves the demand untouched",
    near(bar(split), bar(ransomware)), `${bar(split)} vs ${bar(ransomware)}`);
  const reordered = [...ransomware].reverse();
  ok("...and the order the steps are stored in does not matter", near(bar(reordered), bar(ransomware)));

  // Entry position.
  const entryOnly = (tech) => bar([st(tech, "Initial Access", { entry: true })]);
  ok("a supply-chain compromise costs far more to get in than a phish",
    entryOnly("T1195 Supply Chain Compromise") > entryOnly("T1566 Phishing"));
  ok("logging in with valid accounts is the cheapest entry of all",
    entryOnly("T1078 Valid Accounts") < entryOnly("T1566 Phishing"));
  const granted = [st("T1133 External Remote Services", "Initial Access", { entry: true, granted: true })];
  const taken = [st("T1133 External Remote Services", "Initial Access", { entry: true })];
  ok("access a stakeholder grants is cheaper than access taken", bar(granted) < bar(taken));

  // Tooling: maximum, not average - and an unmodelled step must not inflate it.
  const commodity = [st("T1566 Phishing", "Initial Access", { entry: true }), st("T1204 User Execution", "Execution")];
  const withCraft = [...commodity, st("T1003 OS Credential Dumping", "Credential Access")];
  ok("one step needing craft raises the whole chain", bar(withCraft) > bar(commodity));
  const plusEasy = [...withCraft, st("T1082 System Information Discovery", "Discovery")];
  ok("...and adding another commodity step does not lower it again",
    demandOf(plusEasy, D).tooling === demandOf(withCraft, D).tooling);

  // Under-modelled data must not invent a demand it cannot see.
  const blank = [st(undefined, undefined, { entry: true }), st(undefined, undefined)];
  ok("steps with neither technique nor tactic contribute no tooling", demandOf(blank, D).tooling === 0);
  ok("...and the derivation says so rather than hiding it", demandOf(blank, D).unknown.tooling === 2);
  const byTactic = [st("something in prose", "Lateral Movement", { entry: true })];
  ok("an unrecognised technique still falls back to its tactic", demandOf(byTactic, D).tooling > 0);

  // Breadth and dwell.
  const short = [st("T1566 Phishing", "Initial Access", { entry: true }), st("T1005 Data from Local System", "Collection")];
  const broad = [...short, st("T1021 Remote Services", "Lateral Movement"), st("T1486 Data Encrypted for Impact", "Impact")];
  ok("a chain spanning more distinct tactics demands more", bar(broad) > bar(short));
  ok("no chain is free", bar([]) >= D.floor && bar(blank) >= D.floor);
}

// ── 7. calibration guardrails: HOW OFTEN ──────────────────────────────────
//
// The frequency side had no reference cases at all until now - every assertion in this
// file asked "what share of attempts succeeds", none asked "how often is it attempted".
// These bands are order-of-magnitude judgements: they exist to catch a multiplier stack
// that drifts into weekly attacks or into one attack a century, not to claim precision.
{
  const F = DEFAULT_CALIBRATION.frequency;
  const facts = (o) => ({ actor: "", sector: "", activity: 0.67, resources: 0.67, relevance: 0.67, pull: "none", ...o });
  const rate = (o) => attemptsPerYear(facts(o), F).total;
  const band = (name, v, lo, hi) => ok(name, v >= lo && v <= hi, `${v.toFixed(3)}/yr not in ${lo}-${hi}`);

  band("an opportunist finds an internet-facing service often",
    rate({ actor: "Opportunist", entryTechnique: "T1190 Exploit Public-Facing Application" }), 0.8, 5);
  band("a criminal crew goes after a hospital it has declared an objective on",
    rate({ actor: "Cybercriminals", sector: "Healthcare", pull: "declared", entryTechnique: "T1566 Phishing" }), 0.4, 3);
  band("a state actor rarely bothers with an organisation it has no interest in",
    rate({ actor: "State actor", pull: "noMatch" }), 0.001, 0.1);
  band("an insider acts rarely, but not never", rate({ actor: "Insider", entryTechnique: "T1078 Valid Accounts" }), 0.01, 0.3);

  // Ordering that has to survive any re-tuning of the tables.
  const generic = (a) => rate({ actor: a });
  ok("opportunists attack more often than criminal crews", generic("Opportunist") > generic("Cybercriminals"));
  ok("criminal crews attack more often than state actors", generic("Cybercriminals") > generic("State actor"));

  // Each lever has to move the rate in the direction it claims, and only that one.
  ok("a sector a class targets disproportionately raises the rate",
    rate({ actor: "Cybercriminals", sector: "Healthcare" }) > rate({ actor: "Cybercriminals", sector: "Retail & consumer" }));
  ok("...and leaves classes it says nothing about alone",
    rate({ actor: "Opportunist", sector: "Healthcare" }) === rate({ actor: "Opportunist", sector: "Retail & consumer" }));
  ok("a declared objective on the target raises the rate above no interest at all",
    rate({ actor: "Cybercriminals", pull: "declared" }) > rate({ actor: "Cybercriminals", pull: "noMatch" }));
  ok("a busier actor attacks more often",
    rate({ actor: "Cybercriminals", activity: 1 }) > rate({ actor: "Cybercriminals", activity: 0 }));
  ok("a better-resourced actor runs more operations",
    rate({ actor: "Cybercriminals", resources: 1 }) > rate({ actor: "Cybercriminals", resources: 0 }));
  ok("an exposed entry is reached more often than a supply-chain one",
    rate({ actor: "Cybercriminals", entryTechnique: "T1190 Exploit Public-Facing Application" })
    > rate({ actor: "Cybercriminals", entryTechnique: "T1195 Supply Chain Compromise" }));

  // An actor class the calibration does not know must still produce a number.
  ok("an unclassified actor falls back rather than vanishing", rate({ actor: "Space pirates" }) > 0);

  // The likelihood rating is no longer an input, which is what makes it usable as a
  // check. Reading it back in would restore exactly the circularity the change removed.
  const lk = (lef, rated) => likelihoodCheck(lef, rated, F, 4);
  ok("a rare scenario maps back to the lowest likelihood level", lk(0.005, null).modelLevel === 1);
  ok("a frequent one maps back to the highest", lk(2, null).modelLevel === 4);
  ok("agreement within one level is not reported", !lk(0.05, 3).diverges && !lk(0.05, 2).diverges);
  ok("a rating two levels away from the model is reported", lk(0.005, 3).diverges);
  ok("...in both directions", lk(2, 1).diverges);
  ok("an unrated scenario is never reported as diverging", !lk(0.005, null).diverges);

  // No stack of multipliers may turn one scenario into a weekly event.
  const worst = attemptsPerYear(facts({ actor: "Opportunist", activity: 1, resources: 1, pull: "declared",
    entryTechnique: "T1190 Exploit Public-Facing Application" }), F);
  ok("the multipliers together stay inside the cap", worst.total <= F.cap);
  band("...and the busiest plausible case is still a handful a year, not weekly", worst.total, 1, 12);
}

console.log(`\n${pass}/${pass + fail} quantification assertions passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
