// Quantitative risk as an interactive factor tree, one per operational scenario.
// Most factors are DERIVED from the qualitative model (scenario, risk source,
// kill-chain coverage) and carry a provenance chip; only the loss magnitudes are
// haptic distribution inputs. The Monte-Carlo (annual loss / ALE + loss-exceedance
// curve) recomputes live; an inherent<->residual toggle shows what the controls buy.
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { EntityRecord, Study, Taxonomy } from "../domain/types";
import { getType, recordTitle, scaleLabel, scaleMax } from "../domain/taxonomy";
import { useStore } from "../domain/store";
import { DEFAULT_CALIBRATION, type Calibration } from "../domain/calibration";
import { simulate, type QuantInputs, type QuantResult, type Range } from "../domain/montecarlo";
import { deriveInputs, meanOf, measureEfficacyOf, type Derived, type Prov } from "../domain/quantModel";
import { effectClassOf, EFFECT_CHANNEL } from "../domain/controls";
import { likelihoodCheck } from "../domain/frequency";
import { DistInput, fmtVal, type Unit } from "./DistInput";
import { FactorTrace } from "./FactorTrace";
import { EntityModal } from "./EntityModal";
import { Icon } from "./ui";
import { copyText, quantLlmMarkdown } from "../domain/clipboard";

const UNIT: Record<keyof QuantInputs, Unit> = {
  attemptRate: "rate", adversaryStrength: "prob", controlStrength: "prob",
  directImpact: "money", cascadingLikelihood: "prob", cascadingImpact: "money",
};
export interface FConf { lo: number; hi: number; log: boolean }
const FCONF: Record<keyof QuantInputs, FConf> = {
  attemptRate: { lo: 0.005, hi: 100, log: true },
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
  // The chain is part of the model, not of the inputs, so it has to be in the key too -
  // otherwise re-pointing a measure at another step would leave a stale result on screen.
  const key = JSON.stringify(inputsWith) + "|" + JSON.stringify(inputsWithout) + "|" + JSON.stringify(derivedWith.chain);
  useEffect(() => {
    setComputing(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const t0 = performance.now();
      setResWith(simulate(inputsWith, ITER, derivedWith.chain));
      setResWithout(simulate(inputsWithout, ITER, derivedWithout.chain));
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
            <button className={"seg-btn" + (!residual ? " on" : "")} onClick={() => setResidual(false)}>Inherent (no controls)</button>
            <button className={"seg-btn" + (residual ? " on" : "")} onClick={() => setResidual(true)}>Residual (with controls)</button>
          </div>
          {benefit > 0 && <div className="qt-delta">controls cut the mean annual loss by {fmtVal(benefit, "money")} → -{benefitPct}%</div>}
          <button className="btn sm qt-llm" onClick={() => {
            void copyText(quantLlmMarkdown(tax, study)).then((okd) => setCopied(okd ? "copied" : "copy failed"));
            setTimeout(() => setCopied(null), 2500);
          }} title="The full quantification as text: the rules, the parameters in force, every derived term, the chain, the results and the stated limits">
            {copied ?? "Copy for an LLM"}
          </button>
          {lkCheck?.diverges && (
            <div className="qt-crosscheck">
              You rated this scenario <b>{scaleLabel(lkF!, lkCheck.ratedLevel!)}</b>; working from the
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

      <div className="qt-tree">
        <NodeRow op="×" title="Loss event frequency" value={fmtVal(lef, "rate")} />
        <div className="qt-sub">
          <LeafRow title="Attempts per year" value={fmtVal(M("attemptRate"), "rate")} prov={derived.prov.attemptRate} onTrace={() => setTrace("attemptRate")} />
          <NodeRow op="vs" title="Vulnerability" value={fmtVal(vuln, "prob")} />
          <div className="qt-sub">
            <LeafRow title="Attacker capability" value={fmtVal(M("adversaryStrength"), "prob")} prov={derived.prov.adversaryStrength} onTrace={() => setTrace("adversaryStrength")} />
            <LeafRow title="What an attempt has to beat" value={fmtVal(M("controlStrength"), "prob")} prov={derived.prov.controlStrength} onTrace={() => setTrace("controlStrength")} />
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
        rate: M("attemptRate"), adv: M("adversaryStrength"), ctl: M("controlStrength"),
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
    : what === "@through" ? "Attempts that reach the objective" : "Attempts that were never skilled enough";

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
    <div className="overlay" onMouseDown={onClose}>
      <div className="ft-card" onMouseDown={(e) => e.stopPropagation()}>
        <header className="ft-head">
          <div>
            <div className="ft-eyebrow">out of every 100 attempts on this chain</div>
            <h2>{title} <span className="mono ft-val">{p1(share)}</span></h2>
          </div>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close"><Icon.close /></button>
        </header>
        <div className="ft-body">
          {sc && cs ? (
            <>
              <p className="bx-h">Measures you recorded on this step</p>
              {sc.measures.length ? sc.measures.map((m) => (
                <div key={m.id}>
                  {line(
                    recordTitle(getType(tax, m.type)!, m),
                    p1(measureEfficacyOf(tax, m, cal)),
                    <>{effectClassOf(m)} — {EFFECT_CHANNEL[effectClassOf(m)]}<br />
                      rolled out {lvlOf(m)} (×{lvlW(m).toPrecision(2)}) · {String(m.values.status ?? "no status")} (×{stW(m).toPrecision(2)})
                      {" "}· most one measure can protect {p0(cal.effect.controlCeiling)}</>,
                  )}
                </div>
              )) : <p className="bx-none">None. Nothing here costs an attacker anything.</p>}
              {sc.measures.filter((m) => effectClassOf(m) === "Preventive").length > 1 && line(
                "together they protect",
                p1(sc.prevention),
                <>1 − {sc.measures.filter((m) => effectClassOf(m) === "Preventive")
                  .map((m) => `(1 − ${p1(measureEfficacyOf(tax, m, cal))})`).join(" × ")} — each only helps where the others failed</>,
                "bx-sum",
              )}

              <p className="bx-h">How much skill it takes to get past this step</p>
              {dm && line("what the attack needs on its own", p1(dm.total),
                <>getting in {p1(dm.entry)} + tooling {p1(dm.adds.tooling)} + breadth over {dm.tactics} tactics {p1(dm.adds.depth)} + staying in {p1(dm.adds.dwell)}</>)}
              {line(<>because this step is {p1(sc.prevention)} protected</>,
                cs.gate ? `+${p1(cs.gate.mode - (dm?.total ?? 0))}` : "+0.0%",
                <>{p1(sc.prevention)} × {p0(cal.effect.prevention)}, the most a fully protected step adds</>)}
              {line(<b>an attacker has to be better than this share of all attackers</b>,
                cs.gate ? p1(cs.gate.mode) : "nothing to clear", undefined, "bx-sum")}
              {cs.interrupt > 0 && (
                <>
                  <p className="bx-h">Being spotted here</p>
                  {line("chance the intrusion is ended at this step", p1(cs.interrupt),
                    <>watched {p1(sc.detection)} × {p0(cal.effect.detection)} of what is seen gets stopped × how able you are to react</>)}
                </>
              )}
              <p className="bx-note">
                These {p1(share)} are the attempts whose attacker was skilled enough for the
                attack itself but not for this step.
              </p>
            </>
          ) : what === "" ? (
            <>
              <p className="bx-h">How much skill this attack needs on its own</p>
              {dm ? (
                <>
                  {line("getting in", p1(dm.entry), <>from the first step&apos;s technique{dm.unknown.entry ? " - none recognised, so a default" : ""}</>)}
                  {line("tooling", `+${p1(dm.adds.tooling)}`, <>the hardest single technique on the chain</>)}
                  {line("breadth", `+${p1(dm.adds.depth)}`, <>the chain spans {dm.tactics} distinct tactics</>)}
                  {line("staying in undetected", `+${p1(dm.adds.dwell)}`, <>the chain needs persistence, evasion or lateral movement</>)}
                  {line(<b>skill the attack needs, before any measure of yours</b>, p1(dm.total), undefined, "bx-sum")}
                </>
              ) : line("read from the difficulty rating", p1(meanOf(derived.inputs.controlStrength)),
                <>this scenario models no chain, so there is nothing to derive it from</>)}
              <p className="bx-h">How skilled this attacker is</p>
              {line(derived.riskSource,
                `${p0(derived.inputs.adversaryStrength.min)} · ${p0(derived.inputs.adversaryStrength.mode)} · ${p0(derived.inputs.adversaryStrength.max)}`,
                <>from the capability rating: at worst, most likely, at best - better than this share of all attackers. Wide because a rating describes a class of attacker, not one person.</>)}
              <p className="bx-note">
                These {p1(share)} are the attempts whose attacker was less skilled than the
                attack requires. They stopped before reaching any step, so no measure of yours
                was involved.
              </p>
            </>
          ) : (
            <>
              <p className="bx-h">What this share becomes</p>
              {line("attempts per year on this scenario", derived.frequency.total.toPrecision(2),
                <>base rate {derived.frequency.base.toPrecision(2)} × tempo {derived.frequency.tempo.toPrecision(2)} × resources {derived.frequency.throughput.toPrecision(2)} × why-us {derived.frequency.pull.toPrecision(2)} × reachability {derived.frequency.reachability.toPrecision(2)}</>)}
              {line("× the share that gets through", p1(result.vuln), <>measured over the simulation, not set anywhere</>)}
              {line(<b>loss events per year</b>, result.lef.toPrecision(2),
                result.lef > 0 ? <>about one every {Math.round(1 / result.lef)} years</> : undefined, "bx-sum")}
              <p className="bx-note">
                An attempt only counts as a loss event once it reaches the end of the chain.
                Getting in is not a loss event.
              </p>
            </>
          )}
          <p className="bx-note">
            Shares come from {result.iterations.toLocaleString("en-US")} simulated years. Every
            row of the list, plus the share reaching the objective, adds up to 100%.
          </p>
        </div>
      </div>
    </div>,
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
      <button type="button" className="qt-ctrl-note" onClick={onTrace} title="Trace the control strength">
        Nothing on this chain stops an attempt - every attacker who starts, finishes. <span className="qt-ctrl-more">trace →</span>
      </button>
    );
  }
  // Every row is a chip that opens where its number came from: which measures, in what
  // state, combined how, and what that made the bar. A percentage nobody can take apart
  // is a percentage nobody can argue with.
  const row = (p: number, label: string, cls = "", id?: string) => (
    <button type="button" className={"qb-row " + cls} key={label}
      onClick={() => setExplain(id ?? "")} title="Where this number comes from">
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
        <span className="qt-shift-lbl">Where the attempts are stopped</span>
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
        {result.detected > 0.002 && <span>Of those, {Math.round(result.detected * 100)} were stopped by detection and response rather than by resistance.</span>}
        <button type="button" className="qt-break-trace" onClick={onTrace}>
          controls cut the mean loss by {fmtVal(benefit, "money")} · trace →
        </button>
      </div>
    </div>
  );
}
