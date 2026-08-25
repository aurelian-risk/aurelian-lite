// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// How often an operational scenario is attempted at all - see docs/frequency-model.md.
//
// This replaces the pair "contact frequency x probability of action" with ONE derived
// quantity: attempts per year. The two were not separable with real data - the split is
// only identifiable for exposure-driven attacks, and everywhere else one of the two
// factors is structurally 1, which is invented precision. Worse, the second factor was
// read from the analyst's `likelihood` rating, a holistic judgement that already
// absorbs the actor, the effort and the controls in place - so the model was partly
// echoing its own conclusion back.
//
// The shape below is deliberate: ALL the empirical burden sits in the base rate.
// Everything else is a ratio, and every ratio answers a question an analyst can defend.
import type { FrequencyCalibration } from "./calibration";
import { baseRateOf, knownSector, sampleBand, techniqueId } from "./calibration";

/** Why this organisation - as far as the model can tell from the objectives. */
export type Pull =
  /** The chain ends at a business asset this actor declared an objective on. */
  | "declared"
  /** The actor declared objectives, and none of them match this chain. */
  | "noMatch"
  /** No objectives modelled - the `relevance` rating stands in. */
  | "none";

export interface FrequencyFacts {
  /** `risk_origin.category` - selects the base rate. */
  actor: string;
  /** The study's sector - selects the base-rate exception, if any. */
  sector: string;
  /** Ratios 0..1 of the respective ratings, so any scale length feeds in. */
  activity: number;
  resources: number;
  relevance: number;
  pull: Pull;
  /** Free-text technique of the chain's entry step. */
  entryTechnique?: unknown;
}

export interface FrequencyBreakdown {
  base: number;
  tempo: number;
  throughput: number;
  pull: number;
  reachability: number;
  /** Attempts per year, before any deterrent or avoidance measure. */
  total: number;
  /** True when the cap bit - a stack of multipliers reached a rate no single scenario
   *  plausibly sees. Worth surfacing rather than hiding: it means the inputs disagree
   *  with the model's own sense of scale. */
  capped: boolean;
  /** What the study's sector did to the base rate. `unknown` is the one that matters: the
   *  sector is matched by string, so a value the calibration has never heard of changes
   *  nothing at all - and used to do so without a word. */
  sector: { name: string; known: boolean; factor: number };
}

export function attemptsPerYear(f: FrequencyFacts, cal: FrequencyCalibration): FrequencyBreakdown {
  const base = baseRateOf(cal, f.actor, f.sector);
  const plain = cal.baseRate[f.actor] ?? cal.baseRateDefault;
  const sector = { name: f.sector, known: knownSector(cal, f.sector), factor: plain > 0 ? base / plain : 1 };
  const tempo = sampleBand(cal.tempo, f.activity);
  const throughput = sampleBand(cal.throughput, f.resources);
  const pull = f.pull === "declared" ? cal.targetPull.declared
    : f.pull === "noMatch" ? cal.targetPull.noMatch
      : sampleBand(cal.targetPull.byRelevance, f.relevance);
  const id = techniqueId(f.entryTechnique);
  const reachability = id != null && id in cal.reachability ? cal.reachability[id] : cal.reachabilityDefault;

  const raw = base * tempo * throughput * pull * reachability;
  const total = Math.min(cal.cap, raw);
  return { base, tempo, throughput, pull, reachability, total, capped: raw > cal.cap, sector };
}

/** The band the simulation draws from. A base rate is an order-of-magnitude setting,
 *  not a measurement, so the band is a factor either side of it rather than a narrow
 *  interval - pretending to know an attempt rate to two digits would be the same
 *  mistake the old two-factor split made. */
export const RATE_SPREAD = 2;

/** Map a computed loss-event frequency back onto the likelihood scale, and say whether
 *  it agrees with what the analyst rated.
 *
 *  This is the inverse of what the model used to do. Reading `likelihood` as an input
 *  was circular - it is a holistic judgement that already absorbs the actor, the effort
 *  and the controls, so the model partly echoed back the conclusion it was meant to
 *  test. Computing the frequency without it and comparing afterwards turns the same
 *  relationship into a check, and a disagreement is informative in both directions:
 *  either the rating is out, or the model is missing something the analyst can see.
 *
 *  `levels` is the length of the study's likelihood scale, so a 1..N scale works too.
 *  A gap of one level is normal and is not reported - the bands are coarse. */
export interface LikelihoodCheck {
  /** 1-based level the computed frequency corresponds to. */
  modelLevel: number;
  /** 1-based level the analyst rated, or null where nothing was rated. */
  ratedLevel: number | null;
  /** True where the two are more than one level apart. */
  diverges: boolean;
}

export function likelihoodCheck(lef: number, rated: number | null, cal: FrequencyCalibration, levels = 4): LikelihoodCheck {
  const bounds = cal.likelihoodBands;
  let level = 1;
  for (const b of bounds) if (lef > b) level++;
  const modelLevel = Math.min(levels, level);
  const ratedLevel = rated != null && Number.isFinite(rated) ? rated : null;
  return { modelLevel, ratedLevel, diverges: ratedLevel != null && Math.abs(modelLevel - ratedLevel) > 1 };
}
