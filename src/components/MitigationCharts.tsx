// Treatment (WS5) analytics. A defense-in-depth coverage view over the kill chain:
//   - a ring with the overall (implementation-weighted, saturating) coverage
//   - a per-tactic heatmap (same weighting)
//   - a per-step breakdown where each covering measure is a LAYER; the stacked bar
//     shows how the layers combine (each new layer closes a shrinking slice of the
//     remaining gap = saturation), and every measure chip opens the entity.
import { useMemo, useState } from "react";
import type { EntityRecord, Study, Taxonomy } from "../domain/types";
import { getType, recordTitle, scaleMax } from "../domain/taxonomy";
import { coverageOf, measureEfficacyOf, type StepCov } from "../domain/quantModel";
import { arcPath, heatColor } from "../domain/viz";
import { EntityModal } from "./EntityModal";
import { Icon } from "./ui";

export function MitigationCharts({ tax, study, color }: { tax: Taxonomy; study: Study; color: string }) {
  const [rec, setRec] = useState<EntityRecord | null>(null);
  const [perScenario, setPerScenario] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const model = useMemo(() => {
    const stepType = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "ref" && f.refType) && t.fields.some((f) => f.type === "number"));
    const parentF = stepType?.fields.find((f) => f.type === "ref" && f.refType);
    const tacticF = stepType?.fields.find((f) => f.type === "enum");
    const measureType = tax.entityTypes.find((t) => t.key !== stepType?.key && t.fields.some((f) => f.type === "multiref" && f.refType === stepType?.key));
    const implF = measureType?.fields.find((f) => f.key === "implementation_level");
    if (!stepType || !parentF?.refType || !tacticF || !measureType) return null;
    const opType = getType(tax, parentF.refType);
    if (!opType) return null;

    const implMax = implF ? scaleMax(implF) : 4;
    const implFrac = (m: EntityRecord) => (implF ? Number(m.values[implF.key] ?? 1) : implMax) / implMax;
    const allSteps = study.entities.filter((e) => e.type === stepType.key);
    const ops = study.entities.filter((e) => e.type === opType.key && allSteps.some((s) => s.values[parentF.key] === e.id));
    const scenarios = ops.map((op) => {
      const cov = coverageOf(study, tax, op);
      return { id: op.id, name: recordTitle(opType, op), cov, tSteps: cov.steps.map((st) => ({ tactic: String(st.step.values[tacticF.key] ?? ""), coverage: st.coverage })) };
    });

    // flatten every step (with its tactic) for the ring + tactic heatmap.
    const flat = scenarios.flatMap((sc) => sc.tSteps);
    const order = tacticF.options ?? [];
    const present = order.filter((t) => flat.some((s) => s.tactic === t));
    const covFor = (steps: { tactic: string; coverage: number }[], tactic: string): number | null => {
      const ts = steps.filter((s) => s.tactic === tactic);
      return ts.length ? ts.reduce((a, s) => a + s.coverage, 0) / ts.length : null;
    };
    const layersOf = (st: StepCov) => {
      let remaining = 1; const segs: { m: EntityRecord; contrib: number; impl: number; status: string }[] = [];
      for (const m of st.measures) {
        const eff = measureEfficacyOf(tax, m);
        segs.push({ m, contrib: eff * remaining, impl: implFrac(m), status: String(m.values.status ?? "") });
        remaining *= (1 - eff);
      }
      return segs;
    };
    return { scenarios, flat, present, covFor, layersOf, tacticF, measureType, stepType };
  }, [tax, study]);

  if (!model) return null;
  const { scenarios, flat, present, covFor, layersOf, measureType, stepType } = model;
  if (!scenarios.length) return null;

  const totSteps = flat.length;
  const overall = totSteps ? flat.reduce((a, s) => a + s.coverage, 0) / totSteps : 0;
  const pct = Math.round(overall * 100);
  const mitigated = scenarios.reduce((a, sc) => a + sc.cov.mitigated, 0);

  // ── coverage ring: covered arc = overall coverage, gap = the rest ──
  const cx = 92, cy = 92, r = 66, sw = 18;
  const covSpan = overall * 360;

  const cell = (steps: typeof flat, tactic: string, key: string) => {
    const ratio = covFor(steps, tactic);
    if (ratio === null) return <div className="hm-cell empty" key={key} title={`${tactic}: not in this scenario`} />;
    return <div className="hm-cell" key={key} title={`${tactic}: ${Math.round(ratio * 100)}% coverage (defense-in-depth)`}
      style={{ background: heatColor(ratio, 0.55), borderColor: heatColor(ratio, 0.8) }}>{Math.round(ratio * 100)}%</div>;
  };
  const gridCols = `minmax(110px, 1.2fr) repeat(${present.length}, minmax(52px, 1fr))`;
  const mName = (m: EntityRecord) => recordTitle(measureType, m);

  return (
    <div className="panel ws-accent" style={{ ["--ws-color" as string]: color, marginBottom: 20 }}>
      <div className="panel-head">
        <h3>Coverage overview</h3>
        <span className="spacer" />
        <span className="hint">defense-in-depth: weighted by implementation, layers stack with saturation</span>
      </div>
      <div className="panel-body mc-body">
        <div className="mc-ring">
          <svg viewBox="0 0 184 184" width="164" height="164" role="img" aria-label={`${pct}% defense-in-depth coverage`}>
            <circle cx={cx} cy={cy} r={r} stroke="var(--track, var(--border))" strokeWidth={sw} fill="none" />
            {covSpan > 0.5 && <path d={arcPath(cx, cy, r, 0, covSpan)} fill="none" strokeWidth={sw} stroke="var(--color-state-success)" />}
            {covSpan < 359.5 && <path d={arcPath(cx, cy, r, covSpan, 360)} fill="none" strokeWidth={sw} stroke="var(--color-state-error)" />}
            <text x={cx} y={cy - 2} textAnchor="middle" fontSize="30" fontWeight="700" fill="var(--fg)">{pct}%</text>
            <text x={cx} y={cy + 18} textAnchor="middle" fontSize="11" fill="var(--fg-subtle)">{mitigated}/{totSteps} steps</text>
          </svg>
          <div className="mc-ring-legend">
            <span><i style={{ background: "var(--color-state-success)" }} /> covered</span>
            <span><i style={{ background: "var(--color-state-error)" }} /> residual gap</span>
          </div>
        </div>

        <div className="mc-heat">
          <div className="mc-heat-head">
            <span className="d-sub" style={{ margin: 0 }}>TTP tactic coverage</span>
            <span className="spacer" />
            {scenarios.length > 1 && (
              <button className="btn ghost sm" onClick={() => setPerScenario((v) => !v)}>
                <span className={"caret" + (perScenario ? " open" : "")}><Icon.chevron /></span>
                {perScenario ? "Hide per scenario" : "Break down per scenario"}
              </button>
            )}
          </div>
          {present.length === 0 ? (
            <div className="empty" style={{ padding: "16px 0" }}>No tactics assigned to kill-chain steps yet.</div>
          ) : (
            <div className="hm-grid" style={{ gridTemplateColumns: gridCols }}>
              <div className="hm-corner" />
              {present.map((t) => <div className="hm-col" key={t} title={t}>{t}</div>)}
              <div className="hm-rowlbl strong">All scenarios</div>
              {present.map((t) => cell(flat, t, "all-" + t))}
              {perScenario && scenarios.map((sc) => (
                <div className="hm-scn" key={sc.id} style={{ display: "contents" }}>
                  <div className="hm-rowlbl" title={sc.name}>{sc.name}</div>
                  {present.map((t) => cell(sc.tSteps, t, sc.id + "-" + t))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Per-step defense-in-depth: the drill-down. Each step's covering measures are
          stacked layers; the bar fills to the step's (saturating) coverage. */}
      <div className="panel-body dd-wrap">
        <div className="d-sub" style={{ marginTop: 0 }}>Defense in depth - per kill-chain step</div>
        {scenarios.map((sc) => {
          const isOpen = open.has(sc.id);
          return (
            <div className={"dd-scn" + (isOpen ? " open" : "")} key={sc.id}>
              <button className="dd-scn-h" onClick={() => toggle(sc.id)}>
                <span className={"caret" + (isOpen ? " open" : "")}><Icon.chevron /></span>
                <span className="dd-scn-name">{sc.name}</span>
                <span className="dd-scn-cov mono">{Math.round(sc.cov.value * 100)}%</span>
              </button>
              {isOpen && (
                <div className="dd-steps">
                  {sc.cov.steps.map((st, i) => {
                    const segs = layersOf(st);
                    const gap = 1 - st.coverage;
                    return (
                      <div className="dd-step" key={st.step.id}>
                        <div className="dd-step-h">
                          <span className="dd-num">{i + 1}</span>
                          <span className="dd-step-name">{recordTitle(stepType, st.step)}</span>
                          <span className="dd-step-cov mono" style={{ color: st.coverage > 0.6 ? "var(--color-state-success)" : st.coverage > 0.3 ? "var(--color-state-warning)" : "var(--color-state-error)" }}>{Math.round(st.coverage * 100)}%</span>
                        </div>
                        <div className="dd-bar" title={`${Math.round(st.coverage * 100)}% covered, ${Math.round(gap * 100)}% residual`}>
                          {segs.map((s, j) => (
                            <span key={j} className="dd-seg" style={{ width: `${s.contrib * 100}%`, background: `color-mix(in oklch, var(--color-state-success) ${88 - j * 16}%, var(--bg-raised))` }}
                              title={`${mName(s.m)} — ${s.status || "status unset"} · implementation ${Math.round(s.impl * 100)}% · contributes ${Math.round(s.contrib * 100)}%`} />
                          ))}
                          {gap > 0.001 && <span className="dd-seg gap" style={{ width: `${gap * 100}%` }} title="residual gap" />}
                        </div>
                        <div className="dd-layers">
                          {st.measures.length ? st.measures.map((m) => {
                            const status = String(m.values.status ?? "");
                            return (
                              <button key={m.id} className="chip link" onClick={() => setRec(m)}>
                                {mName(m)}{status && status !== "Implemented" && <span className="dd-status"> · {status.toLowerCase()}</span>}
                              </button>
                            );
                          }) : <span className="dd-nogap">no measure - full gap</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {rec && <EntityModal type={getType(tax, rec.type)!} tax={tax} study={study} record={rec} onClose={() => setRec(null)} />}
    </div>
  );
}
