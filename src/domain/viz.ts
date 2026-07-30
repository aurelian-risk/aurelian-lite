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

/** "Goodness" ramp: 1 = good (green) → 0 = bad (red). For coverage / fulfillment. */
export function goodColor(r: number): string {
  return r >= 1 ? "var(--color-state-success)"
    : r >= 0.66 ? "var(--color-state-warning)"
    : r >= 0.34 ? "color-mix(in oklch, var(--color-state-warning) 45%, var(--color-state-error))"
    : "var(--color-state-error)";
}

/** "Severity" ramp: 0 = low (green) → 1 = high (red). For criticality / exposure / threat. */
export const badColor = (r: number): string => goodColor(1 - r);

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
