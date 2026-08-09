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
  rate: number; adv: number; ctl: number;
  tef: number; vuln: number; lef: number;
  direct: number; cascL: number; cascI: number; secondary: number; lm: number; ale: number;
}
interface Meta { title: string; kind: "attempts" | "capability" | "control" | "money" | "prob" }
const META: Record<FKey, Meta> = {
  attemptRate: { title: "Attempts per year", kind: "attempts" },
  adversaryStrength: { title: "Attacker capability", kind: "capability" },
  controlStrength: { title: "What an attempt has to beat", kind: "control" },
  directImpact: { title: "Direct impact", kind: "money" },
  cascadingLikelihood: { title: "Cascading likelihood", kind: "prob" },
  cascadingImpact: { title: "Cascading impact", kind: "money" },
};

// The chain of result nodes each factor flows through, up to the annual loss.
type Node = "tef" | "vuln" | "lef" | "secondary" | "lm" | "ale";
const PATH: Record<FKey, Node[]> = {
  attemptRate: ["tef", "lef", "ale"],
  adversaryStrength: ["vuln", "lef", "ale"],
  controlStrength: ["vuln", "lef", "ale"],
  directImpact: ["lm", "ale"],
  cascadingLikelihood: ["secondary", "lm", "ale"],
  cascadingImpact: ["secondary", "lm", "ale"],
};
const NODE_NAME: Record<Node, string> = { tef: "Attempts per year", vuln: "Vulnerability", lef: "Loss event frequency", secondary: "Secondary risk", lm: "Loss magnitude", ale: "Annual loss" };
const NODE_UNIT: Record<Node, Unit> = { tef: "rate", vuln: "prob", lef: "rate", secondary: "money", lm: "money", ale: "money" };
// The factor's own mean value (what the simulation actually uses) - keeps the
// header, the start node and the equations consistent.
const FVAL: Record<FKey, keyof Vals> = {
  attemptRate: "rate", adversaryStrength: "adv", controlStrength: "ctl",
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
    // One derived quantity now, not a product - how often contact happens and how often
    // it turns into an attempt are not separable from real data, so they are derived
    // together. The breakdown that produced this number is shown in the source panel.
    case "tef": return { op: "", result: v.tef, note: "how often this scenario is attempted, before anyone tries to stop it", terms: [{ label: "Attempts per year", value: v.rate, unit: "rate" }] };
    case "vuln": return { op: "vs", result: v.vuln, note: "P( capability > the bar ) - the share of attempts in which the drawn capability exceeds the scenario's demand and every defended step on at least one route through the chain, measured over the simulation", terms: [{ label: "Attacker capability", value: v.adv, unit: "prob" }, { label: "What an attempt has to beat", value: v.ctl, unit: "prob" }] };
    // Rates below 1/yr are far easier to judge as a return period, so say it in words too.
    case "lef": return { op: "×", result: v.lef,
      note: v.lef > 0 && v.lef < 1 ? `about one loss event every ${Math.round(1 / v.lef)} years` : undefined,
      terms: [{ label: "Attempts per year", value: v.tef, unit: "rate" }, { label: "Vulnerability", value: v.vuln, unit: "prob" }] };
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
  if (m.kind === "attempts") {
    // Show the multiplication, not a description of it. One evidenced base rate, then
    // ratios an analyst can argue with one at a time.
    const f = derived.frequency;
    const x = (n: number) => `×${n.toPrecision(2)}`;
    const rows: { label: string; value: string; from: string }[] = [
      { label: "Base rate", value: `${f.base.toPrecision(2)}/yr`, from: "actor class × sector" },
      { label: "Tempo", value: x(f.tempo), from: "how active this actor is" },
      { label: "Throughput", value: x(f.throughput), from: "how much it can run at once" },
      { label: "Target pull", value: x(f.pull), from: "whether it declared an objective on what this chain goes after" },
      { label: "Reachability", value: x(f.reachability), from: "how easily contact happens, from the entry technique" },
    ];
    source = (
      <>
        {openBtn(rs, "Risk source")}
        <p className="ft-calc">
          How often this scenario is attempted. One number, not two: how often contact
          happens and how often contact turns into an attempt cannot be told apart from
          real data, so they are derived together.
        </p>
        <div className="ft-steps">
          {rows.map((r) => (
            <div className="ft-step" key={r.label}>
              <span className="ft-step-n">{r.label} <em className="ft-step-join">· {r.from}</em></span>
              <span className="ft-step-c"><b className="ok">{r.value}</b></span>
            </div>
          ))}
          <div className="ft-step">
            <span className="ft-step-n"><b>Attempts per year</b></span>
            <span className="ft-step-c"><b className="ok">{fmtVal(f.total, "rate")}</b></span>
          </div>
        </div>
        {f.capped && <p className="ft-est">Capped: the multipliers together produced a rate no single scenario plausibly sees, which usually means one of the ratings is too high.</p>}
        {rs && <div className="ft-ratings">{["capability", "resources", "activity", "relevance"].map((k) => { const sc = scaleOf(tax, rs, k); return sc ? <div className="ft-rating" key={k}><span>{sc.field.label}</span><ScaleBars value={sc.value} max={sc.max} label={sc.label} positive={sc.field.polarity === "positive"} /></div> : null; })}</div>}
      </>
    );
  } else if (m.kind === "capability") {
    const s = scaleOf(tax, rs, "capability");
    source = (
      <>
        {openBtn(rs, "Risk source")}
        {s && <p className="ft-calc">{s.field.label} = <b>{s.label}</b> ({s.value}/{s.max}) → this actor out-performs about <b>{Math.round(range.mode * 100)}%</b> of all attackers (range {Math.round(range.min * 100)}-{Math.round(range.max * 100)}%). That is what gets compared against the bar below.</p>}
        {rs && <div className="ft-ratings">{["capability", "resources", "activity", "relevance"].map((k) => { const sc = scaleOf(tax, rs, k); return sc ? <div className="ft-rating" key={k}><span>{sc.field.label}</span><ScaleBars value={sc.value} max={sc.max} label={sc.label} positive={sc.field.polarity === "positive"} /></div> : null; })}</div>}
      </>
    );
  } else if (m.kind === "control") {
    const diff = scaleOf(tax, op, "difficulty");
    const dm = derived.demand;
    const chain = derived.chain;
    // Walk the chain in TRAVERSAL order (that is what the simulation does), pulling each
    // step's measures from the coverage detail.
    const walk = (chain ?? []).map((cs) => ({ cs, sc: derived.coverage.steps.find((s) => s.step.id === cs.id) }));
    source = (
      <>
        {openBtn(op, "Attack chain")}
        {dm ? (
          <>
            <p className="ft-calc">
              What the attack itself demands, read off the chain below: an attacker has to
              out-perform about <b>{Math.round(range.mode * 100)}%</b> of the field before any
              measure of yours is counted. Each measure then adds to that at the step it sits on.
            </p>
            <div className="ft-steps">
              <div className="ft-step">
                <span className="ft-step-n">Getting in <em className="ft-step-join">· the entry technique</em></span>
                <span className="ft-step-c"><b className="ok">{Math.round(dm.entry * 100)}%</b></span>
              </div>
              <div className="ft-step">
                <span className="ft-step-n">Tooling <em className="ft-step-join">· {dm.tooling >= 1 ? "has to be built for the job" : dm.tooling > 0 ? "takes a practitioner" : "downloadable tools are enough"}</em></span>
                <span className="ft-step-c"><b className="ok">+{Math.round(dm.adds.tooling * 100)}%</b></span>
              </div>
              <div className="ft-step">
                <span className="ft-step-n">Breadth <em className="ft-step-join">· spans {dm.tactics} distinct {dm.tactics === 1 ? "tactic" : "tactics"}</em></span>
                <span className="ft-step-c"><b className="ok">+{Math.round(dm.adds.depth * 100)}%</b></span>
              </div>
              <div className="ft-step">
                <span className="ft-step-n">Staying in <em className="ft-step-join">· {dm.dwell > 0 ? "needs persistence, evasion or lateral movement" : "one pass, no need to stay"}</em></span>
                <span className="ft-step-c"><b className="ok">+{Math.round(dm.adds.dwell * 100)}%</b></span>
              </div>
              <div className="ft-step">
                <span className="ft-step-n"><b>What the attack demands</b></span>
                <span className="ft-step-c"><b className="ok">{Math.round(dm.total * 100)}%</b></span>
              </div>
            </div>
            <p className="ft-calc">
              A step is only a further hurdle if something blocks or detects him there. Steps
              with nothing on them cost him nothing - so splitting the chain into more steps
              never makes it look safer.
            </p>
          </>
        ) : (
          <p className="ft-calc">
            No kill-chain steps here, so there is nothing to read the demand off.
            {diff && <> The difficulty rating stands in: <b>{diff.label}</b> ({diff.value}/{diff.max}) → </>}
            an attacker has to out-perform about <b>{Math.round(range.mode * 100)}%</b> of the field.
            Model the chain and this becomes derived instead of rated.
          </p>
        )}
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
