// Derive the quantitative-risk factors of an operational scenario from the
// qualitative model already captured (scenario likelihood/difficulty, risk-source
// capability/activity, kill-chain mitigation coverage, feared-event severity).
// Only the loss magnitudes stay as user-estimated distributions. Each factor
// carries its provenance so the tree can show where it comes from.
import type { EntityRecord, Study, Taxonomy } from "./types";
import { getType, scaleLabel, scaleMax } from "./taxonomy";
import { PERT_LAMBDA, type QuantInputs, type Range } from "./montecarlo";

export interface Prov { icon: string; source: string; label: string; estimated?: boolean }
export interface StepCov { step: EntityRecord; measures: EntityRecord[]; impl: number; coverage: number }
// A single fully-implemented control never fully blocks a step; layers stack
// (defense in depth), so step coverage saturates towards 1 as measures are added.
export const CONTROL_CEILING = 0.85;
// A measure only protects to the extent it is actually in place: a planned or
// recommended control counts far less than an implemented one.
export const STATUS_WEIGHT: Record<string, number> = { Implemented: 1, Planned: 0.3, Recommended: 0.15, Missing: 0 };
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
const CAPAB: Range[] = [R(.15, .3, .45), R(.35, .5, .65), R(.55, .7, .82), R(.72, .85, .95)];
// Control strength from scenario difficulty; the kill-chain coverage lifts it a lot
// (well-mitigated chains should clearly out-resist the adversary).
const DIFF_BASE = [.32, .46, .6, .72];                                                     // control from difficulty
const SEV_LOSS: Range[] = [R(5e3, 2e4, 8e4), R(5e4, 2e5, 8e5), R(2e5, 1e6, 4e6), R(1e6, 5e6, 2e7)];
const SEV_CASC_L: Range[] = [R(.1, .2, .35), R(.2, .35, .55), R(.3, .5, .7), R(.45, .65, .85)];
const SEV_CASC: Range[] = [R(2e3, 1e4, 4e4), R(2e4, 1e5, 4e5), R(1e5, 5e5, 2e6), R(5e5, 2.5e6, 1e7)];

/** Kill-chain mitigation coverage of an operational scenario: share of steps
 *  mitigated, weighted by the implementation level of the covering measures. */
export function coverageOf(study: Study, tax: Taxonomy, op: EntityRecord): Coverage {
  const stepType = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "ref" && f.refType) && t.fields.some((f) => f.type === "number"));
  const parentF = stepType?.fields.find((f) => f.type === "ref" && f.refType);
  const measureType = tax.entityTypes.find((t) => t.key !== stepType?.key && t.fields.some((f) => f.type === "multiref" && f.refType === stepType?.key));
  const coversF = measureType?.fields.find((f) => f.type === "multiref" && f.refType === stepType?.key);
  const implF = measureType?.fields.find((f) => f.key === "implementation_level");
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
    const sc = stepCoverage(cov.map((m) => measureEfficacyOf(tax, m)));
    const avgImpl = cov.length ? cov.reduce((a, m) => a + implFrac(m), 0) / cov.length : 0;
    if (cov.length) { mitigated++; implSum += avgImpl; }
    covSum += sc;
    detail.push({ step: s, measures: cov, impl: avgImpl, coverage: sc });
  }
  const total = steps.length;
  const impl = mitigated ? implSum / mitigated : 0;
  const value = total ? covSum / total : 0; // avg defense-in-depth coverage over all steps
  return { mitigated, total, impl, value, steps: detail };
}

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

  const ctlBase = sampleNum(DIFF_BASE, diffR);
  const ctlMode = c01(ctlBase + (withControls ? 0.38 * cov.value : 0));
  const control = R(c01(ctlMode - 0.15), ctlMode, c01(ctlMode + 0.12));

  const inputs: QuantInputs = {
    threatActivity: sampleRange(ACTIVITY, actR),
    attackProbability: sampleRange(PROB_LK, likeR),
    adversaryStrength: sampleRange(CAPAB, capR),
    controlStrength: control,
    directImpact: sampleRange(SEV_LOSS, sevR),
    cascadingLikelihood: sampleRange(SEV_CASC_L, sevR),
    cascadingImpact: sampleRange(SEV_CASC, sevR),
  };
  const rsName = rs ? String(rs.values.name ?? "risk source") : "risk source";
  const prov: Record<keyof QuantInputs, Prov> = {
    threatActivity: { icon: "◆", source: "actor activity", label: scaleFieldLabel(tax, rs, "activity") },
    attackProbability: { icon: "◆", source: "scenario likelihood", label: scaleFieldLabel(tax, op, "likelihood") },
    adversaryStrength: { icon: "⚔", source: rsName, label: scaleFieldLabel(tax, rs, "capability") },
    controlStrength: { icon: "🛡", source: "kill-chain coverage", label: cov.total ? `${cov.mitigated}/${cov.total} · impl ${Math.round(cov.impl * 100)}%` : "no steps" },
    directImpact: { icon: "✎", source: `severity ${scaleFieldLabel(tax, fe, "severity")}`, label: "estimate", estimated: true },
    cascadingLikelihood: { icon: "✎", source: "follow-on", label: "estimate", estimated: true },
    cascadingImpact: { icon: "✎", source: "follow-on", label: "estimate", estimated: true },
  };
  return { inputs, prov, coverage: cov, refs: { op, strategic: strat, riskSource: rs, fearedEvent: fe }, scenario: String(op.values.name ?? "scenario"), riskSource: rsName };
}
