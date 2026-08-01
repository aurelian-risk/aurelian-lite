// Quantitative risk as an interactive factor tree, one per operational scenario.
// Most factors are DERIVED from the qualitative model (scenario, risk source,
// kill-chain coverage) and carry a provenance chip; only the loss magnitudes are
// haptic distribution inputs. The Monte-Carlo (annual loss / ALE + loss-exceedance
// curve) recomputes live; an inherent<->residual toggle shows what the controls buy.
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { EntityRecord, Study, Taxonomy } from "../domain/types";
import { getType } from "../domain/taxonomy";
import { useStore } from "../domain/store";
import { simulate, type QuantInputs, type QuantResult, type Range } from "../domain/montecarlo";
import { deriveInputs, meanOf, type Coverage, type Prov } from "../domain/quantModel";
import { DistInput, fmtVal, type Unit } from "./DistInput";
import { FactorTrace } from "./FactorTrace";
import { EntityModal } from "./EntityModal";
import { Icon } from "./ui";

const UNIT: Record<keyof QuantInputs, Unit> = {
  threatActivity: "rate", attackProbability: "prob", adversaryStrength: "prob", controlStrength: "prob",
  directImpact: "money", cascadingLikelihood: "prob", cascadingImpact: "money",
};
export interface FConf { lo: number; hi: number; log: boolean }
const FCONF: Record<keyof QuantInputs, FConf> = {
  threatActivity: { lo: 0.05, hi: 100, log: true }, attackProbability: { lo: 0, hi: 1, log: false },
  adversaryStrength: { lo: 0, hi: 1, log: false }, controlStrength: { lo: 0, hi: 1, log: false },
  directImpact: { lo: 1e3, hi: 5e7, log: true }, cascadingLikelihood: { lo: 0, hi: 1, log: false },
  cascadingImpact: { lo: 1e3, hi: 5e7, log: true },
};

export function QuantificationView({ tax, study, color }: { tax: Taxonomy; study: Study; color: string }) {
  // Quantify per operational scenario (the type carrying a "difficulty" factor).
  const opType = tax.entityTypes.find((t) => t.fields.some((f) => f.key === "difficulty"));
  const stepType = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "ref" && f.refType) && t.fields.some((f) => f.type === "number"));
  const parentF = stepType?.fields.find((f) => f.type === "ref" && f.refType);
  const allOps = opType ? study.entities.filter((e) => e.type === opType.key
    && study.entities.some((s) => s.type === stepType?.key && s.values[parentF?.key ?? ""] === e.id)) : [];
  const { toggleQuantScenario } = useStore();
  const enabledIds = study.quantScenarios ?? [];
  // Quantification is opt-in: only scenarios the user added get monetary figures.
  const ops = allOps.filter((o) => enabledIds.includes(o.id));
  const available = allOps.filter((o) => !enabledIds.includes(o.id));
  const [open, setOpen] = useState(0);
  const [adding, setAdding] = useState(false);
  if (!opType || !allOps.length) return null;

  return (
    <div className="panel ws-accent" style={{ ["--ws-color" as string]: color, marginBottom: 20 }}>
      <div className="panel-head">
        <h3>Quantitative risk</h3>
        <span className="badge">{ops.length}</span>
        <span className="spacer" />
        <span className="hint" style={{ marginRight: 8 }}>opt-in per scenario</span>
        <div style={{ position: "relative" }}>
          <button className="btn sm" disabled={!available.length} onClick={() => setAdding((v) => !v)}><Icon.plus /> Add scenario</button>
          {adding && available.length > 0 && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setAdding(false)} />
              <div className="menu-pop" style={{ width: 320 }}>
                <div className="menu-label">Add a scenario to quantify</div>
                {available.map((o) => (
                  <button className="menu-item" key={o.id} onClick={() => { toggleQuantScenario(o.id, true); setAdding(false); }}>
                    <Icon.plus /> {String(o.values.name ?? "Scenario")}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <div className="panel-body" style={{ padding: "6px 18px 12px" }}>
        {ops.length === 0 ? (
          <div className="empty" style={{ padding: "26px 8px" }}>
            <h3>No scenarios quantified yet</h3>
            Quantification is opt-in - it derives a monetary annual-loss figure only for the scenarios you choose. Use <b>Add scenario</b> to pick the operational scenarios to quantify.
          </div>
        ) : ops.map((op, i) => {
          const isOpen = open === i;
          return (
            <div className="qt-acc" key={op.id}>
              <div className="qt-acc-h-row">
                <button className={"qt-acc-h" + (isOpen ? " open" : "")} onClick={() => setOpen(isOpen ? -1 : i)}>
                  <span className={"caret" + (isOpen ? " open" : "")}><Icon.chevron /></span>
                  <span className="qt-acc-name">{String(op.values.name ?? "Scenario")}</span>
                </button>
                <button className="qt-acc-rm" title="Remove from quantification" onClick={() => toggleQuantScenario(op.id, false)}><Icon.close /></button>
              </div>
              {isOpen && <QuantTree tax={tax} study={study} op={op} color={color} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const c01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ITER = 50000;   // Monte-Carlo iterations per run (both with- and without-controls)

function QuantTree({ tax, study, op, color }: { tax: Taxonomy; study: Study; op: EntityRecord; color: string }) {
  const [residual, setResidual] = useState(true);
  const [trace, setTrace] = useState<keyof QuantInputs | null>(null);
  const [modal, setModal] = useState<EntityRecord | null>(null);
  // Two derivations: with controls (residual) and without (inherent). They differ
  // ONLY in control strength - that is exactly what the controls buy.
  const derivedWith = useMemo(() => deriveInputs(study, tax, op, true), [study, tax, op]);
  const derivedWithout = useMemo(() => deriveInputs(study, tax, op, false), [study, tax, op]);
  const derived = residual ? derivedWith : derivedWithout;  // the one the tree shows
  // Every factor is adjustable: derived defaults + per-factor user overrides.
  // Overrides are study-specific and persisted per op scenario (the derived values
  // themselves come parametrically from the study inputs, so they need no storage).
  const { setQuantTuning } = useStore();
  const [overrides, setOverrides] = useState<Partial<Record<keyof QuantInputs, Range>>>(
    () => (study.quant?.[op.id]?.overrides as Partial<Record<keyof QuantInputs, Range>>) ?? {},
  );
  const seeded = useRef(false);
  useEffect(() => {                                    // write overrides back to the study (debounced)
    if (!seeded.current) { seeded.current = true; return; }
    const t = window.setTimeout(() => {
      setQuantTuning(op.id, Object.keys(overrides).length ? { overrides } : null);
    }, 400);
    return () => window.clearTimeout(t);
  }, [overrides, op.id, setQuantTuning]);
  const inputs: QuantInputs = { ...derived.inputs, ...overrides };
  const inputsWith: QuantInputs = { ...derivedWith.inputs, ...overrides };
  const inputsWithout: QuantInputs = { ...derivedWithout.inputs, ...overrides };
  const setOv = (k: keyof QuantInputs) => (r: Range) => setOverrides((p) => ({ ...p, [k]: r }));
  const resetOv = (k: keyof QuantInputs) => () => setOverrides((p) => { const n = { ...p }; delete n[k]; return n; });

  const [resWith, setResWith] = useState<QuantResult | null>(null);
  const [resWithout, setResWithout] = useState<QuantResult | null>(null);
  const [computing, setComputing] = useState(false);
  const [computeMs, setComputeMs] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const key = JSON.stringify(inputsWith) + "|" + JSON.stringify(inputsWithout);
  useEffect(() => {
    setComputing(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const t0 = performance.now();
      setResWith(simulate(inputsWith, ITER));
      setResWithout(simulate(inputsWithout, ITER));
      setComputeMs(performance.now() - t0);
      setComputing(false);
    }, 120);
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const result = residual ? resWith : resWithout;           // the active headline result

  const M = (k: keyof QuantInputs) => meanOf(inputs[k]);
  // TEF / Vulnerability / LEF come from the simulation itself (Vulnerability is the
  // empirical P(adversary > control)); fall back to a rough estimate until it runs.
  const tef = result?.tef ?? M("threatActivity") * M("attackProbability");
  const vuln = result?.vuln ?? c01(M("adversaryStrength") - M("controlStrength") + 0.5);
  const lef = result?.lef ?? tef * vuln;
  const primary = M("directImpact");
  const secondary = M("cascadingLikelihood") * M("cascadingImpact");
  const nodes = { tef, vuln, lef, primary, secondary, lm: primary + secondary, ale: result?.ale.mean ?? primary + secondary };

  // What the controls buy: they raise control strength (via kill-chain coverage),
  // which lowers vulnerability and shifts the whole loss curve down.
  const cov = derivedWith.coverage;
  const csWith = meanOf(derivedWith.inputs.controlStrength), csWithout = meanOf(derivedWithout.inputs.controlStrength);
  const benefit = resWith && resWithout ? resWithout.ale.mean - resWith.ale.mean : 0;
  const benefitPct = resWithout && resWithout.ale.mean > 0 ? Math.round((benefit / resWithout.ale.mean) * 100) : 0;

  return (
    <div className="qt">
      <div className="qt-top">
        <div className="qt-risk">
          <div className="qt-risk-k">Annual loss (ALE) · {residual ? "residual" : "inherent"}</div>
          <div className={"qt-risk-v mono" + (computing ? " computing" : "")}>{result ? fmtVal(result.ale.mean, "money") : "…"}</div>
          {result && <div className="qt-risk-sub mono">P50 {fmtVal(result.ale.p50, "money")} · P90 {fmtVal(result.ale.p90, "money")} · P99 {fmtVal(result.ale.p99, "money")}</div>}
          <div className="qt-toggle">
            <button className={"seg-btn" + (!residual ? " on" : "")} onClick={() => setResidual(false)}>Inherent (no controls)</button>
            <button className={"seg-btn" + (residual ? " on" : "")} onClick={() => setResidual(true)}>Residual (with controls)</button>
          </div>
          {benefit > 0 && <div className="qt-delta">controls cut the mean annual loss by {fmtVal(benefit, "money")} → -{benefitPct}%</div>}
        </div>
      </div>
      {resWith && resWithout && <LossDistribution resultWith={resWith} resultWithout={resWithout} active={residual ? "with" : "without"} accent={color}
        cov={cov} csWith={csWith} csWithout={csWithout} benefit={benefit} onTraceControls={() => setTrace("controlStrength")} />}

      <div className="qt-tree">
        <NodeRow op="×" title="Loss event frequency" value={fmtVal(lef, "rate")} />
        <div className="qt-sub">
          <NodeRow op="×" title="Threat event frequency" value={fmtVal(tef, "rate")} />
          <div className="qt-sub">
            <LeafRow title="Contact frequency" value={fmtVal(M("threatActivity"), "rate")} prov={derived.prov.threatActivity} onTrace={() => setTrace("threatActivity")} />
            <LeafRow title="Probability of action" value={fmtVal(M("attackProbability"), "prob")} prov={derived.prov.attackProbability} onTrace={() => setTrace("attackProbability")} />
          </div>
          <NodeRow op="vs" title="Vulnerability" value={fmtVal(vuln, "prob")} />
          <div className="qt-sub">
            <LeafRow title="Adversary strength" value={fmtVal(M("adversaryStrength"), "prob")} prov={derived.prov.adversaryStrength} onTrace={() => setTrace("adversaryStrength")} />
            <LeafRow title="Control strength" value={fmtVal(M("controlStrength"), "prob")} prov={derived.prov.controlStrength} onTrace={() => setTrace("controlStrength")} />
          </div>
        </div>
        <NodeRow op="+" title="Loss magnitude" value={fmtVal(primary + secondary, "money")} />
        <div className="qt-sub">
          <MoneyRow title="Direct impact" value={inputs.directImpact} onChange={setOv("directImpact")} unit="money" lo={1e3} hi={5e7} log accent={color} prov={derived.prov.directImpact} onTrace={() => setTrace("directImpact")} />
          <NodeRow op="×" title="Secondary risk" value={fmtVal(secondary, "money")} />
          <div className="qt-sub">
            <MoneyRow title="Cascading likelihood" value={inputs.cascadingLikelihood} onChange={setOv("cascadingLikelihood")} unit="prob" lo={0} hi={1} accent={color} prov={derived.prov.cascadingLikelihood} onTrace={() => setTrace("cascadingLikelihood")} />
            <MoneyRow title="Cascading impact" value={inputs.cascadingImpact} onChange={setOv("cascadingImpact")} unit="money" lo={1e3} hi={5e7} log accent={color} prov={derived.prov.cascadingImpact} onTrace={() => setTrace("cascadingImpact")} />
          </div>
        </div>
      </div>
      <div className="qt-note">
        {computing ? "simulating…" : <>{(ITER * 2).toLocaleString("en-US")} simulated years{computeMs ? ` in ${computeMs < 1 ? "<1" : Math.round(computeMs)} ms` : ""}</>}
        {" · "}drag any curve to tune a factor - saved with the study · derived values come from the study inputs
      </div>
      {trace && <FactorTrace fkey={trace} range={inputs[trace]} vals={{
        contact: M("threatActivity"), prob: M("attackProbability"), adv: M("adversaryStrength"), ctl: M("controlStrength"),
        tef, vuln, lef, direct: primary, cascL: M("cascadingLikelihood"), cascI: M("cascadingImpact"),
        secondary, lm: primary + secondary, ale: nodes.ale,
      }} derived={derived} tax={tax} unit={UNIT[trace]} conf={FCONF[trace]} accent={color}
        overridden={trace in overrides} onChange={setOv(trace)} onReset={resetOv(trace)} onOpenEntity={setModal} onClose={() => setTrace(null)} />}
      {modal && <EntityModal type={getType(tax, modal.type)!} tax={tax} study={study} record={modal}
        onClose={() => { setModal(null); setTrace(null); }} onBack={() => setModal(null)} backLabel="Factor" />}
    </div>
  );
}

function ProvChip({ prov, onClick }: { prov: Prov; onClick?: () => void }) {
  const cls = "chip" + (onClick ? " link" : "") + (prov.estimated ? " qt-prov-est" : "");
  const inner = <>{prov.icon} {prov.source}{prov.label && prov.label !== "estimate" ? ` · ${prov.label}` : ""}</>;
  return onClick
    ? <button type="button" className={cls} onClick={onClick} title="Trace / adjust this factor">{inner}</button>
    : <span className={cls} title={`${prov.source}: ${prov.label}`}>{inner}</span>;
}

// A composed node: the operator badge shows how its children combine (× / + / vs).
function NodeRow({ op, title, value }: { op: string; title: string; value: string }) {
  return (
    <div className="qt-row qt-node-row">
      <span className="qt-opb mono" title="how the children below combine">{op}</span>
      <span className="qt-rname">{title}</span>
      <span className="qt-rval mono">{value}</span>
    </div>
  );
}

function LeafRow({ title, value, prov, onTrace }: { title: string; value: string; prov: Prov; onTrace?: () => void }) {
  return (
    <div className="qt-row qt-leaf-row">
      <span className="qt-rname leaf">{title}</span>
      <span className="qt-rval mono">{value}</span>
      <ProvChip prov={prov} onClick={onTrace} />
    </div>
  );
}

function MoneyRow({ title, value, onChange, unit, lo, hi, log, accent, prov, onTrace }: {
  title: string; value: Range; onChange: (r: Range) => void; unit: Unit; lo: number; hi: number; log?: boolean; accent: string; prov: Prov; onTrace?: () => void;
}) {
  return (
    <div className="qt-row qt-money-row">
      <div className="qt-money-in"><DistInput label={title} value={value} onChange={onChange} unit={unit} lo={lo} hi={hi} log={log} accent={accent} /></div>
      <ProvChip prov={prov} onClick={onTrace} />
    </div>
  );
}

// The simulated annual-loss distribution (Monte-Carlo output), read-only. It
// overlays BOTH runs so the effect of the controls is visible: "without controls"
// (inherent, ghosted) sits to the right at higher losses; "with controls"
// (residual, filled) is pulled left. The mean of each is marked and the gap
// between them is what the controls buy. Below it, the control chain is spelled
// out (kill-chain coverage -> control strength -> loss reduction).
function LossDistribution({ resultWith, resultWithout, active, accent, cov, csWith, csWithout, benefit, onTraceControls }: {
  resultWith: QuantResult; resultWithout: QuantResult; active: "with" | "without"; accent: string;
  cov: Coverage; csWith: number; csWithout: number; benefit: number; onTraceControls: () => void;
}) {
  const W = 520, H = 214, PL = 20, PB = 36, PT = 28, PR = 18;
  const base = H - PB, plotH = H - PT - PB;
  // LOG x-axis (loss is heavy-tailed): a common €-range covering both runs so the
  // long right tail is visible instead of a clamped spike.
  const lo = Math.max(1, Math.min(resultWith.histRange.lo, resultWithout.histRange.lo));
  const hi = Math.max(resultWith.histRange.hi, resultWithout.histRange.hi, lo * 10);
  const Llo = Math.log10(lo), Lspan = Math.log10(hi) - Llo || 1;
  const X = (loss: number) => PL + ((Math.log10(Math.max(loss, lo)) - Llo) / Lspan) * (W - PL - PR);
  const maxP = Math.max(...resultWith.hist.map((h) => h.p), ...resultWithout.hist.map((h) => h.p), 1e-9);
  const Yp = (p: number) => base - (p / maxP) * plotH;
  const areaOf = (h: QuantResult["hist"]) => `M ${X(h[0].loss).toFixed(1)} ${base} ` + h.map((d) => `L ${X(d.loss).toFixed(1)} ${Yp(d.p).toFixed(1)}`).join(" ") + ` L ${X(h[h.length - 1].loss).toFixed(1)} ${base} Z`;
  const lineOf = (h: QuantResult["hist"]) => h.map((d, i) => `${i ? "L" : "M"} ${X(d.loss).toFixed(1)} ${Yp(d.p).toFixed(1)}`).join(" ");
  const mWith = resultWith.ale.mean, mWithout = resultWithout.ale.mean;
  const warn = "var(--color-state-warning)";
  const withEmph = active === "with";
  // €-ticks (1-2-5 per decade) within the range - the log-axis reference points.
  const ticks: number[] = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++)
    for (const mant of [1, 2, 5]) { const t = mant * Math.pow(10, e); if (t >= lo * 0.999 && t <= hi * 1.001) ticks.push(t); }

  return (
    <div className="qt-dist">
      <div className="qt-dist-head">
        <span className="qt-shift-lbl">Simulated annual-loss distribution</span>
        <span className="qt-dist-legend">
          <span className="qt-lg"><i style={{ background: accent }} />with controls</span>
          <span className="qt-lg"><i className="ghost" style={{ borderColor: warn }} />without</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="qv-dist" role="img" aria-label="simulated annual loss distribution (log scale), with vs without controls">
        <line x1={PL} y1={base} x2={W - PR} y2={base} stroke="var(--border)" />
        {/* log-decade gridlines (drawn first, behind the curves) */}
        {ticks.map((t) => <line key={"g" + t} x1={X(t)} y1={PT} x2={X(t)} y2={base} stroke="var(--border)" strokeOpacity={0.45} />)}
        {/* without-controls (inherent), ghosted */}
        <path d={areaOf(resultWithout.hist)} fill={warn} fillOpacity={withEmph ? 0.06 : 0.14} />
        <path d={lineOf(resultWithout.hist)} fill="none" stroke={warn} strokeWidth={withEmph ? 1 : 1.8} strokeDasharray="4 3" strokeOpacity={0.85} />
        {/* with-controls (residual), filled */}
        <path d={areaOf(resultWith.hist)} fill={accent} fillOpacity={withEmph ? 0.2 : 0.1} />
        <path d={lineOf(resultWith.hist)} fill="none" stroke={accent} strokeWidth={withEmph ? 2 : 1.2} />
        {/* arrow from without-mean to with-mean: the shift the controls cause */}
        {mWithout > mWith && (
          <g>
            <line x1={X(mWithout)} y1={PT + 4} x2={X(mWith)} y2={PT + 4} stroke="var(--fg-subtle)" strokeWidth={1} markerEnd="" />
            <path d={`M ${X(mWith) + 6} ${PT + 1} L ${X(mWith)} ${PT + 4} L ${X(mWith) + 6} ${PT + 7}`} fill="none" stroke="var(--fg-subtle)" strokeWidth={1} />
            <text x={(X(mWith) + X(mWithout)) / 2} y={PT - 2} textAnchor="middle" className="qv-ax">controls -{fmtVal(benefit, "money")}</text>
          </g>
        )}
        {[{ m: mWithout, c: warn, l: "mean (no ctrl)" }, { m: mWith, c: accent, l: "mean" }].map((d, i) => (
          <Fragment key={i}>
            <line x1={X(d.m)} y1={PT + 6} x2={X(d.m)} y2={base} stroke={d.c} strokeWidth={1.4} />
            <circle cx={X(d.m)} cy={PT + 6} r={2.5} fill={d.c} />
          </Fragment>
        ))}
        {ticks.map((t) => <text key={"t" + t} x={X(t)} y={H - 14} textAnchor="middle" className="qv-ax">{fmtVal(t, "money")}</text>)}
        <text x={W - PR} y={H - 2} textAnchor="end" className="qv-ax" fillOpacity={0.75}>annual loss (log €) →</text>
      </svg>
      <button type="button" className="qt-ctrl-note" onClick={onTraceControls} title="Trace the control strength">
        <b>{cov.mitigated}/{cov.total}</b> kill-chain steps mitigated{cov.total ? ` (avg impl ${Math.round(cov.impl * 100)}%)` : ""} → control strength
        {" "}<span style={{ color: warn }}>{Math.round(csWithout * 100)}%</span> → <span style={{ color: accent }}>{Math.round(csWith * 100)}%</span>,
        {" "}lowering vulnerability and cutting the mean loss by {fmtVal(benefit, "money")}. <span className="qt-ctrl-more">trace →</span>
      </button>
    </div>
  );
}
