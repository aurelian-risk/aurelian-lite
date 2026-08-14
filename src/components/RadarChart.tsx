// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Generic radar/spider chart.
//  • Single series  : pass `axes` (each an axis with a 0..1 value + optional sub).
//  • Multiple series : pass `axisLabels` + `series` (one polygon each, with a
//    legend) - e.g. threat actors compared across rating scores.
// Falls back to bars when a radar would not read well (<3 or >8 axes).
import { polar } from "../domain/viz";

export interface RadarAxis { label: string; sub?: string; value: number }
export interface RadarSeries { label: string; color: string; values: number[]; sub?: string }

export function RadarChart({ axes, axisLabels, series, accent = "var(--teal-bright)" }: {
  axes?: RadarAxis[]; axisLabels?: string[]; series?: RadarSeries[]; accent?: string;
}) {
  const multi = !!(series && axisLabels);
  const labels = multi ? axisLabels! : (axes ?? []).map((a) => a.label);
  const n = labels.length;
  if (n === 0) return <div className="empty" style={{ padding: "16px 0" }}>Not enough data yet.</div>;

  // ── Bar fallback (radar unreadable) ──────────────────────────────────
  if (n < 3 || n > 8) {
    if (multi) {
      return (
        <div className="radar-bars">
          {series!.map((s, si) => (
            <div key={si} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="rb-lbl" style={{ color: s.color, fontWeight: 600 }}>{s.label}</span>
              {labels.map((lb, i) => (
                <div className="rb-row" key={i}>
                  <span className="rb-lbl">{lb}</span>
                  <span className="rb-track"><span className="rb-fill" style={{ width: `${Math.round(s.values[i] * 100)}%`, background: s.color }} /></span>
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="radar-bars">
        {axes!.map((a, i) => (
          <div className="rb-row" key={i}>
            <span className="rb-lbl" title={a.label}>{a.label}</span>
            <span className="rb-track"><span className="rb-fill" style={{ width: `${Math.round(a.value * 100)}%`, background: accent }} /></span>
            <span className="rb-val mono">{Math.round(a.value * 100)}%{a.sub ? ` · ${a.sub}` : ""}</span>
          </div>
        ))}
      </div>
    );
  }

  const cx = 210, cy = 126, R = 84;
  const ring = (f: number) => Array.from({ length: n }, (_, i) => polar(cx, cy, R * f, i * 360 / n).join(",")).join(" ");
  const ptsFor = (vals: number[]) => vals.map((v, i) => polar(cx, cy, R * Math.max(0.02, v), i * 360 / n));

  const seriesList: RadarSeries[] = multi ? series! : [{ label: "", color: accent, values: (axes ?? []).map((a) => a.value) }];

  return (
    <div className="radar-wrap">
      <svg viewBox="0 0 420 256" className="radar-svg" role="img">
        {[0.25, 0.5, 0.75, 1].map((f) => <polygon key={f} points={ring(f)} fill="none" stroke="var(--border)" />)}
        {labels.map((_, i) => { const [x, y] = polar(cx, cy, R, i * 360 / n); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" />; })}
        {seriesList.map((s, si) => {
          const pts = ptsFor(s.values);
          return (
            <g key={si}>
              <polygon points={pts.map((p) => p.join(",")).join(" ")}
                fill={s.color} fillOpacity={multi ? 0.12 : 0.18} stroke={s.color} strokeWidth={2} />
              {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={3} fill={s.color} />)}
            </g>
          );
        })}
        {labels.map((lb, i) => {
          const [x, y] = polar(cx, cy, R + 20, i * 360 / n);
          const anchor = Math.abs(x - cx) < 8 ? "middle" : x > cx ? "start" : "end";
          const single = !multi ? (axes ?? [])[i] : null;
          const sub = single?.sub && single.sub.length > 14 ? single.sub.slice(0, 13) + "…" : single?.sub;
          return (
            <text key={i} x={x} y={y} textAnchor={anchor} className="radar-lbl">
              <tspan x={x} dy={0} className="radar-lbl-main">{lb.length > 18 ? lb.slice(0, 17) + "…" : lb}</tspan>
              {!multi && single && <tspan x={x} dy={13} className="radar-lbl-sub">{Math.round(single.value * 100)}%{sub ? ` · ${sub}` : ""}</tspan>}
            </text>
          );
        })}
      </svg>
      {multi && (
        <div className="radar-legend">
          {series!.map((s, si) => (
            <span className="rl-item" key={si}><i style={{ background: s.color }} />{s.label}{s.sub ? <em>{s.sub}</em> : null}</span>
          ))}
        </div>
      )}
    </div>
  );
}
