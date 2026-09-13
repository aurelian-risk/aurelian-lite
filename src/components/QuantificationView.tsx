// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Quantitative risk as an interactive factor tree, one per operational scenario.
// Most factors are DERIVED from the qualitative model (scenario, risk source,
// kill-chain coverage) and carry a provenance chip; only the loss magnitudes are
// haptic distribution inputs. The Monte-Carlo (annual loss / ALE + loss-exceedance
// curve) recomputes live; an inherent<->residual toggle shows what the controls buy.
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { t as tr } from "../domain/i18n";
import { createPortal } from "react-dom";
import type { EntityRecord, Study, Taxonomy } from "../domain/types";
import { getType, isSetBack, recordTitle, scaleLabel, scaleMax } from "../domain/taxonomy";
import { useStore } from "../domain/store";
import { DEFAULT_CALIBRATION, type Calibration } from "../domain/calibration";
import { simulate, type ChainStep, type Pace, type QuantInputs, type QuantResult, type Range } from "../domain/montecarlo";
import { deriveInputs, meanOf, measureEfficacyOf, measureStrengthOf, type Derived, type Prov } from "../domain/quantModel";
import { effectClassOf, effectChannel } from "../domain/controls";
import type { DemandBreakdown } from "../domain/demand";
import { likelihoodCheck } from "../domain/frequency";
import { DistInput, fmtVal, type Unit } from "./DistInput";
import { FactorTrace } from "./FactorTrace";
import { EntityModal } from "./EntityModal";
import { Icon, Overlay } from "./ui";
import { copyText, quantLlmMarkdown } from "../domain/clipboard";
import { carriers, sensitivityOf, type Sensitivity } from "../domain/sensitivity";
import { measureWorth, type WorthResult } from "../domain/worth";
import { logTicks } from "../domain/viz";

const UNIT: Record<keyof QuantInputs, Unit> = {
  attemptRate: "rate", adversaryStrength: "prob", controlStrength: "prob",
  directImpact: "money", cascadingLikelihood: "prob", cascadingImpact: "money", respondDays: "days",
};
export interface FConf { lo: number; hi: number; log: boolean }
const FCONF: Record<keyof QuantInputs, FConf> = {
  attemptRate: { lo: 0.005, hi: 100, log: true },
  adversaryStrength: { lo: 0, hi: 1, log: false }, controlStrength: { lo: 0, hi: 1, log: false },
  directImpact: { lo: 1e3, hi: 5e7, log: true }, cascadingLikelihood: { lo: 0, hi: 1, log: false },
  cascadingImpact: { lo: 1e3, hi: 5e7, log: true },
  respondDays: { lo: 0.01, hi: 120, log: true },
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
  // Quantification is opt-in: only scenarios the user added get monetary figures. And a
  // scenario taken out of scope is out of the figures whether or not it was opted in -
  // otherwise the view would answer a question the study has withdrawn. The opt-in is not
  // cleared: put the scenario back in scope and its figures come back with it.
  const ops = allOps.filter((o) => enabledIds.includes(o.id) && !isSetBack(tax, o));
  const available = allOps.filter((o) => !enabledIds.includes(o.id) && !isSetBack(tax, o));
  // Why the "add" button is off, when it is: either they are all in already, or what is
  // left has been set back and is not part of this study's picture.
  const setBackLeft = allOps.filter((o) => !enabledIds.includes(o.id) && isSetBack(tax, o)).length;
  // No count in the wording on purpose: this view keeps its English, and a counted phrase
  // would be the one English-only entry in a table that is otherwise complete in both.
  const whyNoneLeft = available.length ? undefined
    : setBackLeft
      ? tr("ui.quantification.rest-set-back", "What is left has been set back, so it is not part of this study's picture.")
      : tr("ui.quantification.all-quantified", "Every operational scenario is already quantified.");
  const [open, setOpen] = useState(0);
  const [adding, setAdding] = useState(false);
  if (!opType || !allOps.length) return null;

  return (
    <>
    <div className="panel ws-accent" style={{ ["--ws-color" as string]: color, marginBottom: 20 }}>
      <div className="panel-head">
        <h3>{tr('ui.quantification.quantitative-risk', 'Quantitative risk')}</h3>
        <span className="badge">{ops.length}</span>
        <span className="spacer" />
        <span className="hint" style={{ marginRight: 8 }}>opt-in per scenario</span>
        <div style={{ position: "relative" }}>
          {/* Refused with a reason. This was the one disabled control in the application
              that said nothing, and there are two different reasons it can be off. */}
          <button className="btn sm" disabled={!available.length} title={whyNoneLeft}
            onClick={() => setAdding((v) => !v)}><Icon.plus /> {tr('ui.quantification.add-scenario', 'Add scenario')}</button>
          {adding && available.length > 0 && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setAdding(false)} />
              <div className="menu-pop" style={{ width: 320 }}>
                <div className="menu-label">{tr('ui.quantification.add-a-scenario-to', 'Add a scenario to quantify')}</div>
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
            <h3>{tr('ui.quantification.no-scenarios-quantified-yet', 'No scenarios quantified yet')}</h3>
            {tr('ui.quantification.quantification-is-opt-in', 'Quantification is opt-in - it derives a monetary annual-loss figure only for the scenarios you choose. Use')} <b>{tr('ui.quantification.add-scenario', 'Add scenario')}</b> to pick the operational scenarios to quantify.
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
                <button className="qt-acc-rm" title={tr('ui.quantification.remove-from-quantification', 'Remove from quantification')} onClick={() => toggleQuantScenario(op.id, false)}><Icon.close /></button>
              </div>
              {isOpen && <QuantTree tax={tax} study={study} op={op} color={color} />}
            </div>
          );
        })}
      </div>
    </div>
    {ops.length > 0 && <WorthPanel tax={tax} study={study} ops={ops} color={color} />}
    </>
  );
}

// ── What each measure buys ────────────────────────────────────────────────────
//
// The ranking a budget meeting asks for: loss avoided per year by each measure attached
// to the quantified scenarios, today and once the measure is complete, against what it
// costs. Computed on demand - it is two simulations per measure per scenario - and the
// rows are the headline's own arithmetic with one measure taken out or finished.
function WorthPanel({ tax, study, ops, color }: { tax: Taxonomy; study: Study; ops: EntityRecord[]; color: string }) {
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState<WorthResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [rec, setRec] = useState<EntityRecord | null>(null);
  const cal = study.calibration ?? DEFAULT_CALIBRATION;
  const key = JSON.stringify(study.entities) + "|" + JSON.stringify(study.quant) + "|" + ops.map((o) => o.id).join() + "|" + JSON.stringify(cal);
  useEffect(() => { setRes(null); }, [key]);
  useEffect(() => {
    if (!open || res) return;
    setBusy(true);
    const t = window.setTimeout(() => { setRes(measureWorth(study, tax, ops, cal)); setBusy(false); }, 30);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, res, key]);
  const mType = (m: EntityRecord) => getType(tax, m.type)!;
  const anyCost = !!res?.rows.some((r) => r.costPerYear != null);
  const state = (m: EntityRecord) => {
    const t = mType(m);
    const implF = t.fields.find((f) => f.key === "implementation_level"), statusF = t.fields.find((f) => f.key === "status");
    const st = statusF ? String(m.values[statusF.key] ?? "") : "";
    const lv = implF && typeof m.values[implF.key] === "number" ? scaleLabel(implF, m.values[implF.key] as number, t) : "";
    return [st.toLowerCase(), lv].filter(Boolean).join(" · ");
  };
  return (
    <div className="panel ws-accent qt-worth" style={{ ["--ws-color" as string]: color, marginBottom: 20 }}>
      <button type="button" className="panel-head qt-worth-h" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={"caret" + (open ? " open" : "")}><Icon.chevron /></span>
        <h3>What each measure buys</h3>
        <span className="spacer" />
        <span className="hint">loss avoided per year, today and once complete, against what it costs</span>
      </button>
      {open && (
        <div className="panel-body qt-worth-b">
          {!res ? <div className="hint" style={{ padding: "8px 0" }}>{busy ? "computing…" : ""}</div> : !res.rows.length ? (
            <div className="hint" style={{ padding: "8px 0" }}>No measure is attached to a quantified scenario yet - put measures on the chain's steps or its assets.</div>
          ) : (
            <>
              <p className="qt-worth-read">
                {(() => {
                  const top = res.rows[0];
                  const nm = recordTitle(mType(top.measure), top.measure);
                  const gain = top.complete ? top.avoided : top.avoidedIfComplete;
                  return top.complete
                    ? `${nm} is worth the most today: ${fmtVal(gain, "money")} a year of loss that would otherwise be carried.`
                    : `Finishing ${nm} buys the most: ${fmtVal(gain, "money")} a year, against ${fmtVal(top.avoided, "money")} it buys as it stands.`;
                })()}
                {anyCost ? " Ranked by loss avoided per euro of yearly cost where a cost is given." : " No measure carries a cost yet; ranked by loss avoided. Enter costs on the measures to rank per euro."}
              </p>
              <div className="qt-worth-tbl-wrap">
                <table className="tbl qt-worth-tbl">
                  <thead><tr>
                    <th>Measure</th><th>Class · state</th><th className="num">avoids today</th><th className="num">once complete</th>
                    <th className="num">cost / yr</th><th className="num">per €, today</th><th className="num">per €, complete</th>
                  </tr></thead>
                  <tbody>
                    {res.rows.map((r) => {
                      const quiet = Math.max(r.avoided, r.avoidedIfComplete) <= 3 * res.noise;
                      return (
                        <tr key={r.measure.id} className={"row-clickable" + (quiet ? " qt-worth-quiet" : "")} onClick={() => setRec(r.measure)}
                          title={quiet ? "within the simulation's own noise - not a finding about this measure" : "open the measure"}>
                          <td>{recordTitle(mType(r.measure), r.measure)}</td>
                          <td className="qt-worth-state">{String(r.measure.values.measure_type ?? "unclassified")} · {state(r.measure)}</td>
                          <td className="num mono">{fmtVal(r.avoided, "money")}</td>
                          <td className="num mono">{r.complete ? <span className="hint">complete</span> : fmtVal(r.avoidedIfComplete, "money")}</td>
                          <td className="num mono">{r.costPerYear != null ? fmtVal(r.costPerYear, "money") : <span className="hint">—</span>}</td>
                          <td className="num mono">{r.perEuro != null ? `${r.perEuro.toFixed(1)}×` : <span className="hint">—</span>}</td>
                          <td className="num mono">{r.perEuroIfComplete != null && !r.complete ? `${r.perEuroIfComplete.toFixed(1)}×` : <span className="hint">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="qb-foot">
                <span>the study's quantified scenarios carry {fmtVal(res.base, "money")} a year · simulation noise ±{fmtVal(res.noise, "money")} · a one-off cost is spread over {res.horizonYears} years · {res.iterations.toLocaleString()} years per run</span>
              </div>
            </>
          )}
        </div>
      )}
      {rec && <EntityModal type={getType(tax, rec.type)!} tax={tax} study={study} record={rec} onClose={() => setRec(null)} />}
    </div>
  );
}

const c01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ITER = 50000;   // Monte-Carlo iterations per run (both with- and without-controls)

function QuantTree({ tax, study, op, color }: { tax: Taxonomy; study: Study; op: EntityRecord; color: string }) {
  const [residual, setResidual] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [trace, setTrace] = useState<keyof QuantInputs | null>(null);
  const [modal, setModal] = useState<EntityRecord | null>(null);
  // Two derivations: with controls (residual) and without (inherent). They differ
  // ONLY in control strength - that is exactly what the controls buy.
  const cal = study.calibration ?? DEFAULT_CALIBRATION;
  const derivedWith = useMemo(() => deriveInputs(study, tax, op, true, cal), [study, tax, op, cal]);
  const derivedWithout = useMemo(() => deriveInputs(study, tax, op, false, cal), [study, tax, op, cal]);
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
  // An override replaces the three points, not the reading: a money factor stays
  // lognormal however the points were typed, and an override saved before the reading
  // existed is read the way the derived factor is now.
  const applyOv = (d: QuantInputs): QuantInputs => {
    const out = { ...d };
    for (const k of Object.keys(overrides) as (keyof QuantInputs)[]) {
      const ov = overrides[k]; if (!ov) continue;
      out[k] = { ...ov, ...(d[k].dist ? { dist: d[k].dist } : {}) };
    }
    return out;
  };
  const inputs: QuantInputs = applyOv(derived.inputs);
  const inputsWith: QuantInputs = applyOv(derivedWith.inputs);
  const inputsWithout: QuantInputs = applyOv(derivedWithout.inputs);
  const setOv = (k: keyof QuantInputs) => (r: Range) => setOverrides((p) => ({ ...p, [k]: r }));
  const resetOv = (k: keyof QuantInputs) => () => setOverrides((p) => { const n = { ...p }; delete n[k]; return n; });

  const [resWith, setResWith] = useState<QuantResult | null>(null);
  const [resWithout, setResWithout] = useState<QuantResult | null>(null);
  const [computing, setComputing] = useState(false);
  const [computeMs, setComputeMs] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  // The chain is part of the model, not of the inputs, so it has to be in the key too -
  // otherwise re-pointing a measure at another step would leave a stale result on screen.
  const key = JSON.stringify(inputsWith) + "|" + JSON.stringify(inputsWithout) + "|" + JSON.stringify(derivedWith.chain);
  useEffect(() => {
    setComputing(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const t0 = performance.now();
      setResWith(simulate(inputsWith, ITER, derivedWith.chain, undefined, cal.time));
      setResWithout(simulate(inputsWithout, ITER, derivedWithout.chain, undefined, cal.time));
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
  const tef = result?.tef ?? M("attemptRate");
  const vuln = result?.vuln ?? c01(M("adversaryStrength") - M("controlStrength") + 0.5);
  const lef = result?.lef ?? tef * vuln;
  const primary = M("directImpact");
  const secondary = M("cascadingLikelihood") * M("cascadingImpact");
  const nodes = { tef, vuln, lef, primary, secondary, lm: primary + secondary, ale: result?.ale.mean ?? primary + secondary };

  // What the controls buy. NOT a higher control strength any more - that is the
  // scenario baseline and is the same either way. The controls sit ON the chain, so
  // what they buy is measured by where the attempts now die.
  // The likelihood rating is no longer an input, which makes it usable as a check: the
  // model reaches its own answer and the two can be compared without circularity.
  const lkF = getType(tax, op.type)?.fields.find((f) => f.key === "likelihood");
  const lkCheck = lkF && residual && result
    ? likelihoodCheck(lef, typeof op.values.likelihood === "number" ? op.values.likelihood : null, cal.frequency, scaleMax(lkF))
    : null;

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
            <button className={"seg-btn" + (!residual ? " on" : "")} onClick={() => setResidual(false)}>{tr('ui.quantification.inherent-no-controls', 'Inherent (no controls)')}</button>
            <button className={"seg-btn" + (residual ? " on" : "")} onClick={() => setResidual(true)}>{tr('ui.quantification.residual-with-controls', 'Residual (with controls)')}</button>
          </div>
          {benefit > 0 && <div className="qt-delta">controls cut the mean annual loss by {fmtVal(benefit, "money")} → -{benefitPct}%</div>}
          <button className="btn sm qt-llm" onClick={() => {
            void copyText(quantLlmMarkdown(tax, study)).then((okd) => setCopied(okd ? "copied" : "copy failed"));
            setTimeout(() => setCopied(null), 2500);
          }} title={tr('ui.quantification.the-full-quantification-as', 'The full quantification as text: the rules, the parameters in force, every derived term, the chain, the results and the stated limits')}>
            {copied ?? tr("ui.quantification.copy-for-an-llm", "Copy for an LLM")}
          </button>
          {lkCheck?.diverges && (
            <div className="qt-crosscheck">
              {tr('ui.quantification.you-rated-this-scenario', 'You rated this scenario')} <b>{scaleLabel(lkF!, lkCheck.ratedLevel!)}</b>; working from the
              actor and the chain, the model arrives at <b>{scaleLabel(lkF!, lkCheck.modelLevel)}</b>
              {" "}({lef > 0 ? `about one loss event every ${Math.round(1 / lef)} years` : "no loss events"}).
              The rating is not used in the calculation, so this is a genuine second opinion -
              worth resolving in one direction or the other.
            </div>
          )}
        </div>
      </div>
      {resWith && resWithout && <LossDistribution resultWith={resWith} resultWithout={resWithout} active={residual ? "with" : "without"} accent={color}
        derived={derivedWith} tax={tax} cal={cal} benefit={benefit} onTraceControls={() => setTrace("controlStrength")} />}
      {resWith && <Tornado inputs={inputsWith} chain={derivedWith.chain} derived={derivedWith} tax={tax} pace={cal.time} />}

      <div className="qt-tree">
        <NodeRow op="×" title={tr('ui.quantification.loss-event-frequency', 'Loss event frequency')} value={fmtVal(lef, "rate")} />
        <div className="qt-sub">
          <LeafRow title={tr('ui.quantification.attempts-per-year', 'Attempts per year')} value={fmtVal(M("attemptRate"), "rate")} prov={derived.prov.attemptRate} onTrace={() => setTrace("attemptRate")} />
          <NodeRow op="vs" title={tr('ui.quantification.vulnerability', 'Vulnerability')} value={fmtVal(vuln, "prob")} />
          <div className="qt-sub">
            <LeafRow title={tr('ui.quantification.attacker-capability', 'Attacker capability')} value={fmtVal(M("adversaryStrength"), "prob")} prov={derived.prov.adversaryStrength} onTrace={() => setTrace("adversaryStrength")} />
            <LeafRow title={tr('ui.quantification.what-an-attempt-has', 'What an attempt has to beat')} value={fmtVal(M("controlStrength"), "prob")} prov={derived.prov.controlStrength} onTrace={() => setTrace("controlStrength")} />
          </div>
        </div>
        <NodeRow op="+" title={tr('ui.quantification.loss-magnitude', 'Loss magnitude')} value={fmtVal(primary + secondary, "money")} />
        <div className="qt-sub">
          <MoneyRow title={tr('ui.quantification.direct-impact', 'Direct impact')} value={inputs.directImpact} onChange={setOv("directImpact")} unit="money" lo={1e3} hi={5e7} log accent={color} prov={derived.prov.directImpact} onTrace={() => setTrace("directImpact")} />
          <NodeRow op="×" title={tr('ui.quantification.secondary-risk', 'Secondary risk')} value={fmtVal(secondary, "money")} />
          <div className="qt-sub">
            <MoneyRow title={tr('ui.quantification.cascading-likelihood', 'Cascading likelihood')} value={inputs.cascadingLikelihood} onChange={setOv("cascadingLikelihood")} unit="prob" lo={0} hi={1} accent={color} prov={derived.prov.cascadingLikelihood} onTrace={() => setTrace("cascadingLikelihood")} />
            <MoneyRow title={tr('ui.quantification.cascading-impact', 'Cascading impact')} value={inputs.cascadingImpact} onChange={setOv("cascadingImpact")} unit="money" lo={1e3} hi={5e7} log accent={color} prov={derived.prov.cascadingImpact} onTrace={() => setTrace("cascadingImpact")} />
          </div>
        </div>
      </div>
      <div className="qt-note">
        {computing ? "simulating…" : <>{(ITER * 2).toLocaleString("en-US")} simulated years{computeMs ? ` in ${computeMs < 1 ? "<1" : Math.round(computeMs)} ms` : ""}</>}
        {" · "}drag any curve to tune a factor - saved with the study · derived values come from the study inputs
      </div>
      {trace && <FactorTrace fkey={trace} range={inputs[trace]} vals={{
        rate: M("attemptRate"), adv: M("adversaryStrength"), ctl: M("controlStrength"), respond: M("respondDays"),
        tef, vuln, lef, direct: primary, cascL: M("cascadingLikelihood"), cascI: M("cascadingImpact"),
        secondary, lm: primary + secondary, ale: nodes.ale,
      }} derived={derived} tax={tax} unit={UNIT[trace]} conf={FCONF[trace]} accent={color}
        overridden={trace in overrides} onChange={setOv(trace)} onReset={resetOv(trace)} onOpenEntity={setModal} onClose={() => setTrace(null)} />}
      {modal && <EntityModal type={getType(tax, modal.type)!} tax={tax} study={study} record={modal}
        onClose={() => { setModal(null); setTrace(null); }} onBack={() => setModal(null)} backLabel="Factor" />}
    </div>
  );
}

// The icon sits in its own fixed-width slot and the text in a separate one, so the
// icons line up in a single column down the tree rather than starting wherever the
// preceding label happened to end. The full text stays in the tooltip, because the
// text slot truncates when a provenance line is long.
function ProvChip({ prov, onClick }: { prov: Prov; onClick?: () => void }) {
  const cls = "chip qt-prov-chip" + (onClick ? " link" : "") + (prov.estimated ? " qt-prov-est" : "");
  const text = `${prov.source}${prov.label && prov.label !== "estimate" ? ` · ${prov.label}` : ""}`;
  const inner = <><i className="qt-prov-ico">{prov.icon}</i><span className="qt-prov-txt">{text}</span></>;
  return onClick
    ? <button type="button" className={cls} onClick={onClick} title={`${text}\n\nTrace / adjust this factor`}>{inner}</button>
    : <span className={cls} title={text}>{inner}</span>;
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

/** The four terms of the demand as one bar, so the addition is seen rather than read.
 *  Widths are the terms' shares of the total; a segment too narrow to hold its own
 *  caption drops it rather than overprinting the neighbour. */
function DemandStack({ dm }: { dm: DemandBreakdown }) {
  const parts = [
    { k: "getting in", v: dm.entry, c: "var(--color-workshop-2)" },
    { k: "tooling", v: dm.adds.tooling, c: "var(--color-workshop-3)" },
    { k: "breadth", v: dm.adds.depth, c: "var(--color-workshop-4)" },
    { k: "staying in", v: dm.adds.dwell, c: "var(--color-workshop-5)" },
  ].filter((p) => p.v > 0);
  const W = 500, BAR = 430, sum = dm.total || 1;
  let x = 0;
  return (
    <svg viewBox={`0 0 ${W} 40`} width="100%" height="40" role="img"
      aria-label={`demand ${(dm.total * 100).toFixed(1)} percent, made of ${parts.map((p) => p.k).join(", ")}`}>
      {parts.map((p) => {
        const w = (p.v / sum) * BAR, at = x; x += w;
        return (
          <g key={p.k}>
            <rect x={at} y={0} width={Math.max(1, w - 1)} height={16} rx={3} fill={p.c} opacity={0.75} />
            {w > 56 && <text x={at + 3} y={30} fontSize={10} fill="var(--fg-subtle)">{p.k}</text>}
            {w > 30 && <text x={at + w / 2} y={12} fontSize={10} textAnchor="middle" fill="var(--bg-0)" fontWeight={700}>
              {(p.v * 100).toFixed(1)}</text>}
          </g>
        );
      })}
      <text x={BAR + 8} y={13} fontSize={12} fill="var(--fg)" fontWeight={700}>= {(dm.total * 100).toFixed(1)}%</text>
    </svg>
  );
}

/** The comparison the simulation actually makes: one draw from each range per attempt.
 *  Drawn on one axis because that is the only way to see that the attack's demand is a
 *  RANGE too - reading a single number against three attacker numbers is what made the
 *  outcome impossible to reconstruct. */
function SkillAxis({ ctl, adv, asks = "attack asks" }: { ctl: Range; adv: Range; asks?: string }) {
  const W = 500, L = 92, R = 492, span = R - L;
  const at = (v: number) => L + Math.max(0, Math.min(1, v)) * span;
  const row = (y: number, r: Range, colour: string, label: string) => (
    <g>
      <text x={L - 8} y={y + 4} fontSize={10.5} textAnchor="end" fill="var(--fg-muted)">{label}</text>
      <rect x={at(r.min)} y={y - 5} width={Math.max(2, at(r.max) - at(r.min))} height={10} rx={5}
        fill={colour} opacity={0.28} />
      <path d={`M${at(r.mode)} ${y - 7} l6 7 -6 7 -6 -7 z`} fill={colour} />
    </g>
  );
  // Outside the overlap the outcome is already settled - below it every attacker fails,
  // above it every one gets through. Only inside does the pair of draws decide.
  const lo = Math.max(ctl.min, adv.min), hi = Math.min(ctl.max, adv.max);
  return (
    <svg viewBox={`0 0 ${W} 84`} width="100%" height="84" role="img"
      aria-label="what the attack asks against what this attacker can do, on one scale">
      {hi > lo && (
        <>
          <rect x={at(lo)} y={16} width={at(hi) - at(lo)} height={46} fill="var(--fg)" opacity={0.05} />
          <text x={(at(lo) + at(hi)) / 2} y={11} fontSize={9.5} textAnchor="middle"
            fill="var(--fg-subtle)">the draws decide here</text>
        </>
      )}
      {row(32, ctl, "var(--color-state-success)", asks)}
      {row(52, adv, "var(--color-state-error)", "attacker")}
      <line x1={L} y1={68} x2={R} y2={68} stroke="var(--border)" />
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line x1={at(t)} y1={68} x2={at(t)} y2={72} stroke="var(--border)" />
          <text x={at(t)} y={82} fontSize={9.5} textAnchor="middle" fill="var(--fg-subtle)">{t * 100}%</text>
        </g>
      ))}
    </svg>
  );
}

/** Where one row of the break-down came from: the records behind it, their state, how
 *  they were combined and what that made the bar. `what` is a step id, "" for the
 *  before-any-measure row, or "@through" for the share that reaches the objective. */
function BreakExplain({ what, result, derived, tax, cal, onClose }: {
  what: string; result: QuantResult; derived: Derived; tax: Taxonomy; cal: Calibration; onClose: () => void;
}) {
  const p1 = (x: number) => `${(x * 100).toFixed(1)}%`;
  const p0 = (x: number) => `${Math.round(x * 100)}%`;
  const dm = derived.demand;
  const sc = derived.coverage.steps.find((s) => s.step.id === what);
  const cs = derived.chain?.find((c) => c.id === what);
  const share = what === "@through" ? result.vuln
    : what === "" ? result.blockedAtBaseline
      : result.breaks.find((b) => b.id === what)?.p ?? 0;
  const title = sc ? recordTitle(getType(tax, sc.step.type)!, sc.step)
    : what === "@through" ? "Attempts that reach the objective" : "Attacker not capable enough for this attack";

  // Labels of the implementation scale, so a measure's level reads as a word.
  const lvlLabels = tax.entityTypes.flatMap((t) => t.fields)
    .find((f) => f.key === "implementation_level")?.scaleLabels ?? [];
  const lvlOf = (m: EntityRecord) => {
    const v = Number(m.values.implementation_level);
    return Number.isFinite(v) ? lvlLabels[v - 1] ?? `level ${v}` : "level not set";
  };
  const lvlW = (m: EntityRecord) => {
    const v = Number(m.values.implementation_level);
    return cal.effect.levelWeight[Number.isFinite(v) ? v - 1 : cal.effect.levelWeight.length - 1] ?? 1;
  };
  const stW = (m: EntityRecord) => cal.effect.statusWeight[String(m.values.status ?? "")] ?? 1;

  /** One figure with the arithmetic that produced it directly underneath. Nothing in
   *  this popup may appear without saying where it came from - that was the whole
   *  point of opening it. */
  const line = (k: React.ReactNode, v: string, from?: React.ReactNode, cls = "") => (
    <div className={"bx-line " + cls}>
      <span className="bx-k">{k}{from && <em>{from}</em>}</span>
      <span className="mono bx-v">{v}</span>
    </div>
  );

  return createPortal(
    <Overlay onClose={onClose}>
      <div className="ft-card" onMouseDown={(e) => e.stopPropagation()}>
        <header className="ft-head">
          <div>
            <div className="ft-eyebrow">out of every 100 attempts on this chain</div>
            <h2>{title} <span className="mono ft-val">{p1(share)}</span></h2>
          </div>
          <button className="btn ghost sm" onClick={onClose} aria-label={tr('ui.quantification.close', 'Close')}><Icon.close /></button>
        </header>
        <div className="ft-body">
          {sc && cs ? (
            <>
              <p className="bx-h">{tr('ui.quantification.measures-you-recorded-on', 'Measures you recorded on this step')}</p>
              {sc.measures.length ? sc.measures.map((m) => (
                <div key={m.id}>
                  {line(
                    recordTitle(getType(tax, m.type)!, m),
                    p1(measureEfficacyOf(tax, m, cal)),
                    <>{effectClassOf(m)} — {effectChannel(effectClassOf(m))}<br />
                      {m.values.strength != null && <>strength ×{measureStrengthOf(tax, m, cal).toPrecision(2)} · </>}
                      rolled out {lvlOf(m)} (×{lvlW(m).toPrecision(2)}) · {String(m.values.status ?? "no status")} (×{stW(m).toPrecision(2)})
                      {" "}· most one measure can protect {p0(cal.effect.controlCeiling)}</>,
                  )}
                </div>
              )) : <p className="bx-none">{tr('ui.quantification.none-nothing-here-costs', 'None. Nothing here costs an attacker anything.')}</p>}
              {sc.measures.filter((m) => effectClassOf(m) === "Preventive").length > 1 && line(
                "together they protect",
                p1(sc.prevention),
                <>1 − {sc.measures.filter((m) => effectClassOf(m) === "Preventive")
                  .map((m) => `(1 − ${p1(measureEfficacyOf(tax, m, cal))})`).join(" × ")} — each only helps where the others failed</>,
                "bx-sum",
              )}

              <p className="bx-h">{tr('ui.quantification.how-much-skill-it', 'How much skill it takes to get past this step')}</p>
              {dm && line("what the attack needs on its own", p1(dm.total),
                <>getting in {p1(dm.entry)} + tooling {p1(dm.adds.tooling)} + breadth over {dm.tactics} tactics {p1(dm.adds.depth)} + staying in {p1(dm.adds.dwell)}</>)}
              {line(<>because this step is {p1(sc.prevention)} protected</>,
                cs.gate ? `+${p1(cs.gate.mode - (dm?.total ?? 0))}` : "+0.0%",
                <>{p1(sc.prevention)} × {p0(cal.effect.prevention)}, the most a fully protected step adds</>)}
              {line(<b>an attacker has to be better than this share of all attackers</b>,
                cs.gate ? p1(cs.gate.mode) : "nothing to clear", undefined, "bx-sum")}
              {cs.gate && (
                <>
                  <p className="bx-h">{tr('ui.quantification.one-attempt-one-draw', 'One attempt = one draw from each')}</p>
                  <SkillAxis ctl={cs.gate} adv={derived.inputs.adversaryStrength} asks="this step asks" />
                  {line("this step asks",
                    `${p1(cs.gate.min)} · ${p1(cs.gate.mode)} · ${p1(cs.gate.max)}`,
                    <>{p1(cs.gate.mode)} ± {Math.round(cal.demand.spread * 100)} points — one operation is not another</>)}
                  {line(derived.riskSource,
                    `${p0(derived.inputs.adversaryStrength.min)} · ${p0(derived.inputs.adversaryStrength.mode)} · ${p0(derived.inputs.adversaryStrength.max)}`,
                    <>the same draw walks the whole chain: an attacker good enough here was good enough earlier</>)}
                </>
              )}
              {cs.interrupt > 0 && (
                <>
                  <p className="bx-h">{tr('ui.quantification.being-spotted-here', 'Being spotted here')}</p>
                  {line("chance the intrusion is ended at this step", p1(cs.interrupt),
                    <>watched {p1(sc.detection)} × {p0(cal.effect.detection)} of what is seen gets stopped × how able you are to react</>)}
                </>
              )}
              {line(<b>skilled enough for the attack, not for this step → stopped</b>, p1(share),
                undefined, "bx-sum")}
            </>
          ) : what === "" ? (
            <>
              <p className="bx-h">{tr('ui.quantification.what-the-attack-asks', 'What the attack asks, before any measure of yours')}</p>
              {dm ? (
                <>
                  <DemandStack dm={dm} />
                  {line("getting in", p1(dm.entry), <>first step&apos;s technique{dm.unknown.entry ? " - none recognised, so a default" : ""}</>)}
                  {line("tooling", `+${p1(dm.adds.tooling)}`, <>hardest single technique on the chain</>)}
                  {line("breadth", `+${p1(dm.adds.depth)}`, <>{dm.tactics} distinct tactics</>)}
                  {line("staying in undetected", `+${p1(dm.adds.dwell)}`, <>persistence, evasion or lateral movement</>)}
                </>
              ) : line("read from the difficulty rating", p1(meanOf(derived.inputs.controlStrength)),
                <>this scenario models no chain, so there is nothing to derive it from</>)}

              <p className="bx-h">{tr('ui.quantification.one-attempt-one-draw', 'One attempt = one draw from each')}</p>
              <SkillAxis ctl={derived.inputs.controlStrength} adv={derived.inputs.adversaryStrength} />
              {line("attack asks",
                `${p1(derived.inputs.controlStrength.min)} · ${p1(derived.inputs.controlStrength.mode)} · ${p1(derived.inputs.controlStrength.max)}`,
                <>{dm ? <>{p1(dm.total)} ± {Math.round(cal.demand.spread * 100)} points</> : "difficulty rating"} — one operation is not another</>)}
              {line(derived.riskSource,
                `${p0(derived.inputs.adversaryStrength.min)} · ${p0(derived.inputs.adversaryStrength.mode)} · ${p0(derived.inputs.adversaryStrength.max)}`,
                <>capability rating: worst · likely · best, against all attackers. Wide: a class, not a person</>)}
              {line(<b>attacker ≤ what the attack asks → stopped</b>, p1(share),
                <>before any step, so no measure of yours was involved</>, "bx-sum")}
            </>
          ) : (
            <>
              <p className="bx-h">{tr('ui.quantification.what-this-share-becomes', 'What this share becomes')}</p>
              {line("attempts per year on this scenario", derived.frequency.total.toPrecision(2),
                <>base rate {derived.frequency.base.toPrecision(2)} × tempo {derived.frequency.tempo.toPrecision(2)} × resources {derived.frequency.throughput.toPrecision(2)} × why-us {derived.frequency.pull.toPrecision(2)} × reachability {derived.frequency.reachability.toPrecision(2)}</>)}
              {(() => {
                // The base rate is the only place the study's sector acts, and it acts by
                // NAME: a value the calibration does not know changes nothing, which is
                // worth a line rather than a silence.
                const sc = derived.frequency.sector;
                const sz = derived.frequency.size;
                const sizeLine = derived.frequency.own ? null : line("of which the size",
                  sz.factor === 1 ? "×1 — medium" : `×${sz.factor.toPrecision(2)}`,
                  sz.name ? <>{sz.name} — larger organisations are hit more often in every source that has a denominator</>
                    : <>no size set, so the medium organisation the bundled rates describe</>);
                if (derived.frequency.own) return line("of which the sector", "×1 — own record",
                  <>the base rate comes from <b>your own record</b> (the calibration's "Your own record" table), which is already a record of this sector</>);
                return <>{line("of which the sector",
                  sc.factor === 1 ? "×1 — no exception" : `×${sc.factor.toPrecision(2)}`,
                  !sc.name ? <>no sector set, so the published rates are used as they are</>
                    : !sc.known ? <><b>&ldquo;{sc.name}&rdquo; is not a sector this calibration knows</b> — it is matched by name, so nothing is applied</>
                      : <>{sc.name} — exceptions apply per actor class, and only where one is documented</>,
                  sc.known ? "" : "bx-warn")}{sizeLine}</>;
              })()}
              {line("× the share that gets through", p1(result.vuln), <>measured over the simulation, not set anywhere</>)}
              {line(<b>loss events per year</b>, result.lef.toPrecision(2),
                result.lef > 0 ? <>about one every {Math.round(1 / result.lef)} years</> : undefined, "bx-sum")}
              <p className="bx-note">
                {tr('ui.quantification.an-attempt-only-counts', 'An attempt only counts as a loss event once it reaches the end of the chain.\n                Getting in is not a loss event.')}
              </p>
            </>
          )}
          <p className="bx-note">
            Shares come from {result.iterations.toLocaleString("en-US")} simulated years. Every
            row of the list, plus the share reaching the objective, adds up to 100%.
          </p>
        </div>
      </div>
    </Overlay>,
    document.body,
  );
}

// The simulated annual-loss distribution (Monte-Carlo output), read-only. It
// overlays BOTH runs so the effect of the controls is visible: "without controls"
// (inherent, ghosted) sits to the right at higher losses; "with controls"
// (residual, filled) is pulled left. The mean of each is marked and the gap
// between them is what the controls buy. Below it, the control chain is spelled
// out (kill-chain coverage -> control strength -> loss reduction).
function LossDistribution({ resultWith, resultWithout, active, accent, derived, tax, cal, benefit, onTraceControls }: {
  resultWith: QuantResult; resultWithout: QuantResult; active: "with" | "without"; accent: string;
  derived: Derived; tax: Taxonomy; cal: Calibration; benefit: number; onTraceControls: () => void;
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
  // €-ticks within the range - the log-axis reference points, thinned to what fits.
  const ticks = logTicks(lo, hi, 9);

  return (
    <div className="qt-dist">
      <div className="qt-dist-head">
        <span className="qt-shift-lbl">{tr('ui.quantification.simulated-annual-loss-distribution', 'Simulated annual-loss distribution')}</span>
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
      <ChainBreak result={resultWith} derived={derived} tax={tax} cal={cal} accent={accent} benefit={benefit} onTrace={onTraceControls} />
    </div>
  );
}

// Where the attempts die. This is what the traversal knows and the old averaged model
// could not say: of every attack attempt, which share is stopped by the scenario's own
// difficulty, which share by each control on the chain, and which share gets through.
// It answers "where does my money work" far better than any single loss figure.
function ChainBreak({ result, derived, tax, cal, accent, benefit, onTrace }: {
  result: QuantResult; derived: Derived; tax: Taxonomy; cal: Calibration;
  accent: string; benefit: number; onTrace: () => void;
}) {
  const [explain, setExplain] = useState<string | null>(null);
  const warn = "var(--color-state-warning)";
  const titleOf = (id: string) => {
    const sc = derived.coverage.steps.find((s) => s.step.id === id);
    return sc ? recordTitle(getType(tax, sc.step.type)!, sc.step) : "step";
  };
  // The bar must account for every attempt, so it keeps even the slivers; only the
  // written-out list below is trimmed to the ones worth naming.
  const segs = [
    ...(result.blockedAtBaseline > 0 ? [{ id: "", label: "not up to what the attack itself demands", p: result.blockedAtBaseline }] : []),
    ...result.breaks.filter((b) => b.p > 0).sort((a, b) => b.p - a.p).map((b) => ({ id: b.id, label: titleOf(b.id), p: b.p })),
  ];
  // Every outcome gets a row: the list is framed as "out of every 100", so dropping the
  // small ones would leave it visibly short of 100. Only defended steps ever appear here,
  // so the list stays short by construction.
  const named = segs.filter((s) => s.p > 0.0005);
  if (!segs.length) {
    return (
      <button type="button" className="qt-ctrl-note" onClick={onTrace} title={tr('ui.quantification.trace-the-control-strength', 'Trace the control strength')}>
        {tr('ui.quantification.nothing-on-this-chain', 'Nothing on this chain stops an attempt - every attacker who starts, finishes.')} <span className="qt-ctrl-more">trace →</span>
      </button>
    );
  }
  // Every row is a chip that opens where its number came from: which measures, in what
  // state, combined how, and what that made the bar. A percentage nobody can take apart
  // is a percentage nobody can argue with.
  const row = (p: number, label: string, cls = "", id?: string) => (
    <button type="button" className={"qb-row " + cls} key={label}
      onClick={() => setExplain(id ?? "")} title={tr('ui.quantification.where-this-number-comes', 'Where this number comes from')}>
      <span className="qb-p mono">{(p * 100).toFixed(1)}%</span>
      <span className="qb-l">{label}</span>
      <Icon.chevron />
    </button>
  );
  return (
    <div className="qt-break">
      {explain !== null && (
        <BreakExplain what={explain} result={result} derived={derived} tax={tax} cal={cal} onClose={() => setExplain(null)} />
      )}
      <div className="qt-break-h">
        <span className="qt-shift-lbl">{tr('ui.quantification.where-the-attempts-are', 'Where the attempts are stopped')}</span>
        <span className="qb-scale">out of every 100 attacks on this chain</span>
      </div>
      <div className="qt-break-bar" role="img" aria-label="share of attack attempts stopped at each stage of the chain">
        {segs.map((s, i) => (
          <span key={s.id || "base"} className="qt-break-seg" title={`${s.label}: ${(s.p * 100).toFixed(1)}%`}
            style={{ width: `${s.p * 100}%`, background: accent, opacity: Math.max(0.3, 0.85 - i * 0.11) }} />
        ))}
        <span className="qt-break-seg through" title={`reaches the objective: ${(result.vuln * 100).toFixed(1)}%`}
          style={{ width: `${result.vuln * 100}%`, background: warn }} />
      </div>
      <div className="qb-rows">
        {named.map((s) => row(s.p, s.id ? `stopped at ${s.label}` : "attacker not capable enough for this attack, before any measure of yours", "", s.id))}
        {row(result.vuln, "reach the objective - these become loss events", "through", "@through")}
      </div>
      <div className="qb-foot">
        {result.detected > 0.002 && <span>Of those, {Math.round(result.detected * 100)} were caught in time - seen at a watched step, with the alert and the response ahead of the objective{result.raceMargin != null && result.raceMargin > 0 ? `, typically with ${fmtVal(result.raceMargin, "days")} to spare` : ""}.</span>}
        {result.seenLate > 0.002 && <span className="qb-late"> {Math.round(result.seenLate * 100)} were seen and still reached the objective: the alert came, the objective came first{result.raceMargin != null && result.raceMargin < 0 ? ` - typically ${fmtVal(-result.raceMargin, "days")} too late` : ""}.</span>}
        <button type="button" className="qt-break-trace" onClick={onTrace}>
          controls cut the mean loss by {fmtVal(benefit, "money")} · trace →
        </button>
      </div>
    </div>
  );
}

// ── Which assumption carries the number ──────────────────────────────────────
//
// One factor at a time is pinned to the ends of its band and the mean annual loss
// re-simulated; the swing, sorted, is a tornado. The factor tree says HOW the number was
// derived, this says WHERE it is fragile - the honest picture of a model that works with
// judgements, and the answer to "four defensible ratings multiplied into what?".
// Computed on demand, not with the headline: it is thirty simulations, and most readers
// of the tree never ask the question.
const FACTOR_TITLE: Record<keyof QuantInputs, string> = {
  attemptRate: "Attempts per year", adversaryStrength: "Attacker capability", controlStrength: "What an attempt has to beat",
  directImpact: "Direct impact", cascadingLikelihood: "Cascading likelihood", cascadingImpact: "Cascading impact",
  respondDays: "Time to act on an alert",
};
function Tornado({ inputs, chain, derived, tax, pace }: { inputs: QuantInputs; chain: ChainStep[] | undefined; derived: Derived; tax: Taxonomy; pace: Pace }) {
  const [open, setOpen] = useState(false);
  const [sens, setSens] = useState<Sensitivity | null>(null);
  const [busy, setBusy] = useState(false);
  const key = JSON.stringify(inputs) + "|" + JSON.stringify(chain);
  // A change to any input voids the tornado: it is recomputed when next looked at, not
  // eagerly - the headline result already costs a run on every keystroke.
  useEffect(() => { setSens(null); }, [key]);
  useEffect(() => {
    if (!open || sens) return;
    setBusy(true);
    const t = window.setTimeout(() => { setSens(sensitivityOf(inputs, chain, undefined, undefined, pace)); setBusy(false); }, 30);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sens, key]);

  const titleOf = (k: string): { name: string; unit: Unit } => {
    if (k.startsWith("step:")) {
      const sc = derived.coverage.steps.find((s) => s.step.id === k.slice(5));
      return { name: `gate at ${sc ? recordTitle(getType(tax, sc.step.type)!, sc.step) : "step"}`, unit: "prob" };
    }
    return { name: FACTOR_TITLE[k as keyof QuantInputs], unit: UNIT[k as keyof QuantInputs] };
  };

  return (
    <div className="qt-torn">
      <button type="button" className="qt-torn-h" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={"caret" + (open ? " open" : "")}><Icon.chevron /></span>
        <span className="qt-shift-lbl">What this number hangs on</span>
        <span className="qb-scale">each factor walked over its own band, the rest held</span>
      </button>
      {open && !sens && <div className="hint" style={{ padding: "6px 0 10px" }}>{busy ? "computing…" : ""}</div>}
      {open && sens && (() => {
        const carry = carriers(sens);
        const lo = Math.min(sens.base, ...sens.swings.map((w) => Math.min(w.low, w.high)));
        const hi = Math.max(sens.base, ...sens.swings.map((w) => Math.max(w.low, w.high)));
        const span = Math.max(1e-9, hi - lo);
        const X = (v: number) => ((v - lo) / span) * 100;
        const named = carry.map((w) => titleOf(w.key).name);
        const next = sens.swings[carry.length];
        const nextShare = next && sens.swings[0].swing > 0 ? Math.round((next.swing / sens.swings[0].swing) * 100) : 0;
        const list = named.length === 1 ? named[0] : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
        return (
          <>
            <p className="qt-torn-read">
              {named.length === 0
                ? "No factor moves the mean by more than the simulation's own noise: the number is spread over its inputs rather than hanging on one."
                : !next
                  ? `The mean hangs on ${list}; nothing else moves it by more than the simulation's own noise.`
                  : `The mean hangs on ${list}; the next factor, ${titleOf(next.key).name.replace(/^gate at /, "the gate at ")}, moves it ${nextShare}% as far.`}
            </p>
            <div className="qt-torn-rows" role="img" aria-label="swing of the mean annual loss per factor">
              {sens.swings.map((w) => {
                const t = titleOf(w.key);
                const below = Math.min(w.low, w.high), above = Math.max(w.low, w.high);
                const quiet = w.swing <= 3 * sens.noise;
                return (
                  <div key={w.key} className={"qt-torn-row" + (quiet ? " quiet" : "")}
                    title={`${t.name}: ${fmtVal(w.band.min, t.unit)} → ${fmtVal(w.low, "money")} · ${fmtVal(w.band.max, t.unit)} → ${fmtVal(w.high, "money")}`}>
                    <span className="qt-torn-name">{t.name}</span>
                    <span className="qt-torn-band mono">{fmtVal(w.band.min, t.unit)}–{fmtVal(w.band.max, t.unit)}</span>
                    <span className="qt-torn-bar">
                      <i className="qt-torn-base" style={{ left: `${X(sens.base)}%` }} />
                      {below < sens.base && <i className="qt-torn-seg less" style={{ left: `${X(below)}%`, width: `${X(Math.min(above, sens.base)) - X(below)}%` }} />}
                      {above > sens.base && <i className="qt-torn-seg more" style={{ left: `${X(Math.max(below, sens.base))}%`, width: `${X(above) - X(Math.max(below, sens.base))}%` }} />}
                    </span>
                    <span className="qt-torn-v mono">{fmtVal(below, "money")} – {fmtVal(above, "money")}</span>
                  </div>
                );
              })}
            </div>
            <div className="qb-foot">
              <span>mean {fmtVal(sens.base, "money")} at the derived values · simulation noise ±{fmtVal(sens.noise, "money")} · {sens.swings.length * 2 + 2} runs of {sens.iterations.toLocaleString()} years</span>
            </div>
          </>
        );
      })()}
    </div>
  );
}
