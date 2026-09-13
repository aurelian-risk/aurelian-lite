// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Which assumption carries the number?
//
// The factor tree shows how the annual loss was derived; it does not show how much each
// factor MOVES it. Four defensible judgements can multiply into a surprising answer
// (method.md §12, "ratios compound"), and the reader cannot see which of the four it was.
// This runs the same simulation with one factor at a time pinned to the ends of its own
// band - the low end, then the high end, everything else at its derived value - and
// reports the swing in the mean annual loss. Sorted by swing, that is a tornado: the
// factors the answer hangs on at the top, the noise at the bottom.
//
// The bands are the model's own three-point estimates, so the question this answers is
// "within what the study already says is plausible, what matters" - not "what if the
// world were different". Nothing here is a second model: the same engine, the same
// chain, the same seed for every run.
import { simulate, type ChainStep, type Pace, type QuantInputs, type Range } from "./montecarlo";

export interface Swing {
  /** Which factor: an input key, or `step:<id>` for one gate on the chain. */
  key: string;
  /** Mean annual loss with the factor pinned at the low end of its band, and at the high. */
  low: number;
  high: number;
  /** The band that was walked. */
  band: { min: number; max: number };
  /** |high − low|. The sort key. */
  swing: number;
  /** True when a HIGHER factor value gives a LOWER loss - a control-side factor. The bar
   *  is drawn the same way; the reading is the opposite. */
  inverse: boolean;
}

export interface Sensitivity {
  /** The mean annual loss with nothing pinned - the bar the swings are measured against. */
  base: number;
  swings: Swing[];
  /** How far two runs with different seeds and nothing pinned disagree. A swing below
   *  this is not a finding about the factor; it is the simulation's own grain. */
  noise: number;
  iterations: number;
}

/** Pinned to one value: a zero-width band. `pert` returns `min` for one, so the draw
 *  costs nothing and cannot wander. */
const at = (v: number): Range => ({ min: v, mode: v, max: v });

const INPUT_KEYS: (keyof QuantInputs)[] = [
  "attemptRate", "adversaryStrength", "controlStrength", "directImpact", "cascadingLikelihood", "cascadingImpact", "respondDays",
];

/** The tornado for one scenario.
 *
 *  Fewer iterations than the headline run: this is 2 runs per factor plus the base and
 *  its noise twin, so with six inputs and half a dozen gates it is thirty runs, and the
 *  ordering of swings is stable long before the fourth digit of any of them is. The
 *  noise figure says how stable. */
export function sensitivityOf(inputs: QuantInputs, chain: ChainStep[] | undefined, iterations = 12000,
  seed = 0x9e3779b9, pace?: Pace): Sensitivity {
  const run = (inp: QuantInputs, ch: ChainStep[] | undefined, s = seed) => simulate(inp, iterations, ch, s, pace).ale.mean;
  const base = run(inputs, chain);
  const noise = Math.abs(run(inputs, chain, seed ^ 0x5bd1e995) - base);
  const swings: Swing[] = [];

  for (const k of INPUT_KEYS) {
    const r = inputs[k];
    if (!r || !(r.max > r.min)) continue;              // a point estimate has no band to walk
    const low = run({ ...inputs, [k]: at(r.min) }, chain);
    const high = run({ ...inputs, [k]: at(r.max) }, chain);
    swings.push({ key: k, low, high, band: { min: r.min, max: r.max }, swing: Math.abs(high - low), inverse: high < low });
  }
  for (const [i, st] of (chain ?? []).entries()) {
    if (!st.gate || !(st.gate.max > st.gate.min)) continue;
    const pin = (v: number) => chain!.map((s, j) => (j === i ? { ...s, gate: at(v) } : s));
    const low = run(inputs, pin(st.gate.min));
    const high = run(inputs, pin(st.gate.max));
    swings.push({ key: `step:${st.id}`, low, high, band: { min: st.gate.min, max: st.gate.max },
      swing: Math.abs(high - low), inverse: high < low });
  }
  swings.sort((a, b) => b.swing - a.swing);
  return { base, swings, noise, iterations };
}

/** The factors the number hangs on: a swing that is at least a third of the largest
 *  one, and clear of the simulation's own noise by a margin. Measured against the top
 *  because "carries the number" is a relative claim - on a scenario where every band
 *  is wide, every factor clears the noise and naming all nine says nothing. Three times
 *  the noise, because one seed pair is a weak estimate of the grain. */
export const CARRY_SHARE = 1 / 3;
export function carriers(s: Sensitivity): Swing[] {
  const top = s.swings[0]?.swing ?? 0;
  return s.swings.filter((w) => w.swing > 3 * s.noise && w.swing >= CARRY_SHARE * top);
}
