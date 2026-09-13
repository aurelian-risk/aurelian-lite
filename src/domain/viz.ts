// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Shared helpers for the analytical SVG/CSS charts (deterministic, offline).
// Colours reuse the app's semantic tokens so light/dark themes both work.

/** Point on a circle. deg 0 = 12 o'clock, clockwise. */
export const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => {
  const a = (deg - 90) * Math.PI / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};

/** SVG arc path from angle a0 to a1 (degrees, clockwise). */
export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1);
  const large = (a1 - a0) % 360 > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

// ── ONE set of bands ────────────────────────────────────────────────────────
//
// Every quantitative colour in the app and in the report classifies here. Five copies of
// this idea had grown up side by side, each with its own edges: quarters in the scale
// badges, thirds in the coverage ramp, .3/.6 in the per-step figure, .3/.55/.8 with a
// BLUE second band in the risk matrix, and a binary green/amber in the coverage matrix.
// They were not reconcilable by reading - the same 57% was three colours on one screen.
//
// The edges are quarters because a four-point scale must land one value in each band:
// (v-1)/(max-1) gives 0, 1/3, 2/3, 1. Read on GOODNESS - 1 is good - and `badColor`
// mirrors it for severity, so the direction is stated at the call site rather than
// guessed from the name of the quantity.
//
// The one deliberate exception is `heatColor` below: where a figure is read as a
// percentage across a whole range (the tactic tiles), a continuous ramp says more than
// four steps. Nothing else may invent its own edges.
export type Band = "good" | "fair" | "poor" | "bad";
export const BAND_EDGES = [0.25, 0.5, 0.75] as const;

/** Which band a 0..1 GOODNESS ratio falls in. */
export function band(good: number): Band {
  return good >= 0.75 ? "good" : good >= 0.5 ? "fair" : good >= 0.25 ? "poor" : "bad";
}

/** The app's token for each band. The report carries its own palette (it ships without
 *  the stylesheet) and classifies with the same `band`. */
export const BAND_TOKEN: Record<Band, string> = {
  good: "var(--color-state-success)",
  fair: "var(--color-state-warning)",
  poor: "color-mix(in oklch, var(--color-state-warning) 45%, var(--color-state-error))",
  bad: "var(--color-state-error)",
};

/** "Goodness" ramp: 1 = good (green) → 0 = bad (red). For coverage / defence / fulfilment. */
export const goodColor = (r: number): string => BAND_TOKEN[band(r)];

/** "Severity" ramp: 0 = low (green) → 1 = high (red). For criticality / exposure / risk. */
export const badColor = (r: number): string => BAND_TOKEN[band(1 - r)];

/** A scale value on the same bands. `positive` says a HIGH value is good (implementation,
 *  resistance); the default reads the scale as severity. The ratio is (v-1)/(max-1), so
 *  the bottom of a scale is 0 however long the scale is - dividing by the top instead
 *  made the colour of level 1 depend on the scale's length, which is the artefact
 *  `levelWeight` was written to remove from the arithmetic. */
export const scaleColor = (value: number, max: number, positive = false): string => {
  const r = (value - 1) / Math.max(1, max - 1);
  return positive ? goodColor(r) : badColor(r);
};

/** Continuous good→bad heat colour: sweeps the oklch hue from red (0) through
 *  orange/amber to green (1), so the whole 0..100% range is distinguishable -
 *  not just four discrete bands. `alpha` for a translucent fill. */
export function heatColor(r: number, alpha = 1): string {
  const R = Math.max(0, Math.min(1, r));
  const L = 0.68 + 0.04 * R, C = 0.185 - 0.045 * R, H = 22 + 138 * R; // 22 (red) → 160 (green)
  return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${H.toFixed(1)}${alpha < 1 ? ` / ${alpha}` : ""})`;
}

/** Lifecycle status colour. Blue = Planned (a distinct, forward-looking state). */
export function statusColor(s: string): string {
  return s === "Implemented" ? "var(--color-state-success)"
    : s === "Planned" ? "var(--color-state-info)"
    : s === "Recommended" ? "var(--color-state-warning)"
    : "var(--color-state-error)";
}

/** Categorical palette for overlaid series (radar polygons, etc.). */
export const SERIES_PALETTE = [
  "var(--teal-bright)", "var(--violet)", "var(--color-state-warning)",
  "var(--color-state-error)", "var(--color-state-info)", "var(--color-state-success)",
  "var(--color-workshop-3)", "var(--color-workshop-2)",
];

/** Regular polygon points as an SVG "x,y x,y …" string. */
export function polygonPoints(cx: number, cy: number, r: number, n: number, values?: number[]): string {
  return Array.from({ length: n }, (_, i) => polar(cx, cy, (values ? r * values[i] : r), i * 360 / n).join(",")).join(" ");
}

/** Reference points of a log € axis: 1-2-5 per decade while they fit, then 1-3, then the
 *  decades alone, then every other decade. `max` is how many labels the axis has room for -
 *  a lognormal tail can span eight decades, and nineteen labels on 480 px read as one. */
export function logTicks(lo: number, hi: number, max = 9): number[] {
  const e0 = Math.floor(Math.log10(lo)), e1 = Math.ceil(Math.log10(hi));
  const within = (t: number) => t >= lo * 0.999 && t <= hi * 1.001;
  for (const [mants, step] of [[[1, 2, 5], 1], [[1, 3], 1], [[1], 1], [[1], 2], [[1], 3]] as [number[], number][]) {
    const ticks: number[] = [];
    for (let e = e0; e <= e1; e += step) for (const m of mants) { const t = m * Math.pow(10, e); if (within(t)) ticks.push(t); }
    if (ticks.length <= max) return ticks;
  }
  return [];
}

