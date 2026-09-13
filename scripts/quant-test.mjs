// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
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
const { chainOf, coverageOf, deriveInputs, measureEfficacyOf, stepDefence, stepPotential } = await import(pathToFileURL(need("MOD_Q")).href);
const { simulate, draw, lognormalOf } = await import(pathToFileURL(need("MOD_MC")).href);
const { DEFAULT_TAXONOMY } = await import(pathToFileURL(need("MOD_TAX")).href);
const { treatmentEffect, residualPos } = await import(pathToFileURL(need("MOD_T")).href);
const { DEFAULT_CALIBRATION, baseRateOf, ownRateOf, reconcileCalibration } = await import(pathToFileURL(need("MOD_CAL")).href);
const { demandOf } = await import(pathToFileURL(need("MOD_D")).href);
const { attemptsPerYear, likelihoodCheck } = await import(pathToFileURL(need("MOD_F")).href);
const { sensitivityOf, carriers } = await import(pathToFileURL(need("MOD_SE")).href);
const { DEFAULT_TAXONOMY: TAX } = await import(pathToFileURL(need("MOD_P")).href);
const FRAMEWORKS = await import(pathToFileURL(need("MOD_FW")).href);
const { measureWorth, costPerYearOf, isComplete } = await import(pathToFileURL(need("MOD_W")).href);
const AM = await import(pathToFileURL(need("MOD_AM")).href);
const { lintStudy } = await import(pathToFileURL(need("MOD_LINT")).href);
const { makeSampleStudy } = await import(pathToFileURL(need("MOD_S")).href);

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
const study = (entities, extra = {}) => ({ id: "s", name: "t", organization: "", scope: "", createdAt: ts, updatedAt: ts, entities, ...extra });
const PACE = DEFAULT_CALIBRATION.time;

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
  const weak = chainFor([step("a", 1), step("b", 2, ["a"]), guard("m", ["b"], 2)]);
  ok("a weakly implemented control gates less", weak[1].gate.mode < c[1].gate.mode);
  // The lowest level of the implementation scale is labelled "none". A measure recorded
  // as not implemented at all must therefore be worth nothing - it used to be worth a
  // quarter of a full one, an artefact of dividing the level by the top of the scale.
  const none = chainFor([step("a", 1), step("b", 2, ["a"]), guard("m", ["b"], 1)]);
  ok("a measure implemented 'none' builds no barrier at all", none[1].gate === null);
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

  // Detection is worth what the response makes of it - and the response is a time, the
  // study's readiness, not a proxy read off the backups.
  const seenSt = study([...world, OP, ...chainOf3, measure("Detective", { covers: ["b"] })]);
  const seen = deriveInputs(seenSt, tax, OP, true);
  ok("a watched step carries an alert time and a duration, and the study a response time",
    !!seen.chain.find((s) => s.id === "b").detect && seen.chain.every((s) => s.duration.mode > 0) && seen.inputs.respondDays.mode > 0);
  ok("readiness not set reads as a plan on paper, and says so", seen.prov.respondDays.estimated === true
    && seen.inputs.respondDays.mode === DEFAULT_CALIBRATION.time.respondDays["Plan on paper"].mode);
  const fast = deriveInputs({ ...seenSt, readiness: "24x7 response with authority to contain" }, tax, OP, true);
  const none = deriveInputs({ ...seenSt, readiness: "No response capability" }, tax, OP, true);
  ok("a readier organisation acts faster", fast.inputs.respondDays.mode < seen.inputs.respondDays.mode && seen.inputs.respondDays.mode < none.inputs.respondDays.mode);
  const vulnOf2 = (d) => simulate(d.inputs, 40000, d.chain, undefined, PACE).vuln;
  ok("detection is worth far more once someone can respond to it in time", vulnOf2(fast) < vulnOf2(none) * 0.7,
    `${vulnOf2(none).toFixed(3)} -> ${vulnOf2(fast).toFixed(3)}`);

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
  const situation = ({ cap, bar, n, g, lvl = 4, status = "Implemented", cls = "Preventive", readiness, strength }) => {
    const op = world("op", "operational_scenario", { name: "op", strategic_scenario: "ss", likelihood: 3, difficulty: 2 });
    const ents = [
      world("ba", "business_asset", { name: "ba", criticality: 4 }),
      world("fe", "feared_event", { name: "fe", business_asset: "ba", severity: 3 }),
      world("ro", "risk_origin", { name: "ro", capability: cap, resources: 3, activity: 3, relevance: 3 }),
      world("ss", "strategic_scenario", { name: "ss", risk_origin: "ro", feared_event: "fe", likelihood: 3, gravity: 3 }), op,
    ];
    for (let i = 0; i < n; i++) ents.push(world(`s${i}`, "kill_chain_step", { name: `s${i}`, operational_scenario: "op", step_order: i + 1, predecessors: i ? [`s${i - 1}`] : [] }));
    for (let i = 0; i < g; i++) ents.push(world(`m${i}`, "security_measure", { name: `m${i}`, measure_type: cls, status, implementation_level: lvl, covers: [`s${i}`], ...(strength ? { strength } : {}) }));
    const d = deriveInputs(study(ents, readiness ? { readiness } : {}), tax, op, true, withDemand(bar));
    return simulate(d.inputs, 40000, d.chain, undefined, PACE).vuln;
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
  // Watching without blocking is a race (docs/detection-time-race.md). A typical
  // posture - a SIEM with rules, a plan on paper - catches part of what it sees against
  // a crew that finishes in days; Sophos 2024/25 put attacks stopped before encryption
  // near a fifth. Telemetry with an exercised response catches most, never all; a
  // response that has to be organised on the day loses nearly every race.
  band("monitoring without barriers, a SIEM and a plan on paper: helps, but is not a wall",
    situation({ cap: 3, bar: 0.30, n: 5, g: 3, cls: "Detective", strength: 2, readiness: "Plan on paper" }), 0.25, 0.60);
  band("telemetry and an exercised response catch most, not all",
    situation({ cap: 3, bar: 0.30, n: 5, g: 3, cls: "Detective", readiness: "Exercised plan" }), 0.02, 0.25);
  band("detection with no response capability is worth far less",
    situation({ cap: 3, bar: 0.30, n: 5, g: 3, cls: "Detective", readiness: "No response capability" }), 0.40, 0.95);
  ok("...and the order holds: readier catches more",
    situation({ cap: 3, bar: 0.30, n: 5, g: 3, cls: "Detective", readiness: "24x7 response with authority to contain" })
    < situation({ cap: 3, bar: 0.30, n: 5, g: 3, cls: "Detective", readiness: "Exercised plan" })
    && situation({ cap: 3, bar: 0.30, n: 5, g: 3, cls: "Detective", readiness: "Exercised plan" })
    < situation({ cap: 3, bar: 0.30, n: 5, g: 3, cls: "Detective", readiness: "No response capability" }));

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
  // The sector is matched by NAME. A value from somewhere else - another product's export,
  // a hand-edited file, a renamed list - finds no row and changes nothing, and used to do
  // so in silence. The breakdown now carries the answer so a view can say it.
  {
    const bad = attemptsPerYear(facts({ actor: "Cybercriminals", sector: "Hospitals" }), F);
    const good = attemptsPerYear(facts({ actor: "Cybercriminals", sector: "Healthcare" }), F);
    const none = attemptsPerYear(facts({ actor: "Cybercriminals", sector: "" }), F);
    ok("a sector the calibration does not know is reported as unknown", bad.sector.known === false, bad.sector.name);
    ok("...and changes nothing, exactly as no sector at all", bad.total === none.total && bad.sector.factor === 1);
    ok("a sector it does know is not flagged", good.sector.known === true && good.sector.factor > 1,
      String(good.sector.factor));
    ok("no sector set is a choice, not an unknown value", none.sector.known === true && none.sector.factor === 1);
  }
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

// ── recorded, but not in force ───────────────────────────────────────────────
//
// A measure that is only planned is worth nothing, and that zero used to be the whole
// story: the tactic heatmap drew it exactly like a step nobody had treated, while the
// mitigation table called the step defended because SOMETHING pointed at it. Both views
// now read the pair below, so they cannot say different things about the same step.
{
  const s1 = step("s1", 1);
  const planned = (id, level, status) => rec(id, "security_measure",
    { name: id, measure_type: "Preventive", status, implementation_level: level, covers: ["s1"] });

  const covOf = (extra) => coverageOf(study([OP, s1, ...extra]), tax, OP).steps[0];

  const bare = covOf([]);
  ok("a step nobody has treated is undefended", stepDefence(bare) === 0);
  ok("...and has nothing pending either", stepPotential(tax, bare) === 0);

  const onPaper = covOf([planned("m1", 1, "Planned")]);       // level 1 = "none"
  ok("a measure that is only planned defends nothing today", stepDefence(onPaper) === 0);
  ok("...but the step is not the same as an untreated one", stepPotential(tax, onPaper) > 0.5,
    String(stepPotential(tax, onPaper)));

  const working = covOf([planned("m2", 3, "Implemented")]);
  ok("a measure in force defends the step", stepDefence(working) > 0);
  ok("...and adds nothing pending, though it is short of the ceiling",
    Math.abs(stepPotential(tax, working) - stepDefence(working)) < 1e-9,
    `${stepPotential(tax, working)} vs ${stepDefence(working)}`);

  const both = covOf([planned("m3", 3, "Implemented"), planned("m4", 1, "Planned")]);
  ok("a planned measure beside a working one shows as the room it would add",
    stepPotential(tax, both) > stepDefence(both) && stepDefence(both) > 0,
    `${stepDefence(both)} → ${stepPotential(tax, both)}`);

  // The lifecycle is what gets lifted, and it is lifted wherever it withholds something -
  // not only where it withholds everything. This is the case the first cut was blind to:
  // a control that is half rolled out and still only planned is working AND pending.
  const halfPlanned = covOf([planned("m6", 2, "Planned")]);
  ok("a planned measure that is partly rolled out defends something today",
    stepDefence(halfPlanned) > 0.1 && stepDefence(halfPlanned) < 0.2, String(stepDefence(halfPlanned)));
  ok("...and is still marked as withheld, at twice the figure",
    Math.abs(stepPotential(tax, halfPlanned) - 2 * stepDefence(halfPlanned)) < 1e-9,
    `${stepDefence(halfPlanned)} → ${stepPotential(tax, halfPlanned)}`);
  const rec2 = covOf([planned("m7", 3, "Recommended")]);
  ok("a recommended measure shows the far bigger part it withholds",
    stepPotential(tax, rec2) / stepDefence(rec2) > 6, `${stepDefence(rec2)} → ${stepPotential(tax, rec2)}`);

  // Class discipline holds here too, or the figure would promise defence from a backup.
  const backup = covOf([rec("m5", "security_measure",
    { name: "m5", measure_type: "Corrective", status: "Planned", implementation_level: 1, covers: ["s1"] })]);
  ok("a planned CORRECTIVE measure promises no defence", stepPotential(tax, backup) === 0);
}

// ── the organisation's own record ───────────────────────────────────────────
{
  const F = DEFAULT_CALIBRATION.frequency;
  const withRecord = (years, organisations, counts) => ({ ...F, history: { years, organisations, counts } });
  ok("no record: the bundled rate stands", ownRateOf(F, "Cybercriminals") === null
    && baseRateOf(F, "Cybercriminals", "Healthcare") === baseRateOf(withRecord(0, 1, { Cybercriminals: 9 }), "Cybercriminals", "Healthcare"));
  const r = withRecord(5, 1, { Cybercriminals: 3 });
  ok("three operations in five years read as (3 + ½) ÷ 5", Math.abs(ownRateOf(r, "Cybercriminals") - 0.7) < 1e-12, String(ownRateOf(r, "Cybercriminals")));
  ok("...and replace the bundled rate for that class", baseRateOf(r, "Cybercriminals", "") === 0.7);
  ok("...with the sector exception no longer applied", baseRateOf(r, "Cybercriminals", "Healthcare") === 0.7
    && baseRateOf(F, "Cybercriminals", "Healthcare") !== F.baseRate.Cybercriminals);
  ok("a class the record says nothing about keeps the bundled rate", ownRateOf(r, "Insider") === null
    && baseRateOf(r, "Insider", "Healthcare") === baseRateOf(F, "Insider", "Healthcare"));
  ok("zero seen in three years is one in six, not never", Math.abs(ownRateOf(withRecord(3, 1, { Insider: 0 }), "Insider") - 1 / 6) < 1e-12);
  ok("a pooled record divides by its organisations", Math.abs(ownRateOf(withRecord(2, 10, { Opportunist: 39.5 }), "Opportunist") - 2) < 1e-12);
  ok("the attempt rate says the base is the record's", attemptsPerYear({ actor: "Cybercriminals", sector: "Healthcare", activity: 0.5, resources: 0.5, relevance: 0.5, pull: "relevance" }, r).own === true
    && attemptsPerYear({ actor: "Cybercriminals", sector: "Healthcare", activity: 0.5, resources: 0.5, relevance: 0.5, pull: "relevance" }, r).sector.factor === 1
    && attemptsPerYear({ actor: "Cybercriminals", sector: "Healthcare", activity: 0.5, resources: 0.5, relevance: 0.5, pull: "relevance" }, F).own === false);
  ok("a stored calibration from before the record picks it up empty",
    reconcileCalibration({ frequency: { baseRate: { Opportunist: 2 } } }).frequency.history.years === 0);
}

// ── a money band read as a lognormal ────────────────────────────────────────
{
  let seed = 12345; const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const r = { min: 4.5e4, mode: 6e5, max: 8e6, dist: "lognormal" };   // the bundled severity-3 band
  const xs = Array.from({ length: 40000 }, () => draw(rand, r)).sort((a, b) => a - b);
  const q = (p) => xs[Math.floor(p * xs.length)];
  ok("the median of the draws is the band's middle point", Math.abs(q(0.5) / r.mode - 1) < 0.05, String(q(0.5)));
  ok("one draw in twenty falls above the band's top", Math.abs(xs.filter((x) => x > r.max).length / xs.length - 0.05) < 0.01,
    String(xs.filter((x) => x > r.max).length / xs.length));
  ok("...and one in twenty below its bottom", Math.abs(xs.filter((x) => x < r.min).length / xs.length - 0.05) < 0.01);
  const { sigma } = lognormalOf(r);
  ok("the spread within a band is that of one scenario, not a population", sigma > 1.0 && sigma < 1.8, String(sigma));
  ok("the bundled bands are symmetric on the log scale, so their points are the percentiles they claim",
    DEFAULT_CALIBRATION.magnitude.loss.every((b) => Math.abs(Math.log(b.min * b.max) - 2 * Math.log(b.mode)) < 0.05));
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  ok("the mean sits well above the median - the tail is there", mean > 1.5 * r.mode, `${mean} vs ${r.mode}`);
  ok("a PERT band is still bounded", Array.from({ length: 5000 }, () => draw(rand, { min: 1, mode: 2, max: 3 })).every((x) => x >= 1 && x <= 3));
  ok("the bundled loss bands are lognormal and ordered", DEFAULT_CALIBRATION.magnitude.loss.every((b) => b.dist === "lognormal")
    && DEFAULT_CALIBRATION.magnitude.loss.every((b, i, a) => i === 0 || b.mode > a[i - 1].mode));
  ok("the top band's P95 clears IRIS's 95th percentile of 32M", DEFAULT_CALIBRATION.magnitude.loss[3].max >= 3.2e7);
}

// ── organisation size ───────────────────────────────────────────────────────
{
  const F = DEFAULT_CALIBRATION.frequency;
  const facts = (size) => ({ actor: "Cybercriminals", sector: "", activity: 0.5, resources: 0.5, relevance: 0.5, pull: "relevance", size });
  ok("unset size is the medium organisation the rates were derived for",
    baseRateOf(F, "Cybercriminals", "", undefined) === F.baseRate.Cybercriminals && attemptsPerYear(facts(undefined), F).size.factor === 1);
  ok("medium is the unit", baseRateOf(F, "Cybercriminals", "", "Medium (50-249)") === F.baseRate.Cybercriminals);
  ok("small is hit less often, large and very large more, in that order",
    baseRateOf(F, "Cybercriminals", "", "Small (10-49)") < F.baseRate.Cybercriminals
    && baseRateOf(F, "Cybercriminals", "", "Large (250-999)") > F.baseRate.Cybercriminals
    && baseRateOf(F, "Cybercriminals", "", "Very large (1000+)") > baseRateOf(F, "Cybercriminals", "", "Large (250-999)"));
  ok("the Eurostat steps: small 0.73, large 1.6", Math.abs(F.size["Small (10-49)"] - 0.73) < 1e-9 && Math.abs(F.size["Large (250-999)"] - 1.6) < 1e-9);
  ok("size and sector multiply, and are reported apart", (() => {
    const b = attemptsPerYear({ ...facts("Large (250-999)"), sector: "Healthcare" }, F);
    return Math.abs(b.base - F.baseRate.Cybercriminals * 1.25 * 1.6) < 1e-9 && b.size.factor === 1.6 && Math.abs(b.sector.factor - 1.25) < 1e-9;
  })());
  ok("a size this calibration has no row for changes nothing", baseRateOf(F, "Cybercriminals", "", "Gigantic") === F.baseRate.Cybercriminals);
  const own = { ...F, history: { years: 4, organisations: 1, counts: { Cybercriminals: 2 } } };
  ok("an own record is not scaled by size - it is already of this organisation",
    baseRateOf(own, "Cybercriminals", "Healthcare", "Very large (1000+)") === 2.5 / 4 && attemptsPerYear({ ...facts("Very large (1000+)"), sector: "Healthcare" }, own).size.factor === 1);
}

// ── a measure's strength ────────────────────────────────────────────────────
{
  const ts = "2026-01-01T00:00:00.000Z";
  const rec = (id, type, values) => ({ id, type, values, createdAt: ts, updatedAt: ts });
  const M = (strength) => rec("m", "security_measure", { name: "m", measure_type: "Preventive", status: "Implemented", implementation_level: 4, ...(strength ? { strength } : {}) });
  const eff = (m) => measureEfficacyOf(tax, m, DEFAULT_CALIBRATION);
  ok("an unrated measure reaches the ceiling - what every measure did before the rating", eff(M(undefined)) === DEFAULT_CALIBRATION.effect.controlCeiling);
  ok("very strong is the ceiling too", eff(M(4)) === DEFAULT_CALIBRATION.effect.controlCeiling);
  ok("weaker ratings reach less of it, in order", eff(M(1)) < eff(M(2)) && eff(M(2)) < eff(M(3)) && eff(M(3)) < eff(M(4)));
  ok("weak is well below half of the ceiling's worth", eff(M(1)) <= 0.45 * eff(M(4)));
  ok("strength multiplies with roll-out and lifecycle rather than replacing them",
    Math.abs(measureEfficacyOf(tax, { ...M(2), values: { ...M(2).values, implementation_level: 2, status: "Planned" } }, DEFAULT_CALIBRATION)
      - 0.65 * (1 / 3) * DEFAULT_CALIBRATION.effect.controlCeiling * 0.5) < 1e-9);
  // The library seeds it, with the evidence beside it.
  const lib = FRAMEWORKS.MEASURE_LIBRARY;
  const mfa = lib.items.find((it) => it.ref_id === "IAM-01"), training = lib.items.find((it) => it.ref_id === "PPL-01");
  ok("every library measure carries a strength and its evidence", lib.items.every((it) => it.strength >= 1 && it.strength <= 4 && it.evidence));
  ok("MFA is rated above awareness training", mfa.strength === 4 && training.strength === 1);
  ok("...and the seeded measure carries the rating", FRAMEWORKS.measureValues(lib, mfa).strength === 4);
  ok("a framework item seeds no rating - it says what to do, not how well it works",
    FRAMEWORKS.measureValues(FRAMEWORKS.NIS2, FRAMEWORKS.NIS2.items[0]).strength === undefined);
}

// ── correlated control failure: gates on one cause ──────────────────────────
//
// Two gates that depend on the same thing are drawn with one position per attempt. Each
// gate alone must behave exactly as before (the marginal is unchanged); together they
// must be worth ONE gate when they are the same gate, and somewhere between one and two
// otherwise. Independence would say two, and that is the overestimate this removes.
{
  const inp = {
    attemptRate: R(4, 5, 6), adversaryStrength: R(0.2, 0.55, 0.9), controlStrength: R(0.1, 0.15, 0.2),
    directImpact: R(1e5, 1e5, 1e5), cascadingLikelihood: R(0, 0, 0), cascadingImpact: R(0, 0, 0),
  };
  const gate = R(0.45, 0.55, 0.65);
  const one = [{ id: "a", preds: [], join: "all", gate, interrupt: 0, terminal: false },
    { id: "z", preds: [0], join: "all", gate: null, interrupt: 0, terminal: true }];
  const two = (group) => [{ id: "a", preds: [], join: "all", gate, interrupt: 0, terminal: false, ...(group ? { group } : {}) },
    { id: "b", preds: [0], join: "all", gate, interrupt: 0, terminal: false, ...(group ? { group } : {}) },
    { id: "z", preds: [1], join: "all", gate: null, interrupt: 0, terminal: true }];
  const v = (chain) => simulate(inp, 40000, chain).vuln;
  const vOne = v(one), vTwoInd = v(two(null)), vTwoSame = v(two("idp"));
  ok("two independent gates stop more than one", vTwoInd < vOne * 0.9, `${vTwoInd.toFixed(3)} vs ${vOne.toFixed(3)}`);
  ok("two identical gates on one cause are worth one gate", Math.abs(vTwoSame - vOne) < 0.02, `${vTwoSame.toFixed(3)} vs ${vOne.toFixed(3)}`);
  ok("...and the ordering holds: same cause > independent", vTwoSame > vTwoInd);
  // A single gate in a group is the plain gate: the marginal does not move.
  const oneGrouped = [{ ...one[0], group: "idp" }, one[1]];
  ok("a lone gate in a group behaves as it did", Math.abs(v(oneGrouped) - vOne) < 0.02, `${v(oneGrouped).toFixed(3)} vs ${vOne.toFixed(3)}`);
  // Two different groups are independent of each other.
  const twoGroups = [{ ...two("x")[0] }, { ...two("y")[1] }, two(null)[2]];
  ok("gates on different causes are independent", Math.abs(v(twoGroups) - vTwoInd) < 0.02, `${v(twoGroups).toFixed(3)} vs ${vTwoInd.toFixed(3)}`);
  // Detection shares the cause too: two watched steps on one SIEM catch what one catches.
  const watch = (group) => [{ id: "a", preds: [], join: "all", gate: null, interrupt: 0.4, terminal: false, ...(group ? { group } : {}) },
    { id: "b", preds: [0], join: "all", gate: null, interrupt: 0.4, terminal: false, ...(group ? { group } : {}) },
    { id: "z", preds: [1], join: "all", gate: null, interrupt: 0, terminal: true }];
  const dInd = simulate(inp, 40000, watch(null)).detected, dSame = simulate(inp, 40000, watch("siem")).detected;
  ok("two watched steps on one cause catch what one catches, not what two would", dSame < dInd && Math.abs(dSame / dInd - 0.4 / (1 - 0.6 * 0.6)) < 0.08,
    `${dSame.toFixed(3)} vs ${dInd.toFixed(3)}`);
}
{
  // The cause is read off the strongest defending measure, normalised.
  const ts = "2026-01-01T00:00:00.000Z";
  const rec = (id, type, values) => ({ id, type, values, createdAt: ts, updatedAt: ts });
  const synth = (ents) => ({ id: "s", name: "t", organization: "", scope: "", createdAt: ts, updatedAt: ts, entities: ents });
  const OP = rec("op", "operational_scenario", { name: "op", strategic_scenario: "ss", likelihood: 3, difficulty: 2 });
  const S1 = rec("s1", "kill_chain_step", { name: "s1", operational_scenario: "op", step_order: 1 });
  const S2 = rec("s2", "kill_chain_step", { name: "s2", operational_scenario: "op", step_order: 2 });
  const M = (id, covers, extra) => rec(id, "security_measure", { name: id, measure_type: "Preventive", status: "Implemented", implementation_level: 4, covers, ...extra });
  const study = synth([OP, S1, S2, M("m1", ["s1"], { fails_with: " Identity Provider " }), M("m2", ["s2"], { fails_with: "identity provider" }),
    M("m3", ["s2"], { fails_with: "siem", implementation_level: 2 })]);
  const cov = coverageOf(study, tax, OP);
  const chain = chainOf(tax, cov, 0.3);
  ok("a cause is normalised, so two spellings are one cause", chain[0].group === "identity provider" && chain[1].group === "identity provider");
  ok("...and the strongest defending measure decides where several name one", chain[1].group !== "siem");
  const plain = chainOf(tax, coverageOf(synth([OP, S1, S2, M("m1", ["s1"], {}), M("m2", ["s2"], {})]), tax, OP), 0.3);
  ok("a measure that names nothing ties nothing", plain.every((st) => !st.group));
}

// ── the output, held against the loss-event sources (sources §9.6) ──────────
//
// Inputs are attempts, the traversal makes loss events of them, and the sources with a
// denominator measure loss events: Eurostat 2024 (50-249 persons) 4.3% unavailability
// due to attack, 2.3% data destruction, 2.2% disclosure - 0.05-0.08 loss events a year
// all together; IRIS 2025 9.3% a year for a typical firm, about half of it criminal.
// A medium organisation with ordinary controls, attacked by cybercriminals, should land
// in that band. One scenario against one band is a check, not a validation.
{
  const study = makeSampleStudy();
  const opType = TAX.entityTypes.find((t) => t.fields.some((f) => f.key === "difficulty"));
  const op = study.entities.find((e) => e.type === opType.key && /ransomware/i.test(String(e.values.name)));
  const d = deriveInputs(study, TAX, op, true);
  const r = simulate(d.inputs, 40000, d.chain);
  ok("the sample's ransomware scenario, medium organisation, lands where the loss-event sources put it",
    r.lef >= 0.02 && r.lef <= 0.15, `${r.lef.toFixed(3)} loss events/yr`);
  const dWo = deriveInputs(study, TAX, op, false);
  const rWo = simulate(dWo.inputs, 40000, dWo.chain);
  ok("...and without its controls it lands above that band", rWo.lef > r.lef && rWo.lef > 0.1, `${rWo.lef.toFixed(3)}`);
  ok("...with a mean loss per event in the tier's band: IRIS typical 0.3-2M, extreme 7-62M",
    r.ale.mean / Math.max(r.lef, 1e-9) > 3e5 && r.ale.mean / Math.max(r.lef, 1e-9) < 8e6, `${(r.ale.mean / r.lef).toFixed(0)} per event`);
}

// ── what each measure buys ──────────────────────────────────────────────────
{
  const study = makeSampleStudy();
  const opType = TAX.entityTypes.find((t) => t.fields.some((f) => f.key === "difficulty"));
  const ops = study.entities.filter((e) => e.type === opType.key);
  const w = measureWorth(study, TAX, ops, DEFAULT_CALIBRATION, 8000);
  const by = Object.fromEntries(w.rows.map((r) => [String(r.measure.values.name), r]));
  ok("every measure attached to a quantified scenario has a row", w.rows.length === 8, String(w.rows.length));
  ok("a complete measure avoids something today and has nothing left to buy",
    by["Offline immutable backups"].complete && by["Offline immutable backups"].avoided > 3 * w.noise
    && by["Offline immutable backups"].avoidedIfComplete === by["Offline immutable backups"].avoided);
  ok("a planned measure with nothing rolled out avoids nothing today...", by["Decommission the legacy maintenance gateway"].avoided === 0);
  ok("...and would buy something once complete", by["Decommission the legacy maintenance gateway"].avoidedIfComplete > 3 * w.noise);
  ok("a partly rolled-out planned measure buys more complete than as it stands",
    by["MFA on remote maintenance access"].avoidedIfComplete > by["MFA on remote maintenance access"].avoided);
  ok("without costs the rows rank by what finishing them buys",
    w.rows.every((r, i) => i === 0 || w.rows[i - 1].avoidedIfComplete >= r.avoidedIfComplete) && w.rows.every((r) => r.perEuro === null));
  ok("the same study gives the same ranking", JSON.stringify(measureWorth(study, TAX, ops, DEFAULT_CALIBRATION, 8000).rows.map((r) => r.measure.id))
    === JSON.stringify(w.rows.map((r) => r.measure.id)));
  // Costs: yearly plus the one-off spread over the write-off period, and the ranking per euro.
  const m = { id: "x", type: "security_measure", values: { name: "x", cost_once: 30000, cost_yearly: 5000 } };
  ok("cost per year is the yearly plus the one-off over the period", costPerYearOf(m, 3) === 15000);
  ok("no cost is null, not zero", costPerYearOf({ ...m, values: { name: "x" } }, 3) === null);
  const priced = { ...study, entities: study.entities.map((e) => e.values.name === "Egress monitoring & DLP" ? { ...e, values: { ...e.values, cost_yearly: 1000 } }
    : e.values.name === "Offline immutable backups" ? { ...e, values: { ...e.values, cost_yearly: 1e6 } } : e) };
  const wp = measureWorth(priced, TAX, ops, DEFAULT_CALIBRATION, 8000);
  ok("with costs, a cheap measure that buys a little outranks a dear one that buys a lot",
    wp.rows.findIndex((r) => r.measure.values.name === "Egress monitoring & DLP") < wp.rows.findIndex((r) => r.measure.values.name === "Offline immutable backups")
    && wp.rows[0].perEuroIfComplete != null);
  ok("an unpriced measure ranks after every priced one", wp.rows.filter((r) => r.costPerYear == null).every((r) => wp.rows.indexOf(r) >= 2));
  ok("isComplete reads implemented and fully rolled out", isComplete(TAX, study.entities.find((e) => e.values.name === "Offline immutable backups"))
    && !isComplete(TAX, study.entities.find((e) => e.values.name === "MFA on remote maintenance access")));
}

// ── technique fit, from ATT&CK's mitigates relationships ────────────────────
{
  ok("every bundled technique is known to the mapping", ["T1566", "T1003", "T1021", "T1562", "T1082"].every(AM.isBundled));
  ok("MFA is a mitigation of remote services and valid accounts...", AM.mitigates(["M1032"], "T1021") === true && AM.mitigates(["M1032"], "T1078") === true);
  ok("...and not of phishing or credential dumping", AM.mitigates(["M1032"], "T1566") === false && AM.mitigates(["M1032"], "T1003") === false);
  ok("a sub-technique folds onto its technique", AM.mitigates(["M1032"], "T1021.001") === true);
  ok("no mitigation named, or an unknown technique, is no question", AM.mitigates([], "T1566") === null && AM.mitigates(["M1032"], "T9999") === null && AM.mitigates(["M1032"], null) === null);
  ok("ids are read out of free text, once each", JSON.stringify(AM.mitigationIds("M1032 Multi-factor Authentication, m1032, M1030")) === JSON.stringify(["M1032", "M1030"]));
  ok("defence evasion and discovery have no preventive mitigation", !(AM.TECHNIQUE_MITIGATIONS.T1562) && !(AM.TECHNIQUE_MITIGATIONS.T1082));
  ok("'Do Not Mitigate' and 'Pre-compromise' are not mitigations here", !("M1055" in AM.ATTACK_MITIGATIONS) && !("M1056" in AM.ATTACK_MITIGATIONS));
  // The library maps its controls; the sample uses them and passes the check.
  const lib = FRAMEWORKS.MEASURE_LIBRARY;
  ok("the library's MFA is M1032 and its segmentation M1030",
    lib.items.find((i) => i.ref_id === "IAM-01").mitigations.join() === "M1032" && lib.items.find((i) => i.ref_id === "NET-01").mitigations.join() === "M1030");
  ok("...and the seeded measure carries the ids as text", FRAMEWORKS.measureValues(lib, lib.items.find((i) => i.ref_id === "END-01")).mitigations === "M1040, M1049");
  const study = makeSampleStudy();
  const checks = lintStudy(TAX, study);
  const misfit = checks.find((c) => c.id === "measure-technique-misfit");
  ok("the sample's measures sit where their technique answers to them", misfit && misfit.affected.length === 0, misfit?.affected.map((m) => m.values.name).join());
  // Put MFA back on the phishing step and the check says so.
  const moved = { ...study, entities: study.entities.map((e) => e.values.name === "MFA on remote maintenance access"
    ? { ...e, values: { ...e.values, covers: [study.entities.find((s) => s.values.name === "Phishing the maintenance provider").id] } } : e) };
  const m2 = lintStudy(TAX, moved).find((c) => c.id === "measure-technique-misfit");
  ok("MFA on the phishing step is a misfit", m2.affected.length === 1 && m2.affected[0].values.name === "MFA on remote maintenance access");
  // A measure that names no mitigation is not judged.
  const blank = { ...moved, entities: moved.entities.map((e) => e.values.name === "MFA on remote maintenance access" ? { ...e, values: { ...e.values, mitigations: "" } } : e) };
  ok("a measure naming no mitigation is not judged", lintStudy(TAX, blank).find((c) => c.id === "measure-technique-misfit").affected.length === 0);
}

// ── detection as a time race (docs/detection-time-race.md §6) ──────────────
{
  const LNr = (min, mode, max) => ({ min, mode, max, dist: "lognormal" });
  const inp = {
    attemptRate: R(4, 5, 6), adversaryStrength: R(0.5, 0.55, 0.6), controlStrength: R(0.1, 0.15, 0.2),
    directImpact: R(1e5, 1e5, 1e5), cascadingLikelihood: R(0, 0, 0), cascadingImpact: R(0, 0, 0),
    respondDays: LNr(0.5, 1, 2),
  };
  const day = LNr(0.5, 1, 2);
  const step = (id, preds, extra = {}) => ({ id, preds, join: "all", gate: null, interrupt: 0, detect: null, duration: day, terminal: false, ...extra });
  const chain = (...steps) => { steps[steps.length - 1].terminal = true; return steps; };
  const run = (ch, over = {}) => simulate({ ...inp, ...over }, 40000, ch, 0x1234, { capabilitySpeed: [1, 1, 1, 1] });
  // 1. No watched step: the race never runs, and the result is the plain chain.
  const plain = chain(step("a", []), step("b", [0]), step("z", [1]));
  ok("1. with no watched step the race never runs", run(plain).detected === 0 && run(plain).seenLate === 0 && run(plain).raceMargin === null);
  // 2. Defender infinitely fast: every watched attempt is caught - the race reduces to det.
  const watched = (detect, interrupt = 0.6) => chain(step("a", []), step("b", [0], { interrupt, detect }), step("c", [1]), step("z", [2]));
  const instant = run(watched(LNr(0, 0, 0)), { respondDays: R(0, 0, 0) });
  ok("2. an infinitely fast defender catches every attempt it sees", Math.abs(instant.detected - 0.6) < 0.03 && instant.seenLate < 0.005, `${instant.detected.toFixed(3)} caught, ${instant.seenLate.toFixed(3)} late`);
  // 3. Defender infinitely slow: nothing is caught, however good the detection.
  const slow = run(watched(LNr(0, 0, 0)), { respondDays: R(1e6, 1e6, 1e6) });
  ok("3. an infinitely slow defender catches nothing, however good the detection", slow.detected === 0 && Math.abs(slow.seenLate - 0.6) < 0.03, `${slow.detected} caught, ${slow.seenLate.toFixed(3)} late`);
  // 4. Two watched steps on one cause share the detection draw (already pinned above for
  //    the interrupt; here for the alert time): a slow SIEM is slow at both.
  const twoSame = chain(step("a", [], { interrupt: 0.6, detect: LNr(0.5, 10, 40), group: "siem" }), step("b", [0], { interrupt: 0.6, detect: LNr(0.5, 10, 40), group: "siem" }), step("c", [1]), step("z", [2]));
  const twoInd = chain(step("a", [], { interrupt: 0.6, detect: LNr(0.5, 10, 40) }), step("b", [0], { interrupt: 0.6, detect: LNr(0.5, 10, 40) }), step("c", [1]), step("z", [2]));
  ok("4. two watched steps on one cause share the alert time - independent ones catch more", run(twoInd).detected > run(twoSame).detected);
  // 8. Decomposition invariance of the clock: splitting a step in two halves of the
  //    duration leaves the attacker's time to the objective, and so the catch rate.
  const half = LNr(0.25, 0.5, 1);
  const whole = chain(step("a", [], { interrupt: 0.6, detect: LNr(0.1, 0.2, 0.4) }), step("b", [0], { duration: LNr(1, 2, 4) }), step("z", [1]));
  const split = chain(step("a", [], { interrupt: 0.6, detect: LNr(0.1, 0.2, 0.4) }), step("b1", [0]), step("b2", [1]), step("z", [2]));
  split[1].duration = day; split[2].duration = day;   // 1 + 1 against 2
  ok("8. splitting a step does not change the attacker's time to the objective", Math.abs(run(whole).detected - run(split).detected) < 0.03,
    `${run(whole).detected.toFixed(3)} vs ${run(split).detected.toFixed(3)}`);
  // The margin is reported in the direction it happened.
  ok("the margin is positive when caught, negative when seen and late", instant.raceMargin > 0 && slow.raceMargin < 0);
  // 5-7. The reference postures, on a ransomware-shaped chain with the bundled bands:
  //    a SIEM and a plan on paper catch part of what they see, telemetry and a 24x7
  //    response most, and the patient espionage actor is found - late - where watched.
  const world = (id, type, values) => rec(id, type, values);
  const posture = ({ readiness, strength, cap = 3, tactics = ["Initial Access", "Persistence", "Credential Access", "Lateral Movement", "Impact"], g = 3 }) => {
    const op = world("op", "operational_scenario", { name: "op", strategic_scenario: "ss", likelihood: 3, difficulty: 2 });
    const ents = [world("ba", "business_asset", { name: "ba", criticality: 4 }), world("fe", "feared_event", { name: "fe", business_asset: "ba", severity: 3 }),
      world("ro", "risk_origin", { name: "ro", capability: cap, resources: 3, activity: 3, relevance: 3 }),
      world("ss", "strategic_scenario", { name: "ss", risk_origin: "ro", feared_event: "fe", likelihood: 3, gravity: 3 }), op];
    tactics.forEach((t, i) => ents.push(world(`s${i}`, "kill_chain_step", { name: `s${i}`, operational_scenario: "op", step_order: i + 1, tactic: t, predecessors: i ? [`s${i - 1}`] : [] })));
    for (let i = 0; i < g; i++) ents.push(world(`m${i}`, "security_measure", { name: `m${i}`, measure_type: "Detective", status: "Implemented", implementation_level: 4, strength, covers: [`s${i}`] }));
    const d = deriveInputs(study(ents, { readiness }), tax, op, true);
    const r = simulate(d.inputs, 40000, d.chain, undefined, PACE);
    return { caughtOfSeen: r.detected / Math.max(1e-9, r.detected + r.seenLate), vuln: r.vuln, margin: r.raceMargin };
  };
  const typical = posture({ readiness: "Plan on paper", strength: 2 });
  ok("5. ransomware, a SIEM and a plan on paper: part of what is seen is caught, not most", typical.caughtOfSeen > 0.15 && typical.caughtOfSeen < 0.55, typical.caughtOfSeen.toFixed(2));
  const good = posture({ readiness: "24x7 response with authority to contain", strength: 3 });
  ok("6. telemetry and a 24x7 response: most of what is seen is caught", good.caughtOfSeen > 0.75, good.caughtOfSeen.toFixed(2));
  const spy = posture({ readiness: "Plan on paper", strength: 2, cap: 4, g: 4,
    tactics: ["Reconnaissance", "Initial Access", "Persistence", "Discovery", "Discovery", "Collection", "Exfiltration"] });
  ok("7. a patient espionage actor is found where watched - the race is long", spy.caughtOfSeen > typical.caughtOfSeen, `${spy.caughtOfSeen.toFixed(2)} vs ${typical.caughtOfSeen.toFixed(2)}`);
}

// ── sensitivity: which assumption carries the number ────────────────────────
{
  const inp = {
    attemptRate: R(0.5, 2, 6),
    adversaryStrength: R(0.3, 0.55, 0.8),
    controlStrength: R(0.35, 0.45, 0.55),
    directImpact: R(6e5, 8e5, 1.1e6),     // narrow on purpose: the rate's 12x band is the widest
    cascadingLikelihood: R(0.1, 0.25, 0.4),
    cascadingImpact: R(5e4, 2e5, 6e5),
    respondDays: { min: 1, mode: 4, max: 20, dist: "lognormal" },
  };
  const s = sensitivityOf(inp, undefined, 8000);
  ok("the base is the plain simulation's mean", Math.abs(s.base - simulate(inp, 8000).ale.mean) < 1e-9);
  ok("every factor with a band gets a swing", s.swings.length === 7, String(s.swings.length));
  ok("the swings come sorted, largest first", s.swings.every((w, i) => i === 0 || s.swings[i - 1].swing >= w.swing));
  const byKey = Object.fromEntries(s.swings.map((w) => [w.key, w]));
  ok("the widest band - the attempt rate's - is the top carrier", s.swings[0].key === "attemptRate", s.swings[0].key);
  ok("more attempts mean more loss - the rate is not inverse", !byKey.attemptRate.inverse);
  ok("a stronger control means less loss - the control IS inverse", byKey.controlStrength.inverse);
  ok("the low end of the rate gives less loss than the high end", byKey.attemptRate.low < byKey.attemptRate.high);
  ok("the noise is small against the top swing", s.noise * 3 < s.swings[0].swing, `${s.noise} vs ${s.swings[0].swing}`);
  ok("the carriers are the swings that are a third of the top and clear of the noise",
    carriers(s).length === s.swings.filter((w) => w.swing > 3 * s.noise && w.swing >= s.swings[0].swing / 3).length
    && carriers(s).length >= 1 && carriers(s).length < s.swings.length, String(carriers(s).length));
  ok("the same inputs give the same tornado", JSON.stringify(sensitivityOf(inp, undefined, 8000)) === JSON.stringify(s));

  // A point estimate has no band to walk, and must not appear as a factor of zero swing.
  const pinned = { ...inp, cascadingImpact: R(2e5, 2e5, 2e5) };
  const sp = sensitivityOf(pinned, undefined, 8000);
  ok("a factor without a band does not appear", sp.swings.length === 6 && !sp.swings.some((w) => w.key === "cascadingImpact"));

  // Gates on the chain are factors too, named by their step.
  const chain = [
    { id: "s1", preds: [], join: "all", gate: R(0.4, 0.5, 0.6), interrupt: 0, terminal: false },
    { id: "s2", preds: [0], join: "all", gate: null, interrupt: 0, terminal: true },
  ];
  const sc = sensitivityOf(inp, chain, 8000);
  ok("a gated step is a factor, an undefended one is not",
    sc.swings.filter((w) => w.key.startsWith("step:")).map((w) => w.key).join() === "step:s1");
  ok("a stronger gate means less loss", sc.swings.find((w) => w.key === "step:s1").inverse);
}

console.log(`\n${pass}/${pass + fail} quantification assertions passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
