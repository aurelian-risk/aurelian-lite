// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Defence in depth, drawn in the unit that means something.
//
// An earlier version plotted "combined coverage", which reads like a share of attacks
// stopped and is nothing of the sort - it is an intermediate that feeds the bar. This
// plots what an analyst can act on: of every 100 attempts at this step, how many get
// past. The coverage stays as a faint second line, because the ceiling caps it and
// would otherwise have no referent.
//
// P(capability > bar) is computed numerically rather than simulated: both are PERT
// distributions, so discretising each and convolving gives the same answer as the
// simulation to within a few tenths of a point, without noise and cheaply enough to
// redraw while a dial is being dragged.
import type { Band, EffectCalibration } from "../domain/calibration";
import { t as tr } from "../domain/i18n";

const W = 430, H = 182, PL = 34, PR = 12, PT = 16, PB = 40;
const GRID = 256;

/** Normalised PERT density over a fixed 0..1 grid. */
function density(b: Band): Float64Array {
  const w = new Float64Array(GRID);
  const span = b.max - b.min;
  if (!(span > 0)) {
    w[Math.min(GRID - 1, Math.max(0, Math.floor(b.mode * GRID)))] = 1;
    return w;
  }
  const lam = b.lambda ?? 4;
  const a = 1 + (lam * (b.mode - b.min)) / span;
  const be = 1 + (lam * (b.max - b.mode)) / span;
  let sum = 0;
  for (let i = 0; i < GRID; i++) {
    const v = (i + 0.5) / GRID;
    if (v <= b.min || v >= b.max) continue;
    const t = (v - b.min) / span;
    const d = Math.pow(t, a - 1) * Math.pow(1 - t, be - 1);
    w[i] = d; sum += d;
  }
  if (sum > 0) for (let i = 0; i < GRID; i++) w[i] /= sum;
  return w;
}

/** P(A > B) for two three-point estimates. */
export function pAboveB(A: Band, B: Band): number {
  const a = density(A), b = density(B);
  let acc = 0, cum = 0;
  for (let i = 0; i < GRID; i++) { acc += a[i] * cum; cum += b[i]; }
  return acc;
}

export const effAt = (e: EffectCalibration, li: number) =>
  (e.levelWeight[li] ?? 1) * e.controlCeiling * (e.statusWeight.Implemented ?? 1);

const cover = (eff: number, n: number) => 1 - Math.pow(1 - eff, n);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;

/** The attack this picture assumes: a mid-scale demand, so the numbers are neither a
 *  trivial nor a hopeless case. Stated on the chart - a "how many get past" figure is
 *  meaningless without saying who is attacking what. */
const DEMAND = 0.5;

export function DepthCurve({ effect, capability, spread, levels, level, onLevel, accent = "var(--color-state-error)" }: {
  effect: EffectCalibration; capability: Band; spread: number; levels: string[];
  level: number; onLevel: (i: number) => void; accent?: string;
}) {
  const eff = effAt(effect, level);
  const N = 4;
  const x = (n: number) => PL + ((W - PL - PR) * n) / N;
  const y = (v: number) => PT + (H - PT - PB) * (1 - v);

  const pts = Array.from({ length: N + 1 }, (_, n) => {
    const c = cover(eff, n);
    const mode = Math.min(1, DEMAND + effect.prevention * c);
    const bar: Band = { min: Math.max(0, mode - spread), mode, max: Math.min(1, mode + spread) };
    return { n, c, bar: mode, through: pAboveB(capability, bar) };
  });
  const line = (f: (p: typeof pts[0]) => number) =>
    pts.map((p, i) => `${i ? "L" : "M"}${x(p.n).toFixed(1)},${y(f(p)).toFixed(1)}`).join(" ");

  return (
    <div className="depth">
      <div className="depth-switch">
        <span>{tr('ui.caldepth.implementation', 'Implementation')}</span>
        {levels.map((l, i) => (
          <button key={l} type="button" className={"cal-seg-b" + (i === level ? " on" : "")}
            onClick={() => onLevel(i)}>{l}</button>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="depth-svg" role="img"
        aria-label={`Attempts getting past one step as measures are added: ${pts.map((p) => pct1(p.through)).join(", ")}`}>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={PL} y1={y(v)} x2={W - PR} y2={y(v)} stroke="var(--hairline)" strokeWidth="1" />
            <text x={PL - 6} y={y(v) + 3.5} textAnchor="end" fontSize="9" fill="var(--fg-subtle)">{pct(v)}</text>
          </g>
        ))}
        {/* the cover is what the ceiling caps - kept visible so that dial has a referent */}
        <path d={line((p) => p.c)} fill="none" stroke="var(--fg-subtle)" strokeWidth="1.3" strokeDasharray="3 3" opacity="0.8" />
        {eff > 0 && (
          <text x={W - PR} y={y(eff) - 4} textAnchor="end" fontSize="8.5" fill="var(--fg-subtle)">
            cover, capped at {pct(effect.controlCeiling)} per measure
          </text>
        )}
        <path d={line((p) => p.through)} fill="none" stroke={accent} strokeWidth="2.2" />
        {pts.map((p) => (
          <g key={p.n}>
            <circle cx={x(p.n)} cy={y(p.through)} r="3.4" fill={accent} />
            <text x={x(p.n) + (p.n === 0 ? 4 : 0)} y={y(p.through) - 8}
              textAnchor={p.n === 0 ? "start" : "middle"} fontSize="9.5" fill="var(--fg)" fontWeight="600">
              {pct1(p.through)}
            </text>
          </g>
        ))}
        {pts.map((p) => (
          <text key={p.n} x={x(p.n)} y={H - 21} textAnchor="middle" fontSize="9" fill="var(--fg-subtle)">{p.n}</text>
        ))}
        <text x={(PL + W - PR) / 2} y={H - 10} textAnchor="middle" fontSize="8.5" fill="var(--fg-subtle)">
          measures on the same step
        </text>
        <text x={(PL + W - PR) / 2} y={H - 1} textAnchor="middle" fontSize="8" fill="var(--fg-subtle)">
          for an attack that by itself needs someone better than half of all attackers, tried by a capable one
        </text>
      </svg>

      <p className="depth-key">
        <span className="depth-k1" style={{ background: accent }} /> of every 100 attempts, how many get through
        <span className="depth-k2" /> how well the step is protected
      </p>
      <p className="depth-note">
        {eff <= 0
          ? `A measure recorded as "${levels[level]}" counts for nothing, so no number of them changes the step.`
          : <>
            One measure at &quot;{levels[level]}&quot; protects {pct(eff)} of this step. That lifts
            the skill needed here from &quot;better than {pct(DEMAND)} of attackers&quot; to
            &quot;better than {pct(Math.min(1, DEMAND + effect.prevention * eff))}&quot;, and the
            share getting through falls from {pct1(pts[0].through)} to {pct1(pts[1].through)} out of 100.
            {" "}A second measure only matters in the cases where the first one failed, which are
            few, so it takes that to {pct1(pts[2].through)} and a third to {pct1(pts[3].through)}.
            That is why layers on one step run out quickly - and why the same measures achieve
            more spread across different steps of the chain, where an attacker has to clear each
            of them.
          </>}
        {" "}The maths assumes the measures fail independently of each other. Two that depend on
        the same administrator, platform or bypass do not, and this picture flatters them.
      </p>
    </div>
  );
}
