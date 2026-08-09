// What an attempt on this scenario is intrinsically up against, derived from the kill
// chain the analyst already modelled - see docs/resistance-model.md.
//
// This replaces the single `difficulty` note as the baseline the attacker has to beat.
// The point of the change is separation: how demanding an operation is, is a property
// of the ATTACK and belongs next to the attacker's capability; the modelled measures
// are the other side of the comparison and are added on top, per step, by the chain
// traversal. Rating difficulty by hand mixed the two, and counted the measures twice.
//
// DECOMPOSITION INVARIANCE shapes every term below: splitting one step into two
// describes the same attack in more detail and must not move the number. That rules out
// sums over steps, step counts and averages - hence a MAXIMUM for tooling and DISTINCT
// tactics for depth, both unchanged when a step is split.
import type { DemandCalibration } from "./calibration";
import { techniqueId } from "./calibration";

export interface DemandStep {
  technique?: unknown;
  tactic?: unknown;
  /** True for the step the attempt starts at (no predecessors inside this scenario). */
  entry?: boolean;
  /** True where a stakeholder grants access to the asset this entry step targets. */
  granted?: boolean;
}

export interface DemandBreakdown {
  /** What it takes to get the first foothold, after any granted-access discount. */
  entry: number;
  /** 0 commodity | 0.5 practitioner | 1 bespoke - the maximum over the chain. */
  tooling: number;
  /** Distinct tactics the chain spans. */
  tactics: number;
  /** Depth contribution before its weight, 0..1. */
  depth: number;
  /** Dwell contribution before its weight, 0..1. */
  dwell: number;
  /** The same three terms AFTER their weights - what each actually adds to the bar.
   *  Kept here so the views can show the addition without re-applying the weights
   *  themselves, which would put the same constants in two places. */
  adds: { tooling: number; depth: number; dwell: number };
  /** The bar an attempt has to clear before any measure is counted, 0..1. */
  total: number;
  /** Which of the four terms could not be read from the model. Drives the honest
   *  wording in the views: a demand derived from half a chain says so. */
  unknown: { entry: boolean; tooling: number };
}

const c01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Entry cost of the step the attempt starts at: technique, else tactic, else default. */
function entryCost(s: DemandStep | undefined, cal: DemandCalibration): { value: number; known: boolean } {
  if (!s) return { value: cal.entryDefault, known: false };
  const id = techniqueId(s.technique);
  if (id && id in cal.entry) return { value: cal.entry[id], known: true };
  const t = str(s.tactic);
  if (t && t in cal.entryByTactic) return { value: cal.entryByTactic[t], known: true };
  return { value: cal.entryDefault, known: false };
}

/** Tooling maturity of one step. An unrecognised technique with no tactic either
 *  contributes NOTHING rather than a guess - inventing a value here would quietly
 *  raise the demand of every under-modelled chain. The `step-no-tactic` check is what
 *  asks the analyst to fill the gap. */
function toolingOf(s: DemandStep, cal: DemandCalibration): { value: number; known: boolean } {
  const id = techniqueId(s.technique);
  if (id && id in cal.tooling) return { value: cal.tooling[id], known: true };
  const t = str(s.tactic);
  if (t && t in cal.toolingByTactic) return { value: cal.toolingByTactic[t], known: true };
  return { value: 0, known: false };
}

/** The demand of a chain. Order does not matter; only the entry flag does. */
export function demandOf(steps: DemandStep[], cal: DemandCalibration): DemandBreakdown {
  if (!steps.length) {
    return { entry: cal.entryDefault, tooling: 0, tactics: 0, depth: 0, dwell: 0,
      adds: { tooling: 0, depth: 0, dwell: 0 },
      total: Math.max(cal.floor, cal.entryDefault), unknown: { entry: true, tooling: 0 } };
  }

  const start = steps.find((s) => s.entry) ?? steps[0];
  const ec = entryCost(start, cal);
  const entry = Math.max(0, ec.value - (start?.granted ? cal.grantedAccess : 0));

  // Maximum, not sum or average: the hardest thing you must be able to do is what
  // gates you, and splitting a step leaves a maximum untouched.
  let tooling = 0, unknownTooling = 0;
  for (const s of steps) {
    const t = toolingOf(s, cal);
    if (!t.known) unknownTooling++;
    if (t.value > tooling) tooling = t.value;
  }

  const tacticSet = new Set(steps.map((s) => str(s.tactic)).filter(Boolean));
  const span = Math.max(1, cal.depthSaturates - 1);
  const depth = c01((tacticSet.size - 1) / span);

  const dwellHit = [...tacticSet].filter((t) => cal.dwellTactics.includes(t)).length;
  const dwell = c01(dwellHit / Math.max(1, cal.dwellSaturates));

  const adds = { tooling: cal.wTooling * tooling, depth: cal.wDepth * depth, dwell: cal.wDwell * dwell };
  const total = c01(Math.max(cal.floor, entry + adds.tooling + adds.depth + adds.dwell));

  return { entry, tooling, tactics: tacticSet.size, depth, dwell, adds, total,
    unknown: { entry: !ec.known, tooling: unknownTooling } };
}
