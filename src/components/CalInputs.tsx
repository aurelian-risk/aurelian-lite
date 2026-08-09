// Visual inputs for the calibration.
//
// A calibration read as a wall of number boxes tells you nothing about whether a value
// is large, small, or far from where it started - which is exactly what someone
// adjusting it needs to see. These controls put every value on a track with its default
// marked, so the size of a change is visible while it is being made.
//
// Three kinds cover the whole calibration: a dial for single values, a segmented choice
// for values that are really categories, and the app's existing DistInput curve for the
// three-point bands.
import { useRef, useState } from "react";

export type DialKind = "pct" | "mult" | "rate" | "int";

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);

function label(v: number, kind: DialKind): string {
  switch (kind) {
    case "pct": return `${Math.round(v * 100)}%`;
    case "mult": return `×${Number(v.toPrecision(2))}`;
    case "rate": return `${Number(v.toPrecision(2))}/yr`;
    case "int": return String(Math.round(v));
  }
}

/** One value on a track, with its default marked and the number still typeable.
 *  Dragging is the fast path; the number is there for when a figure has to be exact. */
export function Dial({ value, onChange, dflt, lo, hi, step, kind, log = false, name }: {
  value: number; onChange: (n: number) => void; dflt: number;
  lo: number; hi: number; step: number; kind: DialKind; log?: boolean; name: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [typing, setTyping] = useState<string | null>(null);

  const Llo = log ? Math.log10(Math.max(lo, 1e-6)) : lo;
  const Lhi = log ? Math.log10(hi) : hi;
  const frac = (v: number) => clamp(((log ? Math.log10(Math.max(v, lo, 1e-6)) : v) - Llo) / (Lhi - Llo || 1), 0, 1);
  const val = (f: number) => {
    const raw = log ? Math.pow(10, Llo + clamp(f, 0, 1) * (Lhi - Llo)) : Llo + clamp(f, 0, 1) * (Lhi - Llo);
    return clamp(Math.round(raw / step) * step, lo, hi);
  };

  const set = (e: PointerEvent | React.PointerEvent) => {
    const el = track.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    onChange(val((e.clientX - r.left) / r.width));
  };
  const drag = (e: React.PointerEvent) => {
    e.preventDefault();
    set(e);
    const move = (ev: PointerEvent) => set(ev);
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const key = (e: React.KeyboardEvent) => {
    const d = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
    if (!d) return;
    e.preventDefault();
    onChange(clamp(Number((value + d * step * (e.shiftKey ? 10 : 1)).toFixed(6)), lo, hi));
  };

  const f = frac(value), df = frac(dflt);
  const moved = Math.abs(value - dflt) > step / 2;
  return (
    <div className="dial">
      <div className="dial-track" ref={track} onPointerDown={drag} role="slider" tabIndex={0}
        aria-label={name} aria-valuenow={value} aria-valuemin={lo} aria-valuemax={hi}
        onKeyDown={key} title={`${name}: ${label(value, kind)}${moved ? ` · default ${label(dflt, kind)}` : ""}`}>
        <span className="dial-fill" style={{ width: `${f * 100}%` }} />
        <span className={"dial-dflt" + (moved ? " off" : "")} style={{ left: `${df * 100}%` }} />
        <span className="dial-knob" style={{ left: `${f * 100}%` }} />
      </div>
      {typing == null ? (
        <button className={"dial-v mono" + (moved ? " moved" : "")} onClick={() => setTyping(String(value))}
          title="Type an exact value">{label(value, kind)}</button>
      ) : (
        <input className="dial-v mono editing" autoFocus value={typing}
          onChange={(e) => setTyping(e.target.value)}
          onBlur={() => { const n = Number(typing); if (Number.isFinite(n)) onChange(clamp(n, lo, hi)); setTyping(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setTyping(null); }} />
      )}
    </div>
  );
}

/** A row: what is being set on the left, the dial on the right. */
export function DialRow({ name, hint, ...rest }: { name: string; hint?: string } & Omit<Parameters<typeof Dial>[0], "name">) {
  return (
    <div className="dial-row">
      <span className="dial-k">{name}{hint && <em>{hint}</em>}</span>
      <Dial name={name} {...rest} />
    </div>
  );
}

/** For values that are really a choice between named cases rather than a magnitude -
 *  tooling maturity is three states, and three buttons say that better than a number
 *  box that happens to accept 0, 0.5 and 1. */
export function Seg({ value, onChange, options, dflt, name }: {
  value: number; onChange: (n: number) => void; dflt: number;
  options: { v: number; label: string; title?: string }[]; name: string;
}) {
  return (
    <div className="cal-seg" role="group" aria-label={name}>
      {options.map((o) => (
        <button key={o.v} type="button" title={o.title}
          className={"cal-seg-b" + (value === o.v ? " on" : "") + (o.v === dflt ? " dflt" : "")}
          onClick={() => onChange(o.v)}>{o.label}</button>
      ))}
    </div>
  );
}
