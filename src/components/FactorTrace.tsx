// Traceability popup for a quantification factor: the effect chain up to the
// annual loss (with live values), where the value comes from (source entity +
// derivation, openable in the full modal), and a haptic control to adjust/override
// it. Opened from a factor chip.
import { Fragment } from "react";
import { createPortal } from "react-dom";
import type { EntityRecord, Taxonomy } from "../domain/types";
import { getType, recordTitle, scaleLabel, scaleMax } from "../domain/taxonomy";
import type { Derived } from "../domain/quantModel";
import { effectClassOf, EFFECT_CHANNEL } from "../domain/controls";
import type { QuantInputs, Range } from "../domain/montecarlo";
import type { FConf } from "./QuantificationView";
import { DistInput, fmtVal, type Unit } from "./DistInput";
import { ScaleBars, Icon } from "./ui";

type FKey = keyof QuantInputs;
// Every value needed to spell out the calculation with real numbers.
export interface Vals {
  contact: number; prob: number; adv: number; ctl: number;
  tef: number; vuln: number; lef: number;
  direct: number; cascL: number; cascI: number; secondary: number; lm: number; ale: number;
}
interface Meta { title: string; kind: "activity" | "likelihood" | "capability" | "control" | "money" | "prob" }
const META: Record<FKey, Meta> = {
  threatActivity: { title: "Contact frequency", kind: "activity" },
  attackProbability: { title: "Probability of action", kind: "likelihood" },
  adversaryStrength: { title: "Adversary strength", kind: "capability" },
  controlStrength: { title: "Control strength", kind: "control" },
  directImpact: { title: "Direct impact", kind: "money" },
  cascadingLikelihood: { title: "Cascading likelihood", kind: "prob" },
  cascadingImpact: { title: "Cascading impact", kind: "money" },
};

// The chain of result nodes each factor flows through, up to the annual loss.
type Node = "tef" | "vuln" | "lef" | "secondary" | "lm" | "ale";
const PATH: Record<FKey, Node[]> = {
  threatActivity: ["tef", "lef", "ale"],
  attackProbability: ["tef", "lef", "ale"],
  adversaryStrength: ["vuln", "lef", "ale"],
  controlStrength: ["vuln", "lef", "ale"],
  directImpact: ["lm", "ale"],
  cascadingLikelihood: ["secondary", "lm", "ale"],
  cascadingImpact: ["secondary", "lm", "ale"],
};
const NODE_NAME: Record<Node, string> = { tef: "Threat event frequency", vuln: "Vulnerability", lef: "Loss event frequency", secondary: "Secondary risk", lm: "Loss magnitude", ale: "Annual loss" };
const NODE_UNIT: Record<Node, Unit> = { tef: "rate", vuln: "prob", lef: "rate", secondary: "money", lm: "money", ale: "money" };
// The factor's own mean value (what the simulation actually uses) - keeps the
// header, the start node and the equations consistent.
const FVAL: Record<FKey, keyof Vals> = {
  threatActivity: "contact", attackProbability: "prob", adversaryStrength: "adv", controlStrength: "ctl",
  directImpact: "direct", cascadingLikelihood: "cascL", cascadingImpact: "cascI",
};

// A term in an equation: a named quantity with its value.
type EqTerm = { label: string; value: number; unit: Unit };
// One operand of an equation, highlighted when it is the factor being traced.
function Term({ t, hit }: { t: EqTerm; hit: boolean }) {
  return <span className={"ft-term" + (hit ? " hit" : "")} title={t.label}>{fmtVal(t.value, t.unit)}</span>;
}
// The explicit formula for each result node: which terms combine, by which op.
function equation(node: Node, v: Vals): { terms: EqTerm[]; op: string; result: number; approx?: boolean; note?: string } {
  switch (node) {
    case "tef": return { op: "×", result: v.tef, terms: [{ label: "Contact frequency", value: v.contact, unit: "rate" }, { label: "Probability of action", value: v.prob, unit: "prob" }] };
    case "vuln": return { op: "vs", result: v.vuln, note: "P( capability > resistance ) - the share of threat events in which the drawn capability exceeds the scenario baseline and every defended step on at least one route through the chain, measured over the simulation", terms: [{ label: "Adversary strength", value: v.adv, unit: "prob" }, { label: "Control strength", value: v.ctl, unit: "prob" }] };
    // Rates below 1/yr are far easier to judge as a return period, so say it in words too.
    case "lef": return { op: "×", result: v.lef,
      note: v.lef > 0 && v.lef < 1 ? `about one loss event every ${Math.round(1 / v.lef)} years` : undefined,
      terms: [{ label: "Threat event frequency", value: v.tef, unit: "rate" }, { label: "Vulnerability", value: v.vuln, unit: "prob" }] };
    case "secondary": return { op: "×", result: v.secondary, terms: [{ label: "Cascading likelihood", value: v.cascL, unit: "prob" }, { label: "Cascading impact", value: v.cascI, unit: "money" }] };
    case "lm": return { op: "+", result: v.lm, terms: [{ label: "Direct impact", value: v.direct, unit: "money" }, { label: "Secondary risk", value: v.secondary, unit: "money" }] };
    case "ale": return { op: "×", result: v.ale, approx: true, note: "mean over the simulated years", terms: [{ label: "Loss event frequency", value: v.lef, unit: "rate" }, { label: "Loss magnitude", value: v.lm, unit: "money" }] };
  }
}

const scaleOf = (tax: Taxonomy, rec: EntityRecord | undefined, key: string) => {
  if (!rec) return null; const t = getType(tax, rec.type); const f = t?.fields.find((x) => x.key === key);
  return f && typeof rec.values[key] === "number" ? { label: scaleLabel(f, rec.values[key] as number), value: rec.values[key] as number, max: scaleMax(f), field: f } : null;
};

export function FactorTrace({ fkey, range, vals, derived, tax, unit, conf, accent, overridden, onChange, onReset, onOpenEntity, onClose }: {
  fkey: FKey; range: Range; vals: Vals; derived: Derived; tax: Taxonomy; unit: Unit; conf: FConf; accent: string;
  overridden: boolean; onChange: (r: Range) => void; onReset: () => void; onOpenEntity: (r: EntityRecord) => void; onClose: () => void;
}) {
  const m = META[fkey];
  const selfVal = vals[FVAL[fkey]];   // the mean the simulation uses for this factor
  const { refs } = derived;
  const rs = refs.riskSource, fe = refs.fearedEvent, op = refs.op;
  const openBtn = (rec: EntityRecord | undefined, label: string) => rec
    ? <button className="ft-open" onClick={() => onOpenEntity(rec)}>{label}: <b>{recordTitle(getType(tax, rec.type)!, rec)}</b> <Icon.chevron /></button> : null;

  let source: React.ReactNode = null;
  if (m.kind === "activity" || m.kind === "capability") {
    const key = m.kind === "activity" ? "activity" : "capability";
    const s = scaleOf(tax, rs, key);
    source = (
      <>
        {openBtn(rs, "Risk source")}
        {s && <p className="ft-calc">{s.field.label} = <b>{s.label}</b> ({s.value}/{s.max}) → {m.title.toLowerCase()} ≈ {fmtVal(range.min, unit)} · <b>{fmtVal(range.mode, unit)}</b> · {fmtVal(range.max, unit)}</p>}
        {rs && <div className="ft-ratings">{["capability", "resources", "activity", "relevance"].map((k) => { const sc = scaleOf(tax, rs, k); return sc ? <div className="ft-rating" key={k}><span>{sc.field.label}</span><ScaleBars value={sc.value} max={sc.max} label={sc.label} positive={sc.field.polarity === "positive"} /></div> : null; })}</div>}
      </>
    );
  } else if (m.kind === "likelihood") {
    const s = scaleOf(tax, op, "likelihood");
    source = (<>{openBtn(op, "Operational scenario")}{s && <p className="ft-calc">Likelihood = <b>{s.label}</b> → probability of action ≈ {Math.round(range.min * 100)}% · <b>{Math.round(range.mode * 100)}%</b> · {Math.round(range.max * 100)}%</p>}</>);
  } else if (m.kind === "control") {
    const diff = scaleOf(tax, op, "difficulty");
    const chain = derived.chain;
    // Walk the chain in TRAVERSAL order (that is what the simulation does), pulling each
    // step's measures from the coverage detail.
    const walk = (chain ?? []).map((cs) => ({ cs, sc: derived.coverage.steps.find((s) => s.step.id === cs.id) }));
    source = (
      <>
        {openBtn(op, "Attack chain")}
        <p className="ft-calc">
          {diff && <>Difficulty = <b>{diff.label}</b> ({diff.value}/{diff.max}) → </>}
          a baseline resistance of <b>{Math.round(range.mode * 100)}%</b>, beaten once before the chain starts.
          {chain?.length
            ? <> After that, a step is only a further hurdle if something blocks or detects him there. Steps with nothing on them cost him nothing - so splitting the chain into more steps never makes it look safer.</>
            : <> No kill-chain steps here, so the baseline decides on its own.</>}
        </p>
        {walk.length > 0 && (
          <div className="ft-steps">
            {walk.map(({ cs, sc }, i) => (
              <div className={"ft-step" + (cs.gate || cs.interrupt > 0 ? "" : " gap")} key={cs.id}>
                <span className="ft-step-n">
                  {i + 1}. {sc ? recordTitle(getType(tax, sc.step.type)!, sc.step) : "step"}
                  {cs.preds.length > 1 && <em className="ft-step-join"> · needs {cs.join === "any" ? "any one" : "all"} of {cs.preds.length}</em>}
                  {cs.terminal && <em className="ft-step-join"> · objective</em>}
                </span>
                <span className="ft-step-c">
                  {cs.gate && <b className="ok">blocks {Math.round(cs.gate.mode * 100)}%</b>}
                  {cs.interrupt > 0 && <b className="watch">detected {Math.round(cs.interrupt * 100)}%</b>}
                  {!cs.gate && cs.interrupt === 0 && (
                    <span className="bad">{cs.terminal && sc?.detection ? "detected only once the damage is done" : "nothing here - the attacker walks through"}</span>
                  )}
                  {sc?.measures.map((mm) => (
                    <span className="ft-step-m" key={mm.id} title={`${effectClassOf(mm)}: ${EFFECT_CHANNEL[effectClassOf(mm)]}`}>
                      {recordTitle(getType(tax, mm.type)!, mm)}
                      <i className="ft-cls">{effectClassOf(mm)}</i>
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        )}
      </>
    );
  } else {
    const s = scaleOf(tax, fe, "severity");
    source = (<><p className="ft-est">You estimate this. {s && <>Seeded from the feared event severity <b>{s.label}</b>.</>}</p>{openBtn(fe, "Feared event")}</>);
  }

  return createPortal(
    <div className="overlay" onMouseDown={onClose}>
      <div className="ft-card" onMouseDown={(e) => e.stopPropagation()}>
        <header className="ft-head">
          <div>
            <div className="ft-eyebrow">Factor</div>
            <h2>{m.title} <span className="mono ft-val">{fmtVal(selfVal, unit)}</span></h2>
          </div>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close"><Icon.close /></button>
        </header>
        <div className="ft-body">
          <div className="ft-sec-t">How it's calculated</div>
          <div className="ft-calc-path">
            <div className="ft-cstart">
              <span className="ft-cstart-l">{m.title}</span>
              <span className="ft-cstart-v mono">{fmtVal(selfVal, unit)}</span>
              <span className="ft-cstart-note">the factor you are tracing - it feeds the steps below</span>
            </div>
            {PATH[fkey].map((node) => {
              const eq = equation(node, vals);
              return (
                <div className={"ft-ceq" + (node === "ale" ? " final" : "")} key={node}>
                  <div className="ft-ceq-head">
                    <span className="ft-ceq-name">{NODE_NAME[node]}</span>
                    <span className="ft-ceq-res mono">{eq.approx ? "≈" : "="} {fmtVal(eq.result, NODE_UNIT[node])}</span>
                  </div>
                  <div className="ft-ceq-expr mono">
                    {eq.op === "vs" ? (
                      <>P( <Term t={eq.terms[0]} hit={eq.terms[0].label === m.title} /> <span className="ft-op2">&gt;</span> <Term t={eq.terms[1]} hit={eq.terms[1].label === m.title} /> )</>
                    ) : (
                      eq.terms.map((t, j) => <Fragment key={j}>{j > 0 && <span className="ft-op2">{eq.op}</span>}<Term t={t} hit={t.label === m.title} /></Fragment>)
                    )}
                    <span className="ft-op2">=</span> <b>{fmtVal(eq.result, NODE_UNIT[node])}</b>
                  </div>
                  <div className="ft-ceq-legend">
                    {eq.terms.map((t) => t.label).join(eq.op === "vs" ? " vs " : ` ${eq.op} `)}{eq.note ? ` · ${eq.note}` : ""}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="ft-sec-t">Where it comes from</div>
          {source}

          <div className="ft-sec-t">Adjust {overridden && <button className="ft-reset" onClick={onReset}>↺ reset to derived</button>}</div>
          <div className="ft-adjust"><DistInput label={m.title} value={range} onChange={onChange} unit={unit} lo={conf.lo} hi={conf.hi} log={conf.log} accent={accent} shape /></div>
        </div>
      </div>
    </div>, document.body);
}
