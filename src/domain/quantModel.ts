// Derive the quantitative-risk factors of an operational scenario from the
// qualitative model already captured (scenario likelihood/difficulty, risk-source
// capability/activity, kill-chain mitigation coverage, feared-event severity).
// Only the loss magnitudes stay as user-estimated distributions. Each factor
// carries its provenance so the tree can show where it comes from.
import type { EntityRecord, Study, Taxonomy } from "./types";
import { getType, scaleLabel, scaleMax } from "./taxonomy";
import { stepFields } from "./killchain";
import { effectClassOf, type EffectClass } from "./controls";
import { PERT_LAMBDA, type ChainStep, type QuantInputs, type Range } from "./montecarlo";

export interface Prov { icon: string; source: string; label: string; estimated?: boolean }
export interface StepCov {
  step: EntityRecord; measures: EntityRecord[]; impl: number;
  /** Combined efficacy of EVERY measure on the step - the plain "is this step looked
   *  after" figure the charts and the treatment view have always shown. */
  coverage: number;
  /** Combined efficacy of the measures that actually RESIST here (preventive, plus
   *  anything left unclassified). This is what becomes the step's gate. */
  prevention: number;
  /** Combined efficacy of the measures that DETECT here. Does not resist anything; it
   *  buys the chance to interrupt the intrusion before it reaches the objective. */
  detection: number;
}
// A single fully-implemented control never fully blocks a step; layers stack
// (defense in depth), so step coverage saturates towards 1 as measures are added.
export const CONTROL_CEILING = 0.85;
// A measure only protects to the extent it is actually in place: a planned or
// recommended control counts far less than an implemented one.
// `implementation_level` already carries how far a control is rolled out, so the status
// must not discount the same thing a second time - it says where the control is in its
// lifecycle. A planned control that is partly in place still stops some attacks; a
// merely recommended one is little more than an intention.
export const STATUS_WEIGHT: Record<string, number> = { Implemented: 1, Planned: 0.5, Recommended: 0.15, Missing: 0 };
/** Per-measure efficacy on a step: implementation level x lifecycle status x ceiling. */
export function measureEfficacyOf(tax: Taxonomy, m: EntityRecord): number {
  const mt = getType(tax, m.type);
  const implF = mt?.fields.find((f) => f.key === "implementation_level");
  const statusF = mt?.fields.find((f) => f.key === "status");
  const implMax = implF ? scaleMax(implF) : 4;
  const impl = (implF ? Number(m.values[implF.key] ?? 1) : implMax) / implMax;
  const sw = STATUS_WEIGHT[statusF ? String(m.values[statusF.key] ?? "") : ""] ?? 1;
  return c01(impl) * CONTROL_CEILING * sw;
}
/** Defense-in-depth step coverage from the layers' efficacies: 1 - product(1-eff). */
export const stepCoverage = (effs: number[]) => 1 - effs.reduce((p, e) => p * (1 - e), 1);
export interface Coverage { mitigated: number; total: number; impl: number; value: number; steps: StepCov[] }
export interface Refs { op: EntityRecord; strategic?: EntityRecord; riskSource?: EntityRecord; fearedEvent?: EntityRecord }
export interface Derived {
  inputs: QuantInputs;
  /** The traversable kill chain, when the scenario models one and controls are counted
   *  (the inherent derivation has no gates, so it needs none). */
  chain?: ChainStep[];
  prov: Record<keyof QuantInputs, Prov>;
  coverage: Coverage;
  refs: Refs;
  scenario: string;
  riskSource: string;
}

const R = (min: number, mode: number, max: number): Range => ({ min, mode, max });
// PERT mean: (min + lambda*mode + max) / (lambda + 2). Matches the sampler so the
// tree's shown values line up with the simulation.
export const meanOf = (r: Range) => {
  const l = Math.max(0, r.lambda == null ? PERT_LAMBDA : r.lambda);
  return (r.min + l * r.mode + r.max) / (l + 2);
};
const c01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// The calibration arrays below are anchored at a few levels (1..4 ≈ ratio 0, ⅓, ⅔, 1).
// Sampling them at an arbitrary ratio r ∈ [0,1] by linear interpolation lets a scale of
// ANY length feed the model without clamping - a classic 1..4 scale hits the anchors
// exactly, so its results are unchanged; a 1..5 (or 1..N) scale is placed proportionally.
const sampleRange = (anchors: Range[], r: number): Range => {
  const p = c01(r) * (anchors.length - 1), i = Math.min(anchors.length - 2, Math.floor(p)), t = p - i;
  const a = anchors[i], b = anchors[i + 1];
  return { min: lerp(a.min, b.min, t), mode: lerp(a.mode, b.mode, t), max: lerp(a.max, b.max, t) };
};
const sampleNum = (anchors: number[], r: number): number => {
  const p = c01(r) * (anchors.length - 1), i = Math.min(anchors.length - 2, Math.floor(p)), t = p - i;
  return lerp(anchors[i], anchors[i + 1], t);
};
// Ratio 0..1 of a scale value on its own 1..max scale (0 = lowest level, 1 = highest),
// so V1..V5 / L1..L5 and any other length map in without information loss. Missing value
// or record → a neutral mid-low default (matches the old level-2-of-4 fallback).
const scaleRatio = (tax: Taxonomy, rec: EntityRecord | undefined, key: string, fallback = 1 / 3): number => {
  if (!rec) return fallback;
  const f = getType(tax, rec.type)?.fields.find((x) => x.key === key);
  const v = Number(rec.values[key]);
  if (!f || !Number.isFinite(v)) return fallback;
  const max = scaleMax(f);
  return max > 1 ? c01((v - 1) / (max - 1)) : 0;
};

// Calibration anchors (levels 1..4 ≈ ratio 0..1; sampled by sampleRange/sampleNum
// so any scale length works). Frequencies are deliberately conservative:
// a specific severe end-to-end scenario is attempted a fraction of a time per year,
// not several - so the annual loss stays in a realistic range once magnitudes are
// large. Vulnerability then thins these threat events by P(adversary > control).
// Contact frequency = how often the actor drives THIS scenario (threat events/yr).
const ACTIVITY: Range[] = [R(.1, .2, .4), R(.2, .4, .8), R(.4, .8, 1.5), R(.8, 1.5, 3)];
// Probability of action = a contact turns into an actual attack attempt.
const PROB_LK: Range[] = [R(.03, .06, .12), R(.06, .12, .25), R(.12, .25, .4), R(.25, .4, .6)];
// Threat capability, as a share of the overall attacker population that this actor can
// out-perform. A rating describes a CLASS of actor, not an individual, so each band is
// deliberately wide: "capable" covers everything from an average operator to the best
// people that class can field. Narrow bands would be false precision, and they would
// turn the capability-vs-resistance comparison into an on/off switch.
//
// Every band reaches close to 1 with a HEAVY MODE (lambda): the mass stays around the
// rating, but the tail never quite closes. That tail is not decoration - PERT has hard
// bounds, so a band that stops short of a control's strength yields exactly zero
// vulnerability, and "this control cannot ever be beaten" is never a true statement.
// Even an unskilled attacker occasionally walks into an unpatched box with a working
// public exploit.
const CAPAB: Range[] = [
  { min: .01, mode: .12, max: .90, lambda: 7 },
  { min: .05, mode: .32, max: .93, lambda: 5 },
  { min: .15, mode: .58, max: .96, lambda: 4 },
  { min: .35, mode: .82, max: .99, lambda: 4 },
];
// Control strength from scenario difficulty. This is the BASELINE the attacker has to
// beat once per attempt, before any specific control - charging it once (rather than per
// step) is what keeps the result independent of how finely the chain was decomposed.
// Difficulty is a coarse ordinal judgement, so its levels sit CLOSE together: a single
// step may shift the resistance by only a fraction of the spread around it, otherwise
// one click of a 1..4 scale decides the whole analysis (measured: it used to swing
// vulnerability by 60 points, which no analyst can justify).
const DIFF_BASE = [.20, .30, .40, .50];                                                    // control from difficulty
/** How far a step's own coverage lifts its resistance above the scenario baseline.
 *  Applied PER GATED STEP now, not once to an averaged coverage figure. Sized so that a
 *  single fully implemented control is worth roughly a factor of 2-3 on vulnerability -
 *  real controls shift the odds, none of them settles the matter. */
export const K_PREV = 0.40;
/** Deterrence works on the decision to attack, not on the attack: fewer attempts are
 *  started. Modest by nature - it discourages, it does not prevent. */
export const K_DETER = 0.35;
/** Avoidance removes the exposure itself, so it works on how often the actor makes
 *  contact at all. The strongest of the frequency-side levers. */
export const K_AVOID = 0.60;
/** Share of a primary loss that recovery can actually reach. Regulatory fines, contract
 *  penalties and reputational damage do not go away because the backups were good - so a
 *  fully implemented corrective control must never drive the loss towards zero. */
export const RECOVERABLE_SHARE = 0.60;
/** How far containment cuts the chance of follow-on losses. */
export const K_CONTAIN = 0.50;
/** Detecting the impact itself no longer prevents the loss; it shortens the event and
 *  therefore trims the bill. Deliberately small. */
export const K_LATE_DET = 0.25;
/** How much of a detective control's strength converts into actually breaking off an
 *  intrusion at that step. Well short of 1: alerts are missed, triaged late or not
 *  believed, and the published dwell times show how often a monitored intrusion still
 *  runs its course. Without this factor a single fully implemented detective control
 *  would stop more than half of all attempts where it sits. */
export const K_DETECT = 0.35;
/** Detection only stops an intrusion if somebody acts on it, so its effect is gated on
 *  the response capability (derived from the corrective measures of the scenario). The
 *  floor grants that SOME reaction always happens, even where none was planned - without
 *  it, a study with no corrective measures would rate its whole detection stack at zero. */
export const RESPONSE_FLOOR = 0.20;
/** Spread around a derived resistance mode. Wide on purpose: we do not know a control's
 *  strength to two decimals, and pretending we do makes the model a threshold detector
 *  instead of a dial. Symmetric, so shifting the mode moves the whole distribution. */
const around = (mode: number): Range => R(c01(mode - 0.25), c01(mode), c01(mode + 0.25));
const SEV_LOSS: Range[] = [R(5e3, 2e4, 8e4), R(5e4, 2e5, 8e5), R(2e5, 1e6, 4e6), R(1e6, 5e6, 2e7)];
const SEV_CASC_L: Range[] = [R(.1, .2, .35), R(.2, .35, .55), R(.3, .5, .7), R(.45, .65, .85)];
const SEV_CASC: Range[] = [R(2e3, 1e4, 4e4), R(2e4, 1e5, 4e5), R(1e5, 5e5, 2e6), R(5e5, 2.5e6, 1e7)];

/** Kill-chain mitigation coverage of an operational scenario: share of steps
 *  mitigated, weighted by the implementation level of the covering measures. */
/** Structural detection of the step and measure types - a step is the type that points
 *  at a parent and carries an order; a measure is the type that multirefs steps. Shared
 *  by the coverage figure and the chain model so both read the same taxonomy. */
function chainTypes(tax: Taxonomy) {
  const stepType = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "ref" && f.refType) && t.fields.some((f) => f.type === "number"));
  const parentF = stepType?.fields.find((f) => f.type === "ref" && f.refType);
  const measureType = tax.entityTypes.find((t) => t.key !== stepType?.key && t.fields.some((f) => f.type === "multiref" && f.refType === stepType?.key));
  const coversF = measureType?.fields.find((f) => f.type === "multiref" && f.refType === stepType?.key);
  const implF = measureType?.fields.find((f) => f.key === "implementation_level");
  return { stepType, parentF, measureType, coversF, implF };
}

export function coverageOf(study: Study, tax: Taxonomy, op: EntityRecord): Coverage {
  const { stepType, parentF, measureType, coversF, implF } = chainTypes(tax);
  if (!stepType || !parentF || !measureType || !coversF) return { mitigated: 0, total: 0, impl: 0, value: 0, steps: [] };
  const steps = study.entities.filter((e) => e.type === stepType.key && e.values[parentF.key] === op.id);
  const measures = study.entities.filter((e) => e.type === measureType.key);
  const implMax = implF ? scaleMax(implF) : 4;
  const implFrac = (m: EntityRecord) => (implF ? Number(m.values[implF.key] ?? 1) : implMax) / implMax;
  let mitigated = 0, covSum = 0, implSum = 0;
  const detail: StepCov[] = [];
  for (const s of steps) {
    const cov = measures.filter((m) => Array.isArray(m.values[coversF.key]) && (m.values[coversF.key] as string[]).includes(s.id));
    // Defense in depth: each layer's efficacy (implementation x status), combined so
    // the step is only breached if every layer fails. Saturates as layers are added.
    // Split by what the measures actually DO - a backup on this step is not a barrier.
    const effOf = (cls: EffectClass) => stepCoverage(cov.filter((m) => effectClassOf(m) === cls).map((m) => measureEfficacyOf(tax, m)));
    const sc = stepCoverage(cov.map((m) => measureEfficacyOf(tax, m)));
    const avgImpl = cov.length ? cov.reduce((a, m) => a + implFrac(m), 0) / cov.length : 0;
    if (cov.length) { mitigated++; implSum += avgImpl; }
    covSum += sc;
    detail.push({ step: s, measures: cov, impl: avgImpl, coverage: sc, prevention: effOf("Preventive"), detection: effOf("Detective") });
  }
  const total = steps.length;
  const impl = mitigated ? implSum / mitigated : 0;
  const value = total ? covSum / total : 0; // avg defense-in-depth coverage over all steps
  return { mitigated, total, impl, value, steps: detail };
}

/** Build the traversable chain of one operational scenario from its steps.
 *
 *  Only steps that something DEFENDS become gates; the rest are transparent, which is
 *  what makes the result independent of how finely the chain was decomposed. Predecessor
 *  edges are restricted to this scenario - a cross-scenario edge models a cascade between
 *  scenarios, not a prerequisite inside this one. Steps that declare no predecessors at
 *  all (legacy or imported data) are read as a straight line in step order.
 *
 *  Returns undefined when the scenario has no steps: the caller then falls back to the
 *  plain baseline comparison, which is also the path for taxonomies without kill chains. */
export function chainOf(tax: Taxonomy, cov: Coverage, ctlBase: number, readiness: number): ChainStep[] | undefined {
  if (!cov.steps.length) return undefined;
  const { stepType } = chainTypes(tax);
  const sf = stepType ? stepFields(stepType) : null;
  const own = new Set(cov.steps.map((s) => s.step.id));
  const orderKey = sf?.orderField.key;
  const byOrder = (a: StepCov, b: StepCov) =>
    (orderKey ? Number(a.step.values[orderKey] ?? 0) - Number(b.step.values[orderKey] ?? 0) : 0);

  type Node = { sc: StepCov; preds: string[] };
  let nodes: Node[] = cov.steps.map((sc) => {
    const raw = sf ? sc.step.values[sf.predField.key] : null;
    const preds = Array.isArray(raw)
      ? (raw as unknown[]).filter((id): id is string => typeof id === "string" && id !== sc.step.id && own.has(id))
      : [];
    return { sc, preds };
  });
  if (nodes.every((n) => !n.preds.length)) {          // legacy: no DAG modelled - read the order
    nodes = [...nodes].sort((a, b) => byOrder(a.sc, b.sc));
    for (let i = 1; i < nodes.length; i++) nodes[i].preds = [nodes[i - 1].sc.step.id];
  }

  // Topological order (Kahn). Anything left over sits in a cycle - imported data is
  // tolerated on read, so those steps are appended in order and their unresolved
  // predecessor edges dropped rather than hanging or throwing.
  const byId = new Map(nodes.map((n) => [n.sc.step.id, n]));
  const outgoing = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const n of nodes) indeg.set(n.sc.step.id, 0);
  for (const n of nodes) {
    for (const p of n.preds) {
      if (!byId.has(p)) continue;
      (outgoing.get(p) ?? outgoing.set(p, []).get(p)!).push(n.sc.step.id);
      indeg.set(n.sc.step.id, (indeg.get(n.sc.step.id) ?? 0) + 1);
    }
  }
  const ready = nodes.filter((n) => (indeg.get(n.sc.step.id) ?? 0) === 0).sort((a, b) => byOrder(a.sc, b.sc));
  const sorted: Node[] = [];
  const queue = [...ready];
  while (queue.length) {
    const n = queue.shift()!;
    sorted.push(n);
    for (const next of outgoing.get(n.sc.step.id) ?? []) {
      const left = (indeg.get(next) ?? 0) - 1;
      indeg.set(next, left);
      if (left === 0) queue.push(byId.get(next)!);
    }
  }
  if (sorted.length < nodes.length) {
    const seen = new Set(sorted.map((n) => n.sc.step.id));
    for (const n of [...nodes].sort((a, b) => byOrder(a.sc, b.sc))) if (!seen.has(n.sc.step.id)) sorted.push(n);
  }

  const index = new Map(sorted.map((n, i) => [n.sc.step.id, i]));
  // A terminal step is one no other step of this scenario depends on - reaching one is
  // what makes the attempt a loss event.
  const isPred = new Set<string>();
  for (const n of sorted) for (const p of n.preds) if (index.has(p)) isPred.add(p);
  const chain: ChainStep[] = sorted.map((n, i) => ({
    id: n.sc.step.id,
    // keep only edges the topological order actually resolved (drops cycle back-edges)
    preds: n.preds.map((p) => index.get(p) ?? -1).filter((k) => k >= 0 && k < i),
    join: n.sc.step.values.join === "any" ? "any" : "all",
    // Only what RESISTS here builds a barrier. A detective or corrective measure on this
    // step is not a wall the attacker has to climb.
    gate: n.sc.prevention > 0 ? around(c01(ctlBase + K_PREV * n.sc.prevention)) : null,
    // Detection buys an interruption, and only as far as somebody responds to it. On the
    // objective itself there is nothing left to interrupt - that value goes to magnitude.
    interrupt: isPred.has(n.sc.step.id) ? c01(K_DETECT * n.sc.detection * readiness) : 0,
    terminal: !isPred.has(n.sc.step.id),
  }));
  if (!chain.some((s) => s.terminal)) chain[chain.length - 1].terminal = true;   // degenerate data
  return chain;
}

/** Every measure attached to this scenario, whether it is anchored ON the chain (it
 *  covers one of the steps) or AT the assets the chain goes after (it protects one of
 *  them). Deterrence, avoidance and recovery act on the scenario as a whole rather than
 *  on one step, so they are collected here rather than per step. */
function linkedMeasures(study: Study, tax: Taxonomy, cov: Coverage): EntityRecord[] {
  const { stepType, parentF, measureType, coversF } = chainTypes(tax);
  if (!stepType || !measureType || !coversF) return [];
  const stepIds = new Set(cov.steps.map((s) => s.step.id));
  // The asset ref of a step is its ref that does NOT point at the parent scenario.
  const assetF = stepType.fields.find((f) => f.type === "ref" && f.refType && f.key !== parentF?.key);
  const assetIds = new Set<string>();
  if (assetF) for (const s of cov.steps) { const v = s.step.values[assetF.key]; if (typeof v === "string" && v) assetIds.add(v); }
  const protectsF = assetF ? measureType.fields.find((f) => f.type === "multiref" && f.refType === assetF.refType) : undefined;
  const hits = (m: EntityRecord, key: string, ids: Set<string>) => {
    const v = m.values[key];
    return Array.isArray(v) && (v as unknown[]).some((id) => typeof id === "string" && ids.has(id));
  };
  return study.entities.filter((m) => m.type === measureType.key
    && (hits(m, coversF.key, stepIds) || (protectsF ? hits(m, protectsF.key, assetIds) : false)));
}

/** Scale a three-point estimate by a factor, keeping its shape. */
const scaleRange = (r: Range, f: number): Range => ({ min: r.min * f, mode: r.mode * f, max: r.max * f, lambda: r.lambda });

/** Follow a single ref on a record to its target entity. */
function refOne(study: Study, rec: EntityRecord | undefined, key: string): EntityRecord | undefined {
  const id = rec?.values[key]; return typeof id === "string" ? study.entities.find((e) => e.id === id) : undefined;
}
const scaleFieldLabel = (tax: Taxonomy, rec: EntityRecord | undefined, key: string): string => {
  if (!rec) return "-"; const t = getType(tax, rec.type); const f = t?.fields.find((x) => x.key === key);
  return f && typeof rec.values[key] === "number" ? scaleLabel(f, rec.values[key] as number) : "-";
};

/** Derive all Monte-Carlo inputs for one operational scenario. `withControls`
 *  toggles inherent (false) vs residual (true, coverage lifts the difficulty). */
export function deriveInputs(study: Study, tax: Taxonomy, op: EntityRecord, withControls = true): Derived {
  const opT = getType(tax, op.type);
  // op -> strategic -> risk source / feared event
  const stratF = opT?.fields.find((f) => f.type === "ref" && f.refType);
  const strat = refOne(study, op, stratF?.key ?? "strategic_scenario");
  const rs = refOne(study, strat, "risk_origin");
  const fe = refOne(study, strat, "feared_event");

  const likeR = scaleRatio(tax, op, "likelihood"), diffR = scaleRatio(tax, op, "difficulty");
  const capR = scaleRatio(tax, rs, "capability"), actR = scaleRatio(tax, rs, "activity"), sevR = scaleRatio(tax, fe, "severity");
  const cov = coverageOf(study, tax, op);

  // Each effect class acts on its own factor. Deterrence and avoidance work at the front
  // of the chain (fewer attempts, less contact), recovery at the back (a smaller bill).
  // Nothing here applies to the inherent derivation - "no controls" has to mean none.
  const linked = withControls ? linkedMeasures(study, tax, cov) : [];
  const classEff = (cls: EffectClass) =>
    stepCoverage(linked.filter((m) => effectClassOf(m) === cls).map((m) => measureEfficacyOf(tax, m)));
  const deter = classEff("Deterrent"), avoid = classEff("Avoidance"), corr = classEff("Corrective");
  // Detection is worth what the response makes of it.
  const readiness = RESPONSE_FLOOR + (1 - RESPONSE_FLOOR) * corr;

  // Baseline resistance of the scenario. The controls no longer lift it - they sit on
  // the individual steps of the chain, where the attacker meets them one at a time.
  const ctlBase = sampleNum(DIFF_BASE, diffR);
  const control = around(ctlBase);
  const chain = withControls ? chainOf(tax, cov, ctlBase, readiness) : undefined;
  const gated = chain?.filter((s) => s.gate).length ?? 0;
  const watched = chain?.filter((s) => s.interrupt > 0).length ?? 0;
  // Detection sitting ON the objective cannot prevent anything - it shortens the event.
  const termDet = stepCoverage((chain ?? []).filter((s) => s.terminal)
    .map((s) => cov.steps.find((c) => c.step.id === s.id)?.detection ?? 0));

  const cut = (r: Range, f: number) => (withControls ? scaleRange(r, c01(f)) : r);
  const inputs: QuantInputs = {
    threatActivity: cut(sampleRange(ACTIVITY, actR), 1 - K_AVOID * avoid),
    attackProbability: cut(sampleRange(PROB_LK, likeR), 1 - K_DETER * deter),
    adversaryStrength: sampleRange(CAPAB, capR),
    controlStrength: control,
    directImpact: cut(sampleRange(SEV_LOSS, sevR), (1 - RECOVERABLE_SHARE * corr) * (1 - K_LATE_DET * termDet)),
    cascadingLikelihood: cut(sampleRange(SEV_CASC_L, sevR), 1 - K_CONTAIN * corr),
    cascadingImpact: sampleRange(SEV_CASC, sevR),
  };
  const rsName = rs ? String(rs.values.name ?? "risk source") : "risk source";
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const prov: Record<keyof QuantInputs, Prov> = {
    threatActivity: { icon: avoid > 0 ? "🛡" : "◆", source: avoid > 0 ? "actor activity - avoidance" : "actor activity",
      label: avoid > 0 ? `${scaleFieldLabel(tax, rs, "activity")} · exposure cut ${pct(K_AVOID * avoid)}` : scaleFieldLabel(tax, rs, "activity") },
    attackProbability: { icon: deter > 0 ? "🛡" : "◆", source: deter > 0 ? "scenario likelihood - deterrence" : "scenario likelihood",
      label: deter > 0 ? `${scaleFieldLabel(tax, op, "likelihood")} · attempts cut ${pct(K_DETER * deter)}` : scaleFieldLabel(tax, op, "likelihood") },
    adversaryStrength: { icon: "⚔", source: rsName, label: scaleFieldLabel(tax, rs, "capability") },
    controlStrength: { icon: "🛡", source: chain ? "scenario difficulty + chain" : "scenario difficulty",
      label: chain
        ? `${scaleFieldLabel(tax, op, "difficulty")} · ${gated}/${chain.length} gated${watched ? `, ${watched} watched` : ""}`
        : scaleFieldLabel(tax, op, "difficulty") },
    directImpact: corr > 0 || termDet > 0
      ? { icon: "🛡", source: "recovery & containment", label: `severity ${scaleFieldLabel(tax, fe, "severity")} · loss cut ${pct(1 - (1 - RECOVERABLE_SHARE * corr) * (1 - K_LATE_DET * termDet))}` }
      : { icon: "✎", source: `severity ${scaleFieldLabel(tax, fe, "severity")}`, label: "estimate", estimated: true },
    cascadingLikelihood: corr > 0
      ? { icon: "🛡", source: "containment", label: `follow-on cut ${pct(K_CONTAIN * corr)}` }
      : { icon: "✎", source: "follow-on", label: "estimate", estimated: true },
    cascadingImpact: { icon: "✎", source: "follow-on", label: "estimate", estimated: true },
  };
  return { inputs, chain, prov, coverage: cov, refs: { op, strategic: strat, riskSource: rs, fearedEvent: fe }, scenario: String(op.values.name ?? "scenario"), riskSource: rsName };
}
