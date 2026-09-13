// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// What each measure buys - and what it would buy once finished - against what it costs.
//
// The break-point distribution says WHERE the money works; this says HOW MUCH each
// measure is worth, in the currency the budget meeting uses: the mean annual loss the
// study would carry without it, minus the loss it carries with it. Two figures per
// measure, because a planned control has two: what it does today (little) and what it
// would do once it is in force (the reason to finish it). Both come from the same engine
// as the headline - the scenario re-simulated with the measure taken out, and with it
// completed - so a measure's worth is the headline's own arithmetic, not a second model.
//
// Costs are the analyst's: a one-off amount spread over the calibration's write-off
// period plus a yearly one. Where they are given, the ranking is by loss avoided per
// euro; where they are not, by loss avoided. Nothing here invents a cost.
import { simulate, type QuantInputs, type Range } from "./montecarlo";
import { chainTypes, deriveInputs, linkedMeasures } from "./quantModel";
import { DEFAULT_CALIBRATION, type Calibration } from "./calibration";
import { getType, isSetBack, scaleMax } from "./taxonomy";
import type { EntityRecord, Study, Taxonomy } from "./types";

export interface MeasureWorth {
  measure: EntityRecord;
  /** Mean annual loss avoided today, summed over the quantified scenarios it touches. */
  avoided: number;
  /** ...and once the measure is implemented and fully rolled out, at its rated strength. */
  avoidedIfComplete: number;
  /** Which quantified scenarios it is attached to, by id. */
  scenarios: string[];
  /** Yearly cost: yearly + one-off / write-off years. Null where neither is given. */
  costPerYear: number | null;
  /** Loss avoided per unit of yearly cost, today and once complete. Null without a cost. */
  perEuro: number | null;
  perEuroIfComplete: number | null;
  /** True when finishing the measure would change nothing - it is already complete. */
  complete: boolean;
}

export interface WorthResult {
  rows: MeasureWorth[];
  /** The headline: mean annual loss over the quantified scenarios as they stand. */
  base: number;
  /** Two seeds on the base, nothing changed: the simulation's own grain. A worth inside
   *  it is not a finding about the measure. */
  noise: number;
  iterations: number;
  horizonYears: number;
}

/** The measures a scenario's chain or assets are attached to - the same reading the
 *  derivation uses (`linkedMeasures`), so a measure ranked here is one that moved the
 *  headline. */
function attached(study: Study, tax: Taxonomy, op: EntityRecord, cal: Calibration): Set<string> {
  const d = deriveInputs(study, tax, op, true, cal);
  return new Set(linkedMeasures(study, tax, d.coverage).map((m) => m.id));
}

/** A study with one measure taken out, or with it completed. The study is data; the
 *  variant is a copy with one record changed, and the derivation reads it like any other. */
function without(study: Study, id: string): Study {
  return { ...study, entities: study.entities.filter((e) => e.id !== id) };
}
function completed(study: Study, tax: Taxonomy, m: EntityRecord): Study {
  const t = getType(tax, m.type);
  const implF = t?.fields.find((f) => f.key === "implementation_level");
  const statusF = t?.fields.find((f) => f.key === "status");
  const values = { ...m.values };
  if (implF) values[implF.key] = scaleMax(implF);
  if (statusF) values[statusF.key] = "Implemented";
  return { ...study, entities: study.entities.map((e) => (e.id === m.id ? { ...m, values } : e)) };
}
export function isComplete(tax: Taxonomy, m: EntityRecord): boolean {
  const t = getType(tax, m.type);
  const implF = t?.fields.find((f) => f.key === "implementation_level");
  const statusF = t?.fields.find((f) => f.key === "status");
  const full = !implF || Number(m.values[implF.key]) >= scaleMax(implF);
  const inForce = !statusF || String(m.values[statusF.key] ?? "") === "Implemented";
  return full && inForce;
}

export function costPerYearOf(m: EntityRecord, horizonYears: number): number | null {
  const once = Number(m.values.cost_once), yearly = Number(m.values.cost_yearly);
  const hasOnce = Number.isFinite(once) && once > 0, hasYearly = Number.isFinite(yearly) && yearly > 0;
  if (!hasOnce && !hasYearly) return null;
  return (hasYearly ? yearly : 0) + (hasOnce ? once / Math.max(1, horizonYears) : 0);
}

/** The worth of every measure attached to the quantified scenarios.
 *
 *  Same seed for every run, so the difference between two runs is the measure and not
 *  the dice; fewer iterations than the headline because it is two runs per measure per
 *  scenario, and the ORDER of the rows is what the reader is after. Overrides the
 *  analyst set on a scenario's factors are honoured, as the headline honours them. */
export function measureWorth(study: Study, tax: Taxonomy, ops: EntityRecord[], cal: Calibration = DEFAULT_CALIBRATION,
  iterations = 12000, seed = 0x9e3779b9): WorthResult {
  const { measureType } = chainTypes(tax);
  const horizon = cal.effect.costHorizonYears ?? 3;
  const run = (st: Study, op: EntityRecord, s = seed) => {
    const d = deriveInputs(st, tax, op, true, cal);
    const ov = st.quant?.[op.id]?.overrides as Partial<Record<keyof QuantInputs, Range>> | undefined;
    const inputs: QuantInputs = { ...d.inputs };
    for (const k of Object.keys(ov ?? {}) as (keyof QuantInputs)[]) {
      const o = ov?.[k]; if (o) inputs[k] = { ...o, ...(d.inputs[k].dist ? { dist: d.inputs[k].dist } : {}) };
    }
    return simulate(inputs, iterations, d.chain, s, cal.time).ale.mean;
  };
  const baseBy = new Map(ops.map((op) => [op.id, run(study, op)]));
  const base = [...baseBy.values()].reduce((a, b) => a + b, 0);
  const noise = Math.abs(ops.reduce((a, op) => a + run(study, op, seed ^ 0x5bd1e995), 0) - base);
  if (!measureType) return { rows: [], base, noise, iterations, horizonYears: horizon };

  const touches = new Map<string, string[]>();
  for (const op of ops) for (const id of attached(study, tax, op, cal)) (touches.get(id) ?? touches.set(id, []).get(id)!).push(op.id);

  const rows: MeasureWorth[] = [];
  for (const m of study.entities) {
    if (m.type !== measureType.key || isSetBack(tax, m)) continue;
    const opIds = touches.get(m.id); if (!opIds?.length) continue;
    let avoided = 0, avoidedIfComplete = 0;
    const complete = isComplete(tax, m);
    for (const opId of opIds) {
      const op = ops.find((o) => o.id === opId)!;
      const b = baseBy.get(opId)!;
      const gone = run(without(study, m.id), op);
      avoided += gone - b;
      // Once complete: the same "without" against the scenario with the measure finished.
      avoidedIfComplete += complete ? gone - b : gone - run(completed(study, tax, m), op);
    }
    const costPerYear = costPerYearOf(m, horizon);
    rows.push({ measure: m, avoided, avoidedIfComplete, scenarios: opIds, costPerYear, complete,
      perEuro: costPerYear ? avoided / costPerYear : null,
      perEuroIfComplete: costPerYear ? avoidedIfComplete / costPerYear : null });
  }
  // Ranked by what finishing them would buy per euro where costs exist, else by what
  // they would buy; a measure that is already complete ranks by what it buys today,
  // which is the same figure.
  rows.sort((a, b) => (b.perEuroIfComplete ?? -1) - (a.perEuroIfComplete ?? -1) || b.avoidedIfComplete - a.avoidedIfComplete);
  return { rows, base, noise, iterations, horizonYears: horizon };
}
