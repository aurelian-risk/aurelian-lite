// Derive the residual risk position (likelihood × gravity) of a treated risk from
// the treatment DECISION plus how well the risk is already mitigated - never a
// manual number, so it stays consistent with the rest of the study:
//   Reduce  -> likelihood drops with the kill-chain coverage; gravity unchanged
//              (preventive/detective controls lower the chance, not the impact)
//   Share   -> gravity drops (impact transferred, e.g. insurance); likelihood same
//   Accept  -> residual = inherent
//   Avoid   -> risk eliminated (minimum)
//
// Crucially, the mitigating measures are NOT re-listed on the treatment: they
// already attach to the risk THROUGH the kill chain (measure covers step -> step in
// operational scenario -> implements the strategic scenario). We read that coverage
// directly - the same coverageOf() the quantification uses.
import type { EntityRecord, Study, Taxonomy } from "./types";
import { coverageOf } from "./quantModel";

/** How well the risk's kill chain is mitigated (0..1): the average coverage of the
 *  operational scenarios that implement this strategic scenario. */
export function treatmentEffectiveness(study: Study, tax: Taxonomy, scenario: EntityRecord): number {
  const opType = tax.entityTypes.find((t) => t.fields.some((f) => f.key === "difficulty")
    && t.fields.some((f) => f.type === "ref" && f.refType === scenario.type));
  const refF = opType?.fields.find((f) => f.type === "ref" && f.refType === scenario.type);
  if (!opType || !refF) return 0;
  const ops = study.entities.filter((e) => e.type === opType.key && e.values[refF.key] === scenario.id);
  if (!ops.length) return 0;
  const covs = ops.map((op) => coverageOf(study, tax, op).value);
  return covs.reduce((a, b) => a + b, 0) / covs.length;
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
  const eff = treatmentEffectiveness(study, tax, scenario);
  if (decision === "Share") return { x: inhX, y: Math.max(1, inhY - (1 + Math.round(eff))) };
  return { x: Math.max(1, inhX - Math.round(eff * 2)), y: inhY };   // Reduce
}
