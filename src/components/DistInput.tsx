// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Haptic three-point distribution input: drag min / most-likely / max on a
// (log or linear) axis and watch the PERT (beta) density reshape live. Drag the
// peak handle up/down to make the distribution more peaked or flatter (lambda).
// Optional qualitative presets fill a calibrated range as a quick start. Emits a Range.
import { useRef } from "react";
import { PERT_LAMBDA, type Range } from "../domain/montecarlo";

const LAM_MAX = 12, LAM_MIN = 0.2;

export type Unit = "money" | "rate" | "prob";

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

export function fmtVal(v: number, unit: Unit): string {
  // Small-but-real values must never render as a flat zero: a loss-event frequency of
  // 0.03/yr shown as "0.0/yr" makes the whole factor chain read as "0 × €8.7M = €274k",
  // which looks like a broken calculation rather than a rare event.
  if (unit === "prob") {
    if (v <= 0) return "0%";
    const p = v * 100;
    if (p >= 1) return `${Math.round(p)}%`;
    return p >= 0.1 ? `${p.toFixed(1)}%` : "<0.1%";
  }
  if (unit === "rate") {
    if (v <= 0) return "0/yr";
    if (v >= 10) return `${Math.round(v)}/yr`;
    if (v >= 1) return `${v.toFixed(1)}/yr`;
    if (v < 0.001) return "<0.001/yr";
    return `${Number(v.toPrecision(2))}/yr`;   // two significant digits, no trailing zeros
  }
  // money, compact
  const a = Math.abs(v);
  if (a >= 1e9) return `€${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `€${(v / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `€${(v / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  return `€${Math.round(v)}`;
}

export function DistInput({ label, sub, value, onChange, unit, lo, hi, log = false, presets, accent = "var(--teal-bright)", shape = false }: {
  label: string; sub?: string; value: Range; onChange: (r: Range) => void;
  unit: Unit; lo: number; hi: number; log?: boolean; accent?: string;
  presets?: { label: string; range: Range }[]; shape?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const shapeRef = useRef<HTMLDivElement>(null);

  // pixel fraction (0..1) <-> value, honouring a log axis for money/rate.
  const Llo = log ? Math.log10(lo) : lo, Lhi = log ? Math.log10(hi) : hi;
  const toFrac = (v: number) => clamp(((log ? Math.log10(Math.max(v, lo)) : v) - Llo) / (Lhi - Llo), 0, 1);
  const toVal = (f: number) => { const x = Llo + clamp(f, 0, 1) * (Lhi - Llo); return log ? Math.pow(10, x) : x; };

  const startDrag = (which: "min" | "mode" | "max") => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const move = (ev: PointerEvent) => {
      const rect = trackRef.current!.getBoundingClientRect();
      let v = toVal((ev.clientX - rect.left) / rect.width);
      const r = { ...value };
      if (which === "min") r.min = Math.min(v, r.mode);
      else if (which === "max") r.max = Math.max(v, r.mode);
      else r.mode = clamp(v, r.min, r.max);
      onChange(r);
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };

  // Grab the curve body and slide the WHOLE distribution left/right - min, mode
  // and max shift together (in frac space, so the spread is preserved on either
  // a log or a linear axis).
  const startPan = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const f0 = { min: toFrac(value.min), mode: toFrac(value.mode), max: toFrac(value.max) };
    const move = (ev: PointerEvent) => {
      const rect = trackRef.current!.getBoundingClientRect();
      const d = clamp((ev.clientX - startX) / rect.width, -f0.min, 1 - f0.max);
      onChange({ ...value, min: toVal(f0.min + d), mode: toVal(f0.mode + d), max: toVal(f0.max + d) });
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };

  // Shape slider (optional, its own track so nothing overlaps): drag left for a
  // flat, spread distribution, right for a tall, concentrated one (PERT lambda).
  const setLamFromX = (clientX: number) => {
    const rect = shapeRef.current!.getBoundingClientRect();
    const f = clamp((clientX - rect.left) / rect.width, 0, 1);
    onChange({ ...value, lambda: LAM_MIN + f * (LAM_MAX - LAM_MIN) });
  };
  const startShapeDrag = (e: React.PointerEvent) => {
    e.preventDefault(); setLamFromX(e.clientX);
    const move = (ev: PointerEvent) => setLamFromX(ev.clientX);
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };

  // PERT (beta) density polygon across the axis (figurative live preview). lambda
  // drives both the width (beta shape) and the drawn peak height, so a taller,
  // narrower bump reads as "more concentrated".
  const H = 34, N = 72;
  const { min, mode, max } = value;
  const lam = clamp(value.lambda == null ? PERT_LAMBDA : value.lambda, LAM_MIN, LAM_MAX);
  const span = max - min;
  const a = span > 0 ? 1 + (lam * (mode - min)) / span : 1;
  const b = span > 0 ? 1 + (lam * (max - mode)) / span : 1;
  const betaPdf = (t: number) => (t <= 0 || t >= 1 ? 0 : Math.pow(t, a - 1) * Math.pow(1 - t, b - 1));
  const tMode = span > 0 ? (mode - min) / span : 0.5;
  const peakVal = betaPdf(tMode) || 1;                          // normalise by the mode's density
  const peakFrac = clamp(lam / LAM_MAX, 0.14, 1);              // how tall to draw the apex
  const dens = (v: number) => {
    if (span <= 0 || v < min || v > max) return 0;
    return (betaPdf((v - min) / span) / peakVal) * peakFrac;
  };
  let poly = `0,${H}`;
  for (let i = 0; i <= N; i++) { const f = i / N; poly += ` ${(f * 100).toFixed(2)},${(H - dens(toVal(f)) * (H - 3)).toFixed(2)}`; }
  poly += ` 100,${H}`;
  const fMin = toFrac(min) * 100, fMode = toFrac(mode) * 100, fMax = toFrac(max) * 100;
  const shapeFrac = clamp((lam - LAM_MIN) / (LAM_MAX - LAM_MIN), 0, 1);

  return (
    <div className="di">
      <div className="di-head">
        <span className="di-label">{label}{sub && <span className="di-sub"> · {sub}</span>}</span>
        <span className="di-read mono">{fmtVal(min, unit)} · <b>{fmtVal(mode, unit)}</b> · {fmtVal(max, unit)}</span>
      </div>
      {presets && (
        <div className="di-presets">
          {presets.map((p) => (
            <button key={p.label} type="button" className="di-preset" onClick={() => onChange(p.range)}>{p.label}</button>
          ))}
        </div>
      )}
      <div className="di-track">
        <div className="di-inner" ref={trackRef}>
          <svg className="di-density" viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" aria-hidden>
            <polygon points={poly} fill={accent} fillOpacity={0.18} stroke={accent} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
          </svg>
          <span className="di-range" style={{ left: `${fMin}%`, width: `${Math.max(0, fMax - fMin)}%`, background: `color-mix(in oklch, ${accent} 30%, transparent)` }} onPointerDown={startPan} title="Drag to slide the whole distribution" />
          <button type="button" className="di-h di-h-min" style={{ left: `${fMin}%`, borderColor: accent }} onPointerDown={startDrag("min")} aria-label="minimum" />
          <button type="button" className="di-h di-h-mode" style={{ left: `${fMode}%`, background: accent }} onPointerDown={startDrag("mode")} aria-label="most likely" />
          <button type="button" className="di-h di-h-max" style={{ left: `${fMax}%`, borderColor: accent }} onPointerDown={startDrag("max")} aria-label="maximum" />
        </div>
      </div>
      {shape && (
        <div className="di-shape">
          <span className="di-shape-cap">flat</span>
          <div className="di-shape-track" ref={shapeRef} onPointerDown={startShapeDrag}>
            <span className="di-shape-fill" style={{ width: `${shapeFrac * 100}%`, background: `color-mix(in oklch, ${accent} 45%, transparent)` }} />
            <span className="di-shape-h" style={{ left: `${shapeFrac * 100}%`, borderColor: accent }} aria-hidden />
          </div>
          <span className="di-shape-cap">peaked</span>
        </div>
      )}
    </div>
  );
}
