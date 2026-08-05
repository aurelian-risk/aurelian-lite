// Derive the residual risk position (likelihood × gravity) of a treated risk from the
// treatment DECISION plus what the measures actually achieve - never a manual number, so
// the matrix cannot drift away from the rest of the study.
//
// The effect is read from the SAME model the quantification runs: the kill chain is
// traversed with and without the controls, and the two runs are compared. That matters,
// because the two used to disagree. The old version averaged every measure on the chain
// into one "coverage" figure and moved the risk down by it - so a scenario defended
// purely by monitoring, or by backups, looked reduced in the matrix while the
// quantification of the same scenario said most attempts still reach their objective.
//
// Reading the effect from the simulation also splits it correctly across the two axes:
//   likelihood <- how far the controls cut the loss-event FREQUENCY (deterrence,
//                 avoidance, resistance and interruption all land here)
//   gravity    <- how far they cut the loss MAGNITUDE (recovery and containment)
// so a treatment that only buys recovery moves the risk DOWN, not left - which is
// exactly what recovery does.
//
// Decisions:
//   Reduce -> both axes move by what the measures achieve on each
//   Share  -> impact is transferred (e.g. insurance): gravity drops, by at least a level
//   Accept -> residual = inherent
//   Avoid  -> risk eliminated (minimum)
//
// The mitigating measures are NOT re-listed on the treatment: they already attach to the
// risk THROUGH the kill chain (measure covers step -> step in operational scenario ->
// implements the strategic scenario).
import type { EntityRecord, Study, Taxonomy } from "./types";
import { scaleMax } from "./taxonomy";
import { deriveInputs, meanOf } from "./quantModel";
import { simulate, type QuantInputs } from "./montecarlo";

/** Iterations for the matrix. Far fewer than the quantification view needs: the matrix
 *  only has to place a chip on a small grid, not draw a loss curve, and it recomputes for
 *  every risk on every render. Seeded, so a chip never jitters between renders. */
const MATRIX_ITER = 4000;

export interface TreatmentEffect {
  /** 0..1 - share of the loss-event frequency the measures remove. */
  frequency: number;
  /** 0..1 - share of the loss magnitude the measures remove. */
  magnitude: number;
}

const rel = (inherent: number, residual: number) =>
  (inherent > 0 ? Math.max(0, Math.min(1, 1 - residual / inherent)) : 0);
const magnitudeOf = (i: QuantInputs) => meanOf(i.directImpact) + meanOf(i.cascadingLikelihood) * meanOf(i.cascadingImpact);

/** What the measures on this risk's kill chain(s) actually achieve, per axis. Averaged
 *  over the operational scenarios that implement this strategic scenario. */
export function treatmentEffect(study: Study, tax: Taxonomy, scenario: EntityRecord): TreatmentEffect {
  const opType = tax.entityTypes.find((t) => t.fields.some((f) => f.key === "difficulty")
    && t.fields.some((f) => f.type === "ref" && f.refType === scenario.type));
  const refF = opType?.fields.find((f) => f.type === "ref" && f.refType === scenario.type);
  if (!opType || !refF) return { frequency: 0, magnitude: 0 };
  const ops = study.entities.filter((e) => e.type === opType.key && e.values[refF.key] === scenario.id);
  if (!ops.length) return { frequency: 0, magnitude: 0 };

  let freq = 0, mag = 0;
  for (const op of ops) {
    const on = deriveInputs(study, tax, op, true), off = deriveInputs(study, tax, op, false);
    freq += rel(simulate(off.inputs, MATRIX_ITER, off.chain).lef, simulate(on.inputs, MATRIX_ITER, on.chain).lef);
    mag += rel(magnitudeOf(off.inputs), magnitudeOf(on.inputs));
  }
  return { frequency: freq / ops.length, magnitude: mag / ops.length };
}

/** How well the risk is mitigated overall (0..1) - the frequency effect, for callers that
 *  do not care which axis it lands on. */
export function treatmentEffectiveness(study: Study, tax: Taxonomy, scenario: EntityRecord): number {
  return treatmentEffect(study, tax, scenario).frequency;
}

export function residualPos(
  study: Study, tax: Taxonomy, scenario: EntityRecord, treatment: EntityRecord,
  xKey: string, yKey: string,
): { x: number; y: number } {
  const inhX = Number(scenario.values[xKey]) || 1;  // likelihood
  const inhY = Number(scenario.values[yKey]) || 1;  // gravity
  const decision = String(treatment.values.decision ?? "Reduce");
  if (decision === "Accept") return { x: inhX, y: inhY };
  if (decision === "Avoid") return { x: 1, y: 1 };

  // Scale-aware: an effect of 1 means "all the way down", whatever the scale's length -
  // the old fixed factor of 2 silently assumed a 1..4 scale.
  const t = tax.entityTypes.find((e) => e.key === scenario.type);
  const span = (key: string) => Math.max(1, (t?.fields.find((x) => x.key === key) ? scaleMax(t.fields.find((x) => x.key === key)!) : 4) - 1);
  const eff = treatmentEffect(study, tax, scenario);
  const down = (v: number, share: number, key: string) => Math.max(1, v - Math.round(share * span(key)));

  // Transfer moves the impact off the balance sheet on top of whatever recovery achieves,
  // and always by at least one level - that is what buying the transfer is for.
  if (decision === "Share") return { x: inhX, y: Math.min(down(inhY, eff.magnitude, yKey), Math.max(1, inhY - 1)) };
  return { x: down(inhX, eff.frequency, xKey), y: down(inhY, eff.magnitude, yKey) };   // Reduce
}
