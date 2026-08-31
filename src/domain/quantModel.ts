// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Derive the quantitative-risk factors of an operational scenario from the
// qualitative model already captured (scenario likelihood/difficulty, risk-source
// capability/activity, kill-chain mitigation coverage, feared-event severity).
// Only the loss magnitudes stay as user-estimated distributions. Each factor
// carries its provenance so the tree can show where it comes from.
import type { EntityRecord, Study, Taxonomy } from "./types";
import { tn } from "./i18n";
import { getType, isSetBack, scaleLabel, scaleMax } from "./taxonomy";
import { stepFields } from "./killchain";
import { effectClassOf, type EffectClass } from "./controls";
import { PERT_LAMBDA, type ChainStep, type QuantInputs, type Range } from "./montecarlo";
import { DEFAULT_CALIBRATION, type Calibration } from "./calibration";
import { demandOf, type DemandBreakdown, type DemandStep } from "./demand";
import { attemptsPerYear, RATE_SPREAD, type FrequencyBreakdown, type Pull } from "./frequency";

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
/** Per-measure efficacy on a step: implementation level x lifecycle status x ceiling.
 *  `implementation_level` already carries how far a control is rolled out, so the
 *  status must not discount the same thing twice - it says where the control is in its
 *  lifecycle, not how complete it is. */
export function measureEfficacyOf(tax: Taxonomy, m: EntityRecord, cal: Calibration = DEFAULT_CALIBRATION): number {
  const mt = getType(tax, m.type);
  const implF = mt?.fields.find((f) => f.key === "implementation_level");
  const statusF = mt?.fields.find((f) => f.key === "status");
  const lvl = implF ? sampleNum(cal.effect.levelWeight, scaleRatio(tax, m, implF.key, 1)) : 1;
  const sw = cal.effect.statusWeight[statusF ? String(m.values[statusF.key] ?? "") : ""] ?? 1;
  return c01(lvl) * cal.effect.controlCeiling * sw;
}
/** Defense-in-depth step coverage from the layers' efficacies: 1 - product(1-eff). */
export const stepCoverage = (effs: number[]) => 1 - effs.reduce((p, e) => p * (1 - e), 1);
export interface Coverage { mitigated: number; total: number; impl: number; value: number; steps: StepCov[] }
export interface Refs { op: EntityRecord; strategic?: EntityRecord; riskSource?: EntityRecord; fearedEvent?: EntityRecord }
/** One effect class's contribution to ONE factor. The tree shows the factors and where
 *  they come from; this says which class of measure moved which of them, and by how much.
 *  Without it a reader sees that the bill fell and cannot tell whether that was fewer
 *  attempts, a shorter event or a smaller one - three different pieces of work. */
export interface ChannelTerm {
  cls: EffectClass;
  /** Combined strength of this class's measures, 0..1. */
  strength: number;
  /** What it does to the factor: a multiplier on the range (0.8 = a fifth off) where the
   *  class scales one... */
  factor?: number;
  /** ...or the number of chain steps it acts on, where it works through the traversal
   *  instead. A gate is not a multiplier and must not be shown as one. */
  steps?: number;
  /** Said in the model's own words, not the class name. */
  what: string;
}

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
  /** How the attempt rate was arrived at - one term per factor, so the views can show
   *  the multiplication instead of describing it. */
  frequency: FrequencyBreakdown;
  /** How the bar was arrived at. Absent where the scenario models no chain and the
   *  `difficulty` rating carried on instead. */
  demand?: DemandBreakdown;
  /** Which effect class moved which factor. Empty for the inherent derivation, where by
   *  definition nothing did. */
  channels: Partial<Record<keyof QuantInputs, ChannelTerm[]>>;
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

// Every number the model runs on now lives in `calibration.ts`, where it can be
// inspected, edited, reset and exported. Nothing below invents a figure of its own -
// what remains here is how the figures are COMBINED.
//
// Bands are anchored at levels 1..4 (≈ ratio 0..1) and sampled by sampleRange/sampleNum,
// so a scale of any length feeds in: a classic 1..4 scale hits the anchors exactly, a
// 1..N scale is placed proportionally.

/** Spread either side of a derived bar. Symmetric, so moving the mode moves the whole
 *  distribution rather than skewing it. */
const around = (mode: number, spread: number): Range =>
  R(c01(mode - spread), c01(mode), c01(mode + spread));

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

export function coverageOf(study: Study, tax: Taxonomy, op: EntityRecord, cal: Calibration = DEFAULT_CALIBRATION): Coverage {
  const { stepType, parentF, measureType, coversF, implF } = chainTypes(tax);
  if (!stepType || !parentF || !measureType || !coversF) return { mitigated: 0, total: 0, impl: 0, value: 0, steps: [] };
  // A step out of scope is not walked: the chain is what the study still considers, and a
  // figure that counted a step nobody is analysing any more would answer a question that
  // was withdrawn. Same reading as the measures below - see domain/scope.ts.
  const steps = study.entities.filter((e) => e.type === stepType.key
    && e.values[parentF.key] === op.id && !isSetBack(tax, e));
  // A measure that is present but set back defends nothing - the coverage matrix and the
  // framework radar already read it that way, and a quantification that counted it would
  // answer the same question differently.
  const measures = study.entities.filter((e) => e.type === measureType.key && !isSetBack(tax, e));
  const implMax = implF ? scaleMax(implF) : 4;
  const implFrac = (m: EntityRecord) => (implF ? Number(m.values[implF.key] ?? 1) : implMax) / implMax;
  let mitigated = 0, covSum = 0, implSum = 0;
  const detail: StepCov[] = [];
  for (const s of steps) {
    const cov = measures.filter((m) => Array.isArray(m.values[coversF.key]) && (m.values[coversF.key] as string[]).includes(s.id));
    // Defense in depth: each layer's efficacy (implementation x status), combined so
    // the step is only breached if every layer fails. Saturates as layers are added.
    // Split by what the measures actually DO - a backup on this step is not a barrier.
    const effOf = (cls: EffectClass) => stepCoverage(cov.filter((m) => effectClassOf(m) === cls).map((m) => measureEfficacyOf(tax, m, cal)));
    const sc = stepCoverage(cov.map((m) => measureEfficacyOf(tax, m, cal)));
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
export function chainOf(tax: Taxonomy, cov: Coverage, ctlBase: number, readiness: number, cal: Calibration = DEFAULT_CALIBRATION): ChainStep[] | undefined {
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
    gate: n.sc.prevention > 0 ? around(c01(ctlBase + cal.effect.prevention * n.sc.prevention), cal.demand.spread) : null,
    // Detection buys an interruption, and only as far as somebody responds to it. On the
    // objective itself there is nothing left to interrupt - that value goes to magnitude.
    interrupt: isPred.has(n.sc.step.id) ? c01(cal.effect.detection * n.sc.detection * readiness) : 0,
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

/** The chain as the demand derivation sees it: which step the attempt starts at, what
 *  technique and tactic each step uses, and whether the entry was handed over by a
 *  stakeholder rather than taken. */
function demandStepsOf(study: Study, tax: Taxonomy, cov: Coverage, strat: EntityRecord | undefined): DemandStep[] {
  const { stepType } = chainTypes(tax);
  const sf = stepType ? stepFields(stepType) : null;
  const own = new Set(cov.steps.map((s) => s.step.id));
  const predsOf = (rec: EntityRecord): string[] => {
    const raw = sf ? rec.values[sf.predField.key] : null;
    return Array.isArray(raw) ? (raw as unknown[]).filter((id): id is string => typeof id === "string" && id !== rec.id && own.has(id)) : [];
  };
  // Entry = no prerequisite inside this scenario. Where the chain declares no edges at
  // all (legacy or imported data) the lowest step order stands in.
  const withPreds = cov.steps.map((s) => ({ s, preds: predsOf(s.step) }));
  const anyEdge = withPreds.some((n) => n.preds.length > 0);
  const orderKey = sf?.orderField.key;
  const ordered = orderKey
    ? [...withPreds].sort((a, b) => Number(a.s.step.values[orderKey] ?? 0) - Number(b.s.step.values[orderKey] ?? 0))
    : withPreds;
  const entryIds = new Set(anyEdge
    ? withPreds.filter((n) => !n.preds.length).map((n) => n.s.step.id)
    : ordered.slice(0, 1).map((n) => n.s.step.id));

  // Access the organisation itself handed over: the scenario's stakeholder grants
  // access to the very asset the entry step goes after.
  const sh = refOne(study, strat, "stakeholder");
  const granted = new Set<string>();
  const provides = sh?.values.provides_access_to;
  if (Array.isArray(provides)) for (const id of provides as unknown[]) if (typeof id === "string") granted.add(id);

  return cov.steps.map((s) => ({
    technique: s.step.values.technique,
    tactic: s.step.values.tactic,
    entry: entryIds.has(s.step.id),
    granted: entryIds.has(s.step.id) && typeof s.step.values.targets_asset === "string"
      && granted.has(s.step.values.targets_asset as string),
  }));
}

/** Why this organisation, as far as the declared objectives can tell. */
function pullOf(study: Study, rs: EntityRecord | undefined, fe: EntityRecord | undefined): Pull {
  if (!rs) return "none";
  const objectives = study.entities.filter((e) => e.values.risk_origin === rs.id && Array.isArray(e.values.aims_at));
  if (!objectives.length) return "none";
  const target = fe?.values.business_asset;
  if (typeof target !== "string") return "noMatch";
  return objectives.some((o) => (o.values.aims_at as unknown[]).includes(target)) ? "declared" : "noMatch";
}

/** Derive all Monte-Carlo inputs for one operational scenario. `withControls`
 *  toggles inherent (false) vs residual (true, the modelled measures are counted). */
export function deriveInputs(study: Study, tax: Taxonomy, op: EntityRecord, withControls = true, cal: Calibration = DEFAULT_CALIBRATION): Derived {
  const opT = getType(tax, op.type);
  // op -> strategic -> risk source / feared event
  const stratF = opT?.fields.find((f) => f.type === "ref" && f.refType);
  const strat = refOne(study, op, stratF?.key ?? "strategic_scenario");
  const rs = refOne(study, strat, "risk_origin");
  const fe = refOne(study, strat, "feared_event");

  const diffR = scaleRatio(tax, op, "difficulty");
  const capR = scaleRatio(tax, rs, "capability"), sevR = scaleRatio(tax, fe, "severity");
  const cov = coverageOf(study, tax, op, cal);

  // Each effect class acts on its own factor. Deterrence and avoidance work at the front
  // of the chain (fewer attempts, less contact), recovery at the back (a smaller bill).
  // Nothing here applies to the inherent derivation - "no controls" has to mean none.
  const linked = withControls ? linkedMeasures(study, tax, cov) : [];
  const classEff = (cls: EffectClass) =>
    stepCoverage(linked.filter((m) => effectClassOf(m) === cls).map((m) => measureEfficacyOf(tax, m, cal)));
  const deter = classEff("Deterrent"), avoid = classEff("Avoidance"), corr = classEff("Corrective");
  // Detection is worth what the response makes of it.
  const readiness = cal.effect.responseFloor + (1 - cal.effect.responseFloor) * corr;

  // How often the scenario is attempted. ONE derived quantity - the old split into
  // contact frequency and probability of action was not identifiable from real data,
  // and its second half echoed the analyst's own likelihood conclusion back at them.
  const dSteps = demandStepsOf(study, tax, cov, strat);
  const freq = attemptsPerYear({
    actor: String(rs?.values.category ?? ""),
    sector: study.sector ?? "",
    activity: scaleRatio(tax, rs, "activity"),
    resources: scaleRatio(tax, rs, "resources"),
    relevance: scaleRatio(tax, rs, "relevance"),
    pull: pullOf(study, rs, fe),
    entryTechnique: dSteps.find((s) => s.entry)?.technique,
  }, cal.frequency);
  const rate = R(freq.total / RATE_SPREAD, freq.total, freq.total * RATE_SPREAD);

  // What an attempt is up against, before any measure. Derived from the chain the
  // analyst already modelled; the `difficulty` rating only carries on where there is no
  // chain to derive from. The measures are the OTHER side of the comparison - they sit
  // on the individual steps, where the attacker meets them one at a time.
  const demand = cov.steps.length ? demandOf(dSteps, cal.demand) : undefined;
  const ctlBase = demand ? demand.total : sampleNum(cal.demand.difficultyFallback, diffR);
  const control = around(ctlBase, cal.demand.spread);
  const chain = withControls ? chainOf(tax, cov, ctlBase, readiness, cal) : undefined;
  const gated = chain?.filter((s) => s.gate).length ?? 0;
  const watched = chain?.filter((s) => s.interrupt > 0).length ?? 0;
  // Detection sitting ON the objective cannot prevent anything - it shortens the event.
  const termDet = stepCoverage((chain ?? []).filter((s) => s.terminal)
    .map((s) => cov.steps.find((c) => c.step.id === s.id)?.detection ?? 0));

  const cut = (r: Range, f: number) => (withControls ? scaleRange(r, c01(f)) : r);
  // Deterrence and avoidance now act on the same factor - both mean fewer attempts -
  // but they remain distinct in strength and in what they say: avoidance removes the
  // exposure, deterrence discourages the actor who still has it in reach.
  const fewer = (1 - cal.effect.avoidance * avoid) * (1 - cal.effect.deterrence * deter);
  const inputs: QuantInputs = {
    attemptRate: cut(rate, fewer),
    adversaryStrength: sampleRange(cal.adversary.capability, capR),
    controlStrength: control,
    directImpact: cut(sampleRange(cal.magnitude.loss, sevR), (1 - cal.effect.recoverableShare * corr) * (1 - cal.effect.lateDetection * termDet)),
    cascadingLikelihood: cut(sampleRange(cal.magnitude.cascadeLikelihood, sevR), 1 - cal.effect.containment * corr),
    cascadingImpact: sampleRange(cal.magnitude.cascadeLoss, sevR),
  };
  const rsName = rs ? String(rs.values.name ?? "risk source") : "risk source";
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const actorLabel = String(rs?.values.category ?? "") || "unclassified actor";
  const pullWord = freq.pull >= cal.frequency.targetPull.declared ? "declared target"
    : freq.pull <= cal.frequency.targetPull.noMatch ? "no declared interest" : "no objectives modelled";
  const prov: Record<keyof QuantInputs, Prov> = {
    attemptRate: { icon: avoid > 0 || deter > 0 ? "🛡" : "◆",
      source: avoid > 0 || deter > 0 ? `${actorLabel} - fewer attempts` : actorLabel,
      label: avoid > 0 || deter > 0
        ? `${pullWord} · attempts cut ${pct(1 - fewer)}`
        : `${pullWord} · base ${freq.base.toPrecision(2)}/yr` },
    adversaryStrength: { icon: "⚔", source: rsName, label: scaleFieldLabel(tax, rs, "capability") },
    controlStrength: { icon: "🛡", source: demand ? "chain demand + measures" : "scenario difficulty",
      label: demand
        ? `${demand.tactics} tactics · ${gated}/${chain?.length ?? cov.steps.length} gated${watched ? `, ${watched} watched` : ""}`
        : scaleFieldLabel(tax, op, "difficulty") },
    directImpact: corr > 0 || termDet > 0
      ? { icon: "🛡", source: "recovery & containment", label: `severity ${scaleFieldLabel(tax, fe, "severity")} · loss cut ${pct(1 - (1 - cal.effect.recoverableShare * corr) * (1 - cal.effect.lateDetection * termDet))}` }
      : { icon: "✎", source: `severity ${scaleFieldLabel(tax, fe, "severity")}`, label: "estimate", estimated: true },
    cascadingLikelihood: corr > 0
      ? { icon: "🛡", source: "containment", label: `follow-on cut ${pct(cal.effect.containment * corr)}` }
      : { icon: "✎", source: "follow-on", label: "estimate", estimated: true },
    cascadingImpact: { icon: "✎", source: "follow-on", label: "estimate", estimated: true },
  };
  // Which class moved which factor. Built from the SAME terms the inputs above were built
  // from - not recomputed here, or the tree and the numbers could drift apart, which is
  // precisely the failure the tree exists to prevent.
  const channels: Partial<Record<keyof QuantInputs, ChannelTerm[]>> = {};
  if (withControls) {
    const put = (k: keyof QuantInputs, t: ChannelTerm) => {
      if (t.strength <= 0 && !t.steps) return;
      (channels[k] ??= []).push(t);
    };
    put("attemptRate", { cls: "Avoidance", strength: avoid, factor: 1 - cal.effect.avoidance * avoid,
      what: "the exposure is removed, so contact is rarer" });
    put("attemptRate", { cls: "Deterrent", strength: deter, factor: 1 - cal.effect.deterrence * deter,
      what: "the actor who still has it in reach is discouraged" });
    put("controlStrength", { cls: "Preventive", strength: classEff("Preventive"), steps: gated,
      what: gated ? `${tn("quant.gatedSteps", gated, "{0} step", "{0} steps")} an attacker has to get past` : "measures recorded, but none of them blocks a step" });
    put("controlStrength", { cls: "Detective", strength: classEff("Detective"), steps: watched,
      what: watched ? `${tn("quant.watchedSteps", watched, "{0} step", "{0} steps")} where he can be caught and the chain broken` : "measures recorded, but no step is watched" });
    put("directImpact", { cls: "Corrective", strength: corr, factor: 1 - cal.effect.recoverableShare * corr,
      what: "part of the loss is recovered rather than borne" });
    put("directImpact", { cls: "Detective", strength: termDet, factor: 1 - cal.effect.lateDetection * termDet,
      what: "caught at the objective: too late to stop, early enough to shorten" });
    put("cascadingLikelihood", { cls: "Corrective", strength: corr, factor: 1 - cal.effect.containment * corr,
      what: "containment keeps the follow-on damage from spreading" });
  }
  return { inputs, chain, prov, coverage: cov, refs: { op, strategic: strat, riskSource: rs, fearedEvent: fe },
    scenario: String(op.values.name ?? "scenario"), riskSource: rsName, frequency: freq, demand, channels };
}
