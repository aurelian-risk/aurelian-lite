// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Treatment (WS5) analytics over the kill chain:
//   - a ring showing what actually happens to an attempt: resisted, caught in the act,
//     or through - read from the SAME traversal the quantification runs, so this view
//     and the risk numbers cannot tell different stories
//   - a per-tactic heatmap of how well each tactic is defended (resistance + detection;
//     recovery is deliberately excluded - it does not defend a step, it pays for it)
//   - a per-step breakdown where each covering measure is a LAYER; the stacked bar
//     shows how the layers combine (each new layer closes a shrinking slice of the
//     remaining gap = saturation), and every measure chip opens the entity.
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { EntityRecord, EntityTypeDef, Study, Taxonomy } from "../domain/types";
import { getType, recordTitle, scaleMax } from "../domain/taxonomy";
import { coverageOf, deriveInputs, measureEfficacyOf, type StepCov } from "../domain/quantModel";
import { simulate } from "../domain/montecarlo";
import { effectClassOf, EFFECT_CHANNEL, type EffectClass } from "../domain/controls";
import { arcPath, heatColor } from "../domain/viz";
import { EntityModal } from "./EntityModal";
import { Icon } from "./ui";
import { DEFAULT_CALIBRATION } from "../domain/calibration";

/** Iterations behind the ring. Enough for a stable percentage, far below what the
 *  quantification view needs for a loss curve - this only has to fill three arcs. */
const RING_ITER = 6000;

/** One kill-chain step as the tactic heatmap sees it. */
interface HeatStep { tactic: string; coverage: number; st: StepCov; scenario: string }

export function MitigationCharts({ tax, study, color }: { tax: Taxonomy; study: Study; color: string }) {
  const [rec, setRec] = useState<EntityRecord | null>(null);
  const [heat, setHeat] = useState<{ tactic: string; scope: string; steps: HeatStep[] } | null>(null);
  const [perScenario, setPerScenario] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const cal = study.calibration ?? DEFAULT_CALIBRATION;

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
    // A step is DEFENDED to the extent it resists or is watched. Recovery is not part of
    // this: a backup does not stop an attacker reaching the step, it pays for it later.
    const defenceOf = (st: StepCov) => 1 - (1 - st.prevention) * (1 - st.detection);
    const scenarios = ops.map((op) => {
      const cov = coverageOf(study, tax, op, cal);
      // What becomes of an attempt on this chain, from the traversal itself.
      const d = deriveInputs(study, tax, op, true, cal);
      const r = simulate(d.inputs, RING_ITER, d.chain);
      const outcome = { caught: r.detected, through: r.vuln, resisted: Math.max(0, 1 - r.detected - r.vuln) };
      return {
        id: op.id, name: recordTitle(opType, op), cov, outcome,
        gates: d.chain?.filter((s) => s.gate).length ?? 0,
        watched: d.chain?.filter((s) => s.interrupt > 0).length ?? 0,
        tSteps: cov.steps.map((st) => ({
          tactic: String(st.step.values[tacticF.key] ?? ""), coverage: defenceOf(st),
          st, scenario: recordTitle(opType, op),
        })),
      };
    });

    // flatten every step (with its tactic) for the tactic heatmap.
    const flat = scenarios.flatMap((sc) => sc.tSteps);
    const order = tacticF.options ?? [];
    const present = order.filter((t) => flat.some((s) => s.tactic === t));
    const stepsFor = (steps: HeatStep[], tactic: string) => steps.filter((s) => s.tactic === tactic);
    const covFor = (steps: HeatStep[], tactic: string): number | null => {
      const ts = stepsFor(steps, tactic);
      return ts.length ? ts.reduce((a, s) => a + s.coverage, 0) / ts.length : null;
    };
    // Layers are grouped by what they DO: the blocking ones stack first, then the
    // detecting ones, then those that act on another factor entirely - on the loss
    // (corrective) or on the number of attacks (deterrent, avoidance).
    const ORDER: EffectClass[] = ["Preventive", "Detective", "Corrective", "Deterrent", "Avoidance"];
    const layersOf = (st: StepCov) => {
      let remaining = 1; const segs: { m: EntityRecord; cls: EffectClass; contrib: number; impl: number; status: string }[] = [];
      const sorted = [...st.measures].sort((a, b) => ORDER.indexOf(effectClassOf(a)) - ORDER.indexOf(effectClassOf(b)));
      for (const m of sorted) {
        const cls = effectClassOf(m);
        const defends = cls === "Preventive" || cls === "Detective";
        const eff = measureEfficacyOf(tax, m, cal);
        segs.push({ m, cls, contrib: defends ? eff * remaining : 0, impl: implFrac(m), status: String(m.values.status ?? "") });
        if (defends) remaining *= (1 - eff);
      }
      return segs;
    };
    return { scenarios, flat, present, covFor, stepsFor, layersOf, tacticF, measureType, stepType };
  }, [tax, study, cal]);

  if (!model) return null;
  const { scenarios, flat, present, covFor, stepsFor, layersOf, measureType, stepType } = model;
  if (!scenarios.length) return null;

  const totSteps = flat.length;
  // Mean over the scenarios of what happens to an attempt. NOT an average of coverage
  // figures - that is the arithmetic this model was built to get rid of.
  const n = scenarios.length;
  const resisted = scenarios.reduce((a, sc) => a + sc.outcome.resisted, 0) / n;
  const caught = scenarios.reduce((a, sc) => a + sc.outcome.caught, 0) / n;
  const through = scenarios.reduce((a, sc) => a + sc.outcome.through, 0) / n;
  const pct = Math.round((resisted + caught) * 100);
  const gates = scenarios.reduce((a, sc) => a + sc.gates, 0);
  const watched = scenarios.reduce((a, sc) => a + sc.watched, 0);

  // ── outcome ring: resisted | caught in the act | through ──
  const cx = 92, cy = 92, r = 66, sw = 18;
  const aRes = resisted * 360, aCau = caught * 360;

  const cell = (steps: HeatStep[], tactic: string, key: string, scope: string) => {
    const ratio = covFor(steps, tactic);
    if (ratio === null) return <div className="hm-cell empty" key={key} title={`${tactic}: not in this scenario`} />;
    return (
      <button type="button" className="hm-cell" key={key}
        title={`${tactic}: ${Math.round(ratio * 100)}% defended - click to see how this is worked out`}
        onClick={() => setHeat({ tactic, scope, steps: stepsFor(steps, tactic) })}
        style={{ background: heatColor(ratio, 0.55), borderColor: heatColor(ratio, 0.8) }}>{Math.round(ratio * 100)}%</button>
    );
  };
  const gridCols = `minmax(96px, 1fr) repeat(${present.length}, minmax(66px, 1fr))`;
  const mName = (m: EntityRecord) => recordTitle(measureType, m);

  return (
    <div className="panel ws-accent" style={{ ["--ws-color" as string]: color, marginBottom: 20 }}>
      <div className="panel-head">
        <h3>Chain defence</h3>
        <span className="spacer" />
        <span className="hint">outcome of an attack attempt, from the same traversal as the risk figures</span>
      </div>
      <div className="panel-body mc-body">
        <div className="mc-ring">
          <svg viewBox="0 0 184 184" width="164" height="164" role="img"
            aria-label={`${pct}% of attempts stopped - ${Math.round(resisted * 100)}% resisted, ${Math.round(caught * 100)}% caught in the act, ${Math.round(through * 100)}% reach the objective`}>
            <circle cx={cx} cy={cy} r={r} stroke="var(--track, var(--border))" strokeWidth={sw} fill="none" />
            {aRes > 0.5 && <path d={arcPath(cx, cy, r, 0, aRes)} fill="none" strokeWidth={sw} stroke="var(--color-state-success)" />}
            {aCau > 0.5 && <path d={arcPath(cx, cy, r, aRes, aRes + aCau)} fill="none" strokeWidth={sw} stroke="var(--color-state-info, var(--primary))" />}
            {aRes + aCau < 359.5 && <path d={arcPath(cx, cy, r, aRes + aCau, 360)} fill="none" strokeWidth={sw} stroke="var(--color-state-error)" />}
            <text x={cx} y={cy - 2} textAnchor="middle" fontSize="30" fontWeight="700" fill="var(--fg)">{pct}%</text>
            <text x={cx} y={cy + 18} textAnchor="middle" fontSize="11" fill="var(--fg-subtle)">attempts stopped</text>
          </svg>
          <div className="mc-ring-legend">
            <span><i style={{ background: "var(--color-state-success)" }} /> blocked</span>
            <span><i style={{ background: "var(--color-state-info, var(--primary))" }} /> detected in time</span>
            <span><i style={{ background: "var(--color-state-error)" }} /> reaches the objective</span>
            <span className="mc-ring-sub">{gates} of {totSteps} steps block an attacker · {watched} detect him</span>
          </div>
        </div>

        <div className="mc-heat">
          <div className="mc-heat-head">
            <span className="d-sub" style={{ margin: 0 }}>TTP tactic defence</span>
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
            <>
              <div className="hm-scroll">
                <div className="hm-grid" style={{ gridTemplateColumns: gridCols }}>
                  <div className="hm-corner" />
                  {present.map((t) => <div className="hm-col" key={t} title={t}>{t}</div>)}
                  <div className="hm-rowlbl strong">All scenarios</div>
                  {present.map((t) => cell(flat, t, "all-" + t, "All scenarios"))}
                  {perScenario && scenarios.map((sc) => (
                    <div className="hm-scn" key={sc.id} style={{ display: "contents" }}>
                      <div className="hm-rowlbl" title={sc.name}>{sc.name}</div>
                      {present.map((t) => cell(sc.tSteps, t, sc.id + "-" + t, sc.name))}
                    </div>
                  ))}
                </div>
              </div>
              <div className="hm-key">
                <span className="hm-key-l">undefended</span>
                <span className="hm-key-bar">
                  {[0, 0.2, 0.4, 0.6, 0.8, 1].map((v) => <i key={v} style={{ background: heatColor(v, 0.55) }} />)}
                </span>
                <span className="hm-key-l">fully defended</span>
                <span className="hm-key-note">click a tile for the working</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Per-step defense-in-depth: the drill-down. Each step's covering measures are
          stacked layers; the bar fills to the step's (saturating) coverage. */}
      <div className="panel-body dd-wrap">
        <div className="d-sub" style={{ marginTop: 0 }}>Defense in depth - per kill-chain step</div>
        <div className="hint" style={{ marginBottom: 8 }}>
          The bar counts only measures that stop an attacker <b>at this step</b>: preventive ones block him, detective
          ones catch him. The others get no bar because they act on a different factor — <b>corrective measures act on
          the loss</b> (damage control: what the attack costs once it succeeds), <b>deterrent and avoidance measures act
          on the number of attacks</b>. Both move the risk figures; neither changes whether this step is reached.
        </div>
        {scenarios.map((sc) => {
          const isOpen = open.has(sc.id);
          return (
            <div className={"dd-scn" + (isOpen ? " open" : "")} key={sc.id}>
              <button className="dd-scn-h" onClick={() => toggle(sc.id)}>
                <span className={"caret" + (isOpen ? " open" : "")}><Icon.chevron /></span>
                <span className="dd-scn-name">{sc.name}</span>
                <span className="dd-scn-cov mono" title="attempts this chain stops">{Math.round((sc.outcome.resisted + sc.outcome.caught) * 100)}%</span>
              </button>
              {isOpen && (
                <div className="dd-steps">
                  {sc.cov.steps.map((st, i) => {
                    const segs = layersOf(st);
                    const defence = 1 - (1 - st.prevention) * (1 - st.detection);
                    const gap = 1 - defence;
                    const hue = (c: EffectClass) => (c === "Detective" ? "var(--color-state-info, var(--primary))" : "var(--color-state-success)");
                    return (
                      <div className="dd-step" key={st.step.id}>
                        <div className="dd-step-h">
                          <span className="dd-num">{i + 1}</span>
                          <span className="dd-step-name">{recordTitle(stepType, st.step)}</span>
                          <span className="dd-step-cov mono" style={{ color: defence > 0.6 ? "var(--color-state-success)" : defence > 0.3 ? "var(--color-state-warning)" : "var(--color-state-error)" }}>{Math.round(defence * 100)}%</span>
                        </div>
                        <div className="dd-bar" title={`${Math.round(st.prevention * 100)}% resisted, ${Math.round(st.detection * 100)}% watched, ${Math.round(gap * 100)}% open`}>
                          {segs.filter((s) => s.contrib > 0).map((s, j) => (
                            <span key={j} className="dd-seg" style={{ width: `${s.contrib * 100}%`, background: `color-mix(in oklch, ${hue(s.cls)} ${88 - j * 16}%, var(--bg-raised))` }}
                              title={`${mName(s.m)} — ${s.cls.toLowerCase()} · ${s.status || "status unset"} · implementation ${Math.round(s.impl * 100)}% · contributes ${Math.round(s.contrib * 100)}%`} />
                          ))}
                          {gap > 0.001 && <span className="dd-seg gap" style={{ width: `${gap * 100}%` }} title="open - nothing here blocks or detects an attacker" />}
                        </div>
                        <div className="dd-layers">
                          {segs.length ? segs.map((s) => (
                            <button key={s.m.id} className="chip link" onClick={() => setRec(s.m)}
                              title={`${s.cls}: ${EFFECT_CHANNEL[s.cls]}`}>
                              {mName(s.m)}
                              <span className={"dd-cls" + (s.contrib > 0 ? "" : " off")}>{s.cls.toLowerCase()}</span>
                              {s.status && s.status !== "Implemented" && <span className="dd-status"> · {s.status.toLowerCase()}</span>}
                            </button>
                          )) : <span className="dd-nogap">no measure - fully open</span>}
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
      {heat && <TacticExplain heat={heat} stepType={stepType} measureType={measureType}
        onOpen={(m) => { setHeat(null); setRec(m); }} onClose={() => setHeat(null)} />}
      {rec && <EntityModal type={getType(tax, rec.type)!} tax={tax} study={study} record={rec} onClose={() => setRec(null)} />}
    </div>
  );
}

// "Where does this percentage come from?" - the working behind one heatmap tile, spelled
// out step by step. The number is not a rating anybody typed; it falls out of which
// measures sit on the steps that use this tactic, so the tile has to be able to say so.
function TacticExplain({ heat, stepType, measureType, onOpen, onClose }: {
  heat: { tactic: string; scope: string; steps: HeatStep[] };
  stepType: EntityTypeDef; measureType: EntityTypeDef;
  onOpen: (m: EntityRecord) => void; onClose: () => void;
}) {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const mean = heat.steps.length ? heat.steps.reduce((a, s) => a + s.coverage, 0) / heat.steps.length : 0;
  return createPortal(
    <div className="overlay" onMouseDown={onClose}>
      <div className="ft-card" onMouseDown={(e) => e.stopPropagation()}>
        <header className="ft-head">
          <div>
            <div className="ft-eyebrow">TTP tactic · {heat.scope}</div>
            <h2>{heat.tactic} <span className="mono ft-val">{pct(mean)}</span></h2>
          </div>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close"><Icon.close /></button>
        </header>
        <div className="ft-body">
          <div className="tx-rows">
            {heat.steps.map((s) => {
              const def = 1 - (1 - s.st.prevention) * (1 - s.st.detection);
              return (
                <div className="tx-row" key={s.st.step.id}>
                  <div className="tx-name">
                    {recordTitle(stepType, s.st.step)}
                    <span className="tx-scn">{s.scenario}</span>
                  </div>
                  <div className={"tx-val mono" + (def > 0 ? "" : " zero")}>{pct(def)}</div>
                  <div className="tx-parts">
                    {def > 0
                      ? <>
                          <span>blocks <b>{pct(s.st.prevention)}</b></span>
                          <span>detects <b>{pct(s.st.detection)}</b></span>
                        </>
                      : <span className="tx-none">nothing blocks or detects an attacker here</span>}
                  </div>
                  <div className="tx-chips">
                    {s.st.measures.map((m) => (
                      <button className="chip link" key={m.id} onClick={() => onOpen(m)}
                        title={`${effectClassOf(m)}: ${EFFECT_CHANNEL[effectClassOf(m)]}`}>
                        {recordTitle(measureType, m)}<span className="dd-cls">{effectClassOf(m)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="tx-row tx-sum">
              <div className="tx-name">average of {heat.steps.length} step{heat.steps.length === 1 ? "" : "s"}</div>
              <div className="tx-val mono">{pct(mean)}</div>
            </div>
          </div>

          <div className="tx-formula mono">per step: 1 − (1 − blocks) × (1 − detects)</div>
          <p className="tx-note">
            A second measure on the same step closes part of what the first left open. Each counts for how far it is
            implemented and where it stands in its lifecycle.
          </p>
          <p className="tx-note">
            <b>Corrective, deterrent and avoidance measures are not counted here</b> — they act on a different factor.
            Corrective ones act on <b>the loss</b> (damage control: what the attack costs once it succeeds), deterrent
            and avoidance ones on <b>the number of attacks</b>. Both move the risk figures; neither changes whether a
            step is reached.
          </p>
          <p className="tx-note">
            This measures how consistently the tactic's steps are defended, not how likely an attack is to fail — that
            also depends on where those steps sit in the chain. See the ring.
          </p>
        </div>
      </div>
    </div>, document.body);
}
