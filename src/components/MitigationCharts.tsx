// Treatment (WS5) analytics: a kill-chain coverage ring + a TTP-tactic heatmap.
// The heatmap aggregates over ALL operational scenarios and expands to a per-
// scenario breakdown (each row its own colours) - overview first, drill-down on
// demand. All deterministic, generic detection mirrors KillChainMitigation.
import { useMemo, useState } from "react";
import type { Study, Taxonomy } from "../domain/types";
import { getType, recordTitle } from "../domain/taxonomy";
import { arcPath, heatColor } from "../domain/viz";
import { Icon } from "./ui";

export function MitigationCharts({ tax, study, color }: { tax: Taxonomy; study: Study; color: string }) {
  const [perScenario, setPerScenario] = useState(false);

  const model = useMemo(() => {
    const stepType = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "ref" && f.refType) && t.fields.some((f) => f.type === "number"));
    const parentF = stepType?.fields.find((f) => f.type === "ref" && f.refType);
    const orderF = stepType?.fields.find((f) => f.type === "number");
    const tacticF = stepType?.fields.find((f) => f.type === "enum");
    const measureType = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "multiref" && f.refType === stepType?.key));
    const coversF = measureType?.fields.find((f) => f.type === "multiref" && f.refType === stepType?.key);
    if (!stepType || !parentF?.refType || !orderF || !tacticF || !measureType || !coversF) return null;
    const opType = getType(tax, parentF.refType);
    if (!opType) return null;

    const measures = study.entities.filter((e) => e.type === measureType.key);
    const covered = (stepId: string) => measures.some((m) => Array.isArray(m.values[coversF.key]) && (m.values[coversF.key] as string[]).includes(stepId));
    const allSteps = study.entities.filter((e) => e.type === stepType.key);
    const ops = study.entities.filter((e) => e.type === opType.key && allSteps.some((s) => s.values[parentF.key] === e.id));

    const scenarios = ops.map((op) => {
      const steps = allSteps.filter((s) => s.values[parentF.key] === op.id);
      return { id: op.id, name: recordTitle(opType, op), steps, mitigated: steps.filter((s) => covered(s.id)).length };
    });

    // Tactics present, in the enum's canonical order.
    const order = tacticF.options ?? [];
    const present = order.filter((t) => allSteps.some((s) => s.values[tacticF.key] === t));

    // coverage ratio for a tactic within a given step set (null = tactic absent).
    const ratioFor = (steps: typeof allSteps, tactic: string): number | null => {
      const ts = steps.filter((s) => s.values[tacticF.key] === tactic);
      if (!ts.length) return null;
      return ts.filter((s) => covered(s.id)).length / ts.length;
    };
    const countFor = (steps: typeof allSteps, tactic: string) => {
      const ts = steps.filter((s) => s.values[tacticF.key] === tactic);
      return { covered: ts.filter((s) => covered(s.id)).length, total: ts.length };
    };

    return { scenarios, present, ratioFor, countFor, allSteps };
  }, [tax, study]);

  if (!model) return null;
  const { scenarios, present, ratioFor, countFor, allSteps } = model;
  if (!scenarios.length) return null;

  const totSteps = scenarios.reduce((a, s) => a + s.steps.length, 0);
  const totMit = scenarios.reduce((a, s) => a + s.mitigated, 0);
  const pct = totSteps ? Math.round(totMit / totSteps * 100) : 0;

  // ── coverage ring (donut) ────────────────────────────────────────────
  const cx = 92, cy = 92, r = 66, sw = 18;
  const ringSegs: string[] = [];
  let a = 0;
  for (const s of scenarios) {
    if (!s.steps.length) continue;
    const span = (s.steps.length / totSteps) * 360;
    const covSpan = (s.mitigated / s.steps.length) * span;
    ringSegs.push(`covered:${a}:${a + covSpan}`);
    if (covSpan < span) ringSegs.push(`gap:${a + covSpan}:${a + span}`);
    a += span;
  }

  const cell = (steps: typeof allSteps, tactic: string, key: string) => {
    const ratio = ratioFor(steps, tactic);
    if (ratio === null) return <div className="hm-cell empty" key={key} title={`${tactic}: not in this scenario`} />;
    const { covered, total } = countFor(steps, tactic);
    return (
      <div className="hm-cell" key={key} title={`${tactic}: ${covered}/${total} steps mitigated`}
        style={{ background: heatColor(ratio, 0.55), borderColor: heatColor(ratio, 0.8) }}>
        {Math.round(ratio * 100)}%
      </div>
    );
  };
  const gridCols = `minmax(110px, 1.2fr) repeat(${present.length}, minmax(52px, 1fr))`;

  return (
    <div className="panel ws-accent" style={{ ["--ws-color" as string]: color, marginBottom: 20 }}>
      <div className="panel-head">
        <h3>Coverage overview</h3>
        <span className="spacer" />
        <span className="hint">kill-chain mitigation across all scenarios</span>
      </div>
      <div className="panel-body mc-body">
        <div className="mc-ring">
          <svg viewBox="0 0 184 184" width="164" height="164" role="img" aria-label={`${pct}% of kill-chain steps mitigated`}>
            <circle cx={cx} cy={cy} r={r} stroke="var(--track, var(--border))" strokeWidth={sw} fill="none" />
            {ringSegs.map((seg, i) => {
              const [kind, s0, s1] = seg.split(":");
              return <path key={i} d={arcPath(cx, cy, r, Number(s0), Number(s1))} fill="none" strokeWidth={sw}
                stroke={kind === "covered" ? "var(--color-state-success)" : "var(--color-state-error)"} />;
            })}
            <text x={cx} y={cy - 2} textAnchor="middle" fontSize="30" fontWeight="700" fill="var(--fg)">{pct}%</text>
            <text x={cx} y={cy + 18} textAnchor="middle" fontSize="11" fill="var(--fg-subtle)">{totMit}/{totSteps} steps</text>
          </svg>
          <div className="mc-ring-legend">
            <span><i style={{ background: "var(--color-state-success)" }} /> mitigated</span>
            <span><i style={{ background: "var(--color-state-error)" }} /> gap</span>
          </div>
        </div>

        <div className="mc-heat">
          <div className="mc-heat-head">
            <span className="d-sub" style={{ margin: 0 }}>TTP tactic coverage</span>
            <span className="spacer" />
            <button className="btn ghost sm" onClick={() => setPerScenario((v) => !v)}>
              <span className={"caret" + (perScenario ? " open" : "")}><Icon.chevron /></span>
              {perScenario ? "Hide per scenario" : "Break down per scenario"}
            </button>
          </div>
          {present.length === 0 ? (
            <div className="empty" style={{ padding: "16px 0" }}>No tactics assigned to kill-chain steps yet.</div>
          ) : (
            <div className="hm-grid" style={{ gridTemplateColumns: gridCols }}>
              <div className="hm-corner" />
              {present.map((t) => <div className="hm-col" key={t} title={t}>{t}</div>)}

              <div className="hm-rowlbl strong">All scenarios</div>
              {present.map((t) => cell(allSteps, t, "all-" + t))}

              {perScenario && scenarios.map((s) => (
                <div className="hm-scn" key={s.id} style={{ display: "contents" }}>
                  <div className="hm-rowlbl" title={s.name}>{s.name}</div>
                  {present.map((t) => cell(s.steps, t, s.id + "-" + t))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
