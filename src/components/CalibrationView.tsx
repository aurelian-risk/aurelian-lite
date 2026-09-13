// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// The calibration, laid open: every number the quantification runs on, what it
// answers, what it changes, and where the default came from - editable in place.
//
// The point of this view is that the figures become arguable. A model whose settings
// are buried in the source can only be believed or dismissed; one whose settings are on
// the table can be discussed, corrected and agreed. Editing here changes every result
// in the app, which is why each table carries its question and its provenance next to
// the inputs rather than in documentation somewhere else.
import { useState } from "react";
import { t as tr } from "../domain/i18n";

import type { Study } from "../domain/types";
import { useStore } from "../domain/store";
import { foldScope, getFolds, setFolds } from "../domain/viewstate";
import { Icon } from "./ui";
import {
  CALIBRATION_DOC, DEFAULT_CALIBRATION, SECTORS, SIZES, isDefaultCalibration, ownRateOf,
  type Band as Band2, type SectorRow, type TableDoc,
} from "../domain/calibration";
import { MITRE_TECHNIQUES } from "../domain/mitre";
import { effectChannel } from "../domain/controls";
import { AddTechnique, Dial, DialRow, Seg } from "./CalInputs";
import { DepthCurve } from "./CalDepth";
import { DistInput } from "./DistInput";

/** Replace one nested value without mutating the rest. */
function setIn<T>(obj: T, path: (string | number)[], value: unknown): T {
  if (!path.length) return value as T;
  const [head, ...rest] = path;
  if (Array.isArray(obj)) {
    const copy = [...obj] as unknown[];
    copy[head as number] = setIn(copy[head as number], rest, value);
    return copy as unknown as T;
  }
  const rec = obj as Record<string, unknown>;
  return { ...rec, [head]: setIn(rec[head], rest, value) } as T;
}

/** A table with its question, what it changes, and where its default came from. */
function Table({ docKey, changed, onReset, children }: {
  docKey: string; changed: boolean; onReset: () => void; children: React.ReactNode;
}) {
  const doc: TableDoc | undefined = CALIBRATION_DOC[docKey];
  const [why, setWhy] = useState(false);
  if (!doc) return null;
  return (
    <section className="cal-table">
      <header className="cal-head">
        <h3>
          {doc.title}
          <span className={"cal-grade " + doc.grade} title={GRADE_HINT[doc.grade]}>{doc.grade}</span>
          {/* Always rendered, only hidden - appearing on edit would reflow the header. */}
          <em className={"cal-edited" + (changed ? "" : " off")}>edited</em>
        </h3>
        <div className="cal-head-act">
          <button className="cal-why" onClick={() => setWhy((v) => !v)}>{why ? "less" : "why these numbers"}</button>
          <button className={"cal-reset" + (changed ? "" : " off")} onClick={onReset}>reset this table</button>
        </div>
      </header>
      <p className="cal-q">{doc.question}</p>
      {why && (
        <div className="cal-why-box">
          <p><b>{tr('ui.calibration.what-it-changes', 'What it changes.')}</b> {doc.effect}</p>
          {doc.source && <p><b>{tr('ui.calibration.source', 'Source.')}</b> {doc.source}</p>}
          <p><b>{tr('ui.calibration.how-the-default-was', 'How the default was arrived at.')}</b> {doc.origin}</p>
        </div>
      )}
      <div className="cal-body">{children}</div>
    </section>
  );
}

/** A band read off a 1..N rating, one dial per level. */
function Band({ labels, values, dflt, onChange, lo, hi, step, kind }: {
  labels: string[]; values: number[]; dflt: number[]; onChange: (i: number, n: number) => void;
  lo: number; hi: number; step: number; kind: "pct" | "mult" | "rate";
}) {
  return (
    <div className="dial-rows">
      {values.map((v, i) => (
        <DialRow key={i} name={labels[i] ?? `level ${i + 1}`} value={v} dflt={dflt[i] ?? v}
          lo={lo} hi={hi} step={step} kind={kind} onChange={(n) => onChange(i, n)} />
      ))}
    </div>
  );
}

const RATING = ["lowest", "low", "high", "highest"];
const SEVERITY = ["negligible", "noticeable", "severe", "existential"];
const TOOL_OPTS = [
  { v: 0, label: "commodity", title: "Tools anyone can download" },
  { v: 0.5, label: "practitioner", title: "Takes somebody who knows the craft" },
  { v: 1, label: "bespoke", title: "Has to be built for the job" },
];
/** Name of a curated technique, so the identifiers are not bare. */
const TECH_NAME = new Map(MITRE_TECHNIQUES.map((t) => [t.id, t.name]));
const techName = (id: string) => TECH_NAME.get(id) ?? "";
/** One subject of the calibration, folded by default: sixteen tables in one run was a
 *  wall, and the reader who came for the loss bands scrolled past the tempo multipliers
 *  to reach them. A chapter says what it holds and whether anything in it was edited,
 *  and opens on a click; which chapters are open is remembered with the reader, like
 *  every other fold, and never in the study. */
function Chapter({ id, title, lead, edited, tables, open, onToggle, children }: {
  id: string; title: string; lead: string; edited: boolean; tables: number;
  open: boolean; onToggle: (id: string) => void; children: React.ReactNode;
}) {
  return (
    <section className={"cal-chapter" + (open ? " open" : "")}>
      <button type="button" className="cal-chapter-h" onClick={() => onToggle(id)} aria-expanded={open}>
        <span className={"caret" + (open ? " open" : "")}><Icon.chevron /></span>
        <span className="cal-chapter-t">{title}</span>
        <span className="cal-chapter-lead">{lead}</span>
        <span className="spacer" />
        {edited && <em className="cal-edited">edited</em>}
        <span className="cal-chapter-n">{tables} {tables === 1 ? "table" : "tables"}</span>
      </button>
      {open && <div className="cal-chapter-b">{children}</div>}
    </section>
  );
}

/** The second level inside a chapter: the figures a reader argues with first stand
 *  open; the fine tuning behind them - multipliers, weights, fallbacks - is folded. */
function Depth({ id, title, edited, open, onToggle, children }: {
  id: string; title: string; edited: boolean; open: boolean; onToggle: (id: string) => void; children: React.ReactNode;
}) {
  return (
    <div className={"cal-depth" + (open ? " open" : "")}>
      <button type="button" className="cal-depth-h" onClick={() => onToggle(id)} aria-expanded={open}>
        <span className={"caret" + (open ? " open" : "")}><Icon.chevron /></span>
        <span>{title}</span>
        {edited && <em className="cal-edited">edited</em>}
      </button>
      {open && <div className="cal-depth-b">{children}</div>}
    </div>
  );
}

const GRADE_HINT: Record<string, string> = {
  own: "This organisation's own record, entered by the analyst.",
  measured: "Published figure. Source named, derivation documented.",
  derived: "Published figure plus a stated assumption.",
  judgement: "No published figure. Set by reasoning.",
};
/** The tactics the bundled reference knows, in the order it lists them. */
const TACTIC_NAMES = [...new Set(MITRE_TECHNIQUES.map((t) => t.tactic))];

/** `scope` decides which tables are shown. The quantification workshop takes the whole
 *  calibration; the treatment workshop takes only what a measure is worth, because that
 *  is the part its tables are about - same panel, same controls, fewer sections. */
export function CalibrationView({ study, color, scope = "all" }: {
  study: Study; color: string; scope?: "all" | "measures";
}) {
  const all = scope === "all";
  const cal = study.calibration ?? DEFAULT_CALIBRATION;
  const setCal = useStore((s) => s.setCalibration);
  const resetAll = () => (all ? setCal(null) : resetPaths(["effect"]));
  const [open, setOpen] = useState(false);
  const [lvl, setLvl] = useState(cal.effect.levelWeight.length - 1);
  // The scale's own labels - "none / partial / substantial / full" - not invented ones.
  const tax = useStore((s) => s.taxonomy);
  const levelLabels = tax.entityTypes.flatMap((t) => t.fields)
    .find((f) => f.key === "implementation_level")?.scaleLabels
    ?? cal.effect.levelWeight.map((_, i) => `level ${i + 1}`);

  const put = (path: (string | number)[], value: unknown) => setCal(setIn(cal, path, value));
  /** Take a key out of a table - only ever a key the reader added; a bundled row is
   *  reset, not removed, so the table keeps the shape the documentation describes. */
  const drop = (path: (string | number)[], key: string) => {
    let table: unknown = cal;
    for (const k of path) table = (table as Record<string, unknown>)?.[k as string];
    const next = { ...(table as Record<string, unknown>) };
    delete next[key];
    setCal(setIn(cal, path, next));
  };

  /** Restore one or more branches of the defaults, leaving every other edit in place.
   *  Several branches are folded into ONE update on purpose: calling a single-path
   *  reset twice in a row would build each from the same stale value, and the second
   *  would silently undo the first. */
  const resetPaths = (...paths: (string | number)[][]) => {
    let next = cal;
    for (const path of paths) {
      let dv: unknown = DEFAULT_CALIBRATION;
      for (const k of path) dv = (dv as Record<string, unknown>)[k as string];
      next = setIn(next, path, structuredClone(dv));
    }
    setCal(next);
  };
  const resetPath = (path: (string | number)[]) => resetPaths(path);
  const differs = (path: (string | number)[]) => {
    let a: unknown = cal, b: unknown = DEFAULT_CALIBRATION;
    for (const k of path) { a = (a as Record<string, unknown>)?.[k as string]; b = (b as Record<string, unknown>)?.[k as string]; }
    return JSON.stringify(a) !== JSON.stringify(b);
  };

  const changedInScope = all ? !isDefaultCalibration(cal) : differs(["effect"]);
  // Which chapters and depths are open. Stored as the OPEN set (everything folded is the
  // default, so the study opens as an overview), in the reader's view state.
  const foldKey = foldScope(study.id, "calibration");
  const [opened, setOpened] = useState<Set<string>>(() => getFolds(foldKey));
  const isOpen = (id: string) => opened.has(id);
  const toggleOpen = (id: string) => setOpened((o) => { const n = new Set(o); n.has(id) ? n.delete(id) : n.add(id); setFolds(foldKey, n); return n; });
  const D = DEFAULT_CALIBRATION;
  const f = cal.frequency, d = cal.demand, e = cal.effect, mg = cal.magnitude;
  const actors = Object.keys(f.baseRate);
  // Ranked by what they demand, not by identifier: the point of the table is the
  // ordering, and a list sorted by T-number hides it completely.
  const ranked = [1, 0.5, 0].map((v) => ({
    v, label: TOOL_OPTS.find((o) => o.v === v)!.label,
    ids: Object.keys(d.tooling).filter((t) => d.tooling[t] === v)
      .sort((a, b) => (techName(a) || a).localeCompare(techName(b) || b)),
  })).filter((g) => g.ids.length);

  const head = (
    <div className="panel-head">
      <h3>{all ? tr("ui.calibration.calibration", "Calibration") : tr("ui.calibration.control-parametrization", "Control parametrization")}</h3>
      <span className="spacer" />
      <span className="hint">
        {all
          ? tr("ui.calibration.sub-all", "parameter adjustment — the settings the figures are computed from")
          : tr("ui.calibration.sub-effect", "parameter adjustment — what a measure is worth, and what layers of them add")}
      </span>
      <span className={"badge" + (changedInScope ? "" : " off")}>{tr("ui.calibration.changed", "changed")}</span>
      <button className="btn sm" onClick={() => setOpen(!open)}>{open ? tr("ui.calibration.close", "Close") : tr("ui.calibration.adjust", "Adjust")}</button>
    </div>
  );
  if (!open) {
    return (
      <div className="panel ws-accent cal" style={{ ["--ws-color" as string]: color, marginBottom: 20 }}>{head}</div>
    );
  }

  const effectTables = (
    <>
      <Table docKey="effect.depth"
        changed={["levelWeight", "strengthWeight", "statusWeight", "controlCeiling", "prevention"].some((k) => differs(["effect", k]))}
        onReset={() => resetPaths(["effect", "levelWeight"], ["effect", "strengthWeight"], ["effect", "statusWeight"], ["effect", "controlCeiling"], ["effect", "prevention"])}>
        <p className="cal-lead">
          {tr('ui.calibration.everything-below-rests-on', 'Everything below rests on one idea. An attack needs a certain level of skill to get\n          past a step, and a security measure raises that level. Skill is expressed as a rank\n          among attackers - &quot;better than 84% of them&quot;. The higher the level a step\n          demands, the fewer attempts clear it.')}
        </p>
        <DepthCurve effect={e} capability={cal.adversary.capability[2] ?? cal.adversary.capability[0]}
          spread={d.spread} levels={levelLabels} level={lvl} onLevel={setLvl} />
        <p className="cal-sub">
          {tr('ui.calibration.how-much-a-measure', 'How much a measure counts at each stage of its roll-out, against a finished one:')}
        </p>
        <Band labels={levelLabels} values={e.levelWeight} dflt={D.effect.levelWeight}
          lo={0} hi={1} step={0.01} kind="mult" onChange={(i, n) => put(["effect", "levelWeight", i], n)} />
        <p className="cal-sub">
          How much a measure of each strength reaches of the ceiling, when fully in force. The
          library rates its measures from published evidence; an unrated measure counts as very strong:
        </p>
        <Band labels={["weak", "moderate", "strong", "very strong"]} values={e.strengthWeight ?? [0.4, 0.65, 0.85, 1]} dflt={D.effect.strengthWeight}
          lo={0} hi={1} step={0.01} kind="mult" onChange={(i, n) => put(["effect", "strengthWeight", i], n)} />
        <p className="cal-sub">
          How much it counts depending on whether it exists yet. The two multiply: a measure
          that is only planned and only partly rolled out protects{" "}
          {Math.round((e.levelWeight[1] ?? 0) * (e.statusWeight.Planned ?? 0) * e.controlCeiling * 100)}% of its step.
        </p>
        <div className="dial-rows">
          {Object.keys(e.statusWeight).map((k) => (
            <DialRow key={k} name={k} value={e.statusWeight[k]} dflt={D.effect.statusWeight[k] ?? 0}
              lo={0} hi={1} step={0.05} kind="mult" onChange={(n) => put(["effect", "statusWeight", k], n)} />
          ))}
          <DialRow name="The most one measure can protect on its own"
            hint="no single control is perfect; several together can go higher"
            value={e.controlCeiling} dflt={D.effect.controlCeiling}
            lo={0} hi={1} step={0.01} kind="pct" onChange={(n) => put(["effect", "controlCeiling"], n)} />
          <DialRow name="How much more skill a fully protected step demands"
            hint={`a step protected 100% lifts the requirement by this much - from "better than 50% of attackers" to "better than ${Math.round((0.5 + e.prevention) * 100)}%"`}
            value={e.prevention} dflt={D.effect.prevention}
            lo={0} hi={1} step={0.01} kind="pct" onChange={(n) => put(["effect", "prevention"], n)} />
        </div>
      </Table>

      <Table docKey="effect" changed={differs(["effect"])} onReset={() => resetPath(["effect"])}>
        {([
          ["Detective", [
            ["detection", "How often a spotted intrusion is actually stopped", "an alarm that nobody follows up changes nothing, so only part of what a detective measure sees ends the intrusion"],
            ["responseFloor", "Assumed ability to react when none is recorded", "the model reads that ability from the recovery measures in the study; where a study records none, it assumes this rather than nothing - some reaction always happens"],
            ["lateDetection", "Spotting it while the damage is happening", "at the last step of the chain there is nothing left to prevent, so detection only shortens the event and takes this much off the bill"],
          ]],
          ["Corrective", [
            ["recoverableShare", "The most recovery can take off the bill", "fines, notification duties and lost reputation stay, however good the backups"],
            ["containment", "Cuts the chance of a knock-on loss by", ""],
          ]],
          ["Deterrent", [["deterrence", "Cuts the number of attacks by", ""]]],
          ["Avoidance", [["avoidance", "Cuts the number of attacks by", "by removing the exposure, so contact happens less often"]]],
        ] as const).map(([cls, rows]) => (
          <div className="cal-class" key={cls}>
            <p className="cal-class-h">
              <b>{cls}</b>
              <em>{effectChannel(cls)}</em>
            </p>
            <div className="dial-rows">
              {rows.map(([k, name, hint]) => (
                <DialRow key={k} name={name} hint={hint || undefined} value={e[k] as number} dflt={D.effect[k] as number}
                  lo={0} hi={1} step={0.01} kind="pct" onChange={(n) => put(["effect", k], n)} />
              ))}
            </div>
          </div>
        ))}
        <p className="cal-sub">
          {tr('ui.calibration.preventive-measures-are-the', 'Preventive measures are the fifth class; what they are worth is set in the\n          defence-in-depth table above, because it depends on how many sit on a step.')}
        </p>
      </Table>
    </>
  );

  return (
    <div className="panel ws-accent cal" style={{ ["--ws-color" as string]: color, marginBottom: 20 }}>
      {head}
      <div className="panel-body cal-body">
      <div className="cal-intro">
        <p>
          {all
            ? "The parameters this study's quantification runs on. Edits take effect immediately, are stored with the study and are included in every export of it."
            : "What a measure is worth, and what several on the same step add up to. The same parameters the quantification uses - edits here change both. Stored with the study and included in every export of it."}
        </p>
        <p>
          {tr('ui.calibration.each-table-is-graded', 'Each table is graded by its basis:')} <b>measured</b> is a published figure with the
          derivation documented, <b>derived</b> adds a stated assumption, <b>judgement</b>{" "}
          means no published figure answers the question. &quot;Why these numbers&quot;
          shows the source and the derivation.
        </p>
        {/* Always in the layout: appearing on the first edit would shove every table
            below it down the page. */}
        <div className="cal-actions">
          <span className={"cal-state" + (changedInScope ? " edited" : "")}>
            {changedInScope ? "Changed from the defaults." : "Defaults, unchanged."}
          </span>
          <button className={"btn danger sm" + (changedInScope ? "" : " off")} onClick={resetAll}>
            Reset {all ? "all tables" : "these tables"} to defaults
          </button>
        </div>
      </div>

      {all && <>
      <Chapter id="freq" title={tr('ui.calibration.how-often-a-scenario', 'How often a scenario is attempted')}
        lead="base rate by actor class, size, sector, your own record - and the multipliers on it"
        edited={differs(["frequency"])} tables={9} open={isOpen("freq")} onToggle={toggleOpen}>

      <Table docKey="frequency.baseRate" changed={differs(["frequency", "baseRate"]) || differs(["frequency", "baseRateDefault"])}
        onReset={() => resetPaths(["frequency", "baseRate"], ["frequency", "baseRateDefault"])}>
        <div className="dial-rows">
          {actors.map((a) => (
            <DialRow key={a} name={a} value={f.baseRate[a]} dflt={D.frequency.baseRate[a] ?? f.baseRate[a]}
              lo={0.005} hi={3} step={0.005} kind="rate" log
              onChange={(n) => put(["frequency", "baseRate", a], n)} />
          ))}
          <DialRow name="Any other class" value={f.baseRateDefault} dflt={D.frequency.baseRateDefault}
            lo={0.005} hi={3} step={0.005} kind="rate" log
            onChange={(n) => put(["frequency", "baseRateDefault"], n)} />
        </div>
      </Table>

      <Table docKey="frequency.size" changed={differs(["frequency", "size"])} onReset={() => resetPath(["frequency", "size"])}>
        <div className="dial-rows">
          {SIZES.map((z) => (
            <DialRow key={z} name={z} value={f.size[z] ?? 1} dflt={D.frequency.size[z] ?? 1}
              lo={0.2} hi={5} step={0.05} kind="mult" onChange={(n) => put(["frequency", "size", z], n)} />
          ))}
        </div>
      </Table>

      <Table docKey="frequency.history" changed={differs(["frequency", "history"])} onReset={() => resetPath(["frequency", "history"])}>
        {(() => {
          const h = f.history;
          const exposure = h.years * h.organisations;
          const num = (path: (string | number)[], v: number, min: number, step: number, width = 64) => (
            <input type="number" className="cal-num" value={v} min={min} step={step} style={{ width }}
              onChange={(ev) => { const n = Number(ev.target.value); if (Number.isFinite(n) && n >= min) put(path, n); }} />
          );
          return (
            <div className="dial-rows">
              <div className="dial-row">
                <span className="dial-k">Years the record covers<em>0 = no record, the bundled rates stand</em></span>
                {num(["frequency", "history", "years"], h.years, 0, 1)}
              </div>
              <div className="dial-row">
                <span className="dial-k">Organisations in it<em>1 for your own; more where a group's or a peer set's incidents were pooled</em></span>
                {num(["frequency", "history", "organisations"], h.organisations, 1, 1)}
              </div>
              {actors.map((a) => {
                const n = h.counts[a];
                const own = ownRateOf(f, a);
                return (
                  <div className="dial-row" key={a}>
                    <span className="dial-k">{a}
                      <em>{own != null
                        ? `(${n} + ½) ÷ ${exposure} = ${own.toPrecision(2)}/yr - bundled ${(f.baseRate[a] ?? f.baseRateDefault).toPrecision(2)}/yr`
                        : exposure > 0 ? "no entry - the bundled rate stands" : ""}</em>
                    </span>
                    <input type="number" className="cal-num" value={n ?? ""} min={0} step={1} style={{ width: 64 }}
                      placeholder="seen" aria-label={`${a}: operations seen over the record`}
                      onChange={(ev) => {
                        const v = ev.target.value;
                        const next = { ...h.counts };
                        if (v === "") delete next[a]; else { const k = Number(v); if (Number.isFinite(k) && k >= 0) next[a] = k; }
                        put(["frequency", "history", "counts"], next);
                      }} />
                  </div>
                );
              })}
            </div>
          );
        })()}
      </Table>

      <Table docKey="frequency.sector" changed={differs(["frequency", "sector"])} onReset={() => resetPath(["frequency", "sector"])}>
        <div className="dial-rows">
          {f.sector.map((row: SectorRow, i: number) => (
            <div className="dial-row" key={i}>
              <span className="dial-k pair">
                <select className="cal-sel" value={row.actor} onChange={(ev) => put(["frequency", "sector", i, "actor"], ev.target.value)}>
                  {actors.map((a) => <option key={a}>{a}</option>)}
                </select>
                <select className="cal-sel" value={row.sector} onChange={(ev) => put(["frequency", "sector", i, "sector"], ev.target.value)}>
                  {SECTORS.map((sc) => <option key={sc}>{sc}</option>)}
                </select>
              </span>
              <Dial name={`${row.actor} attacking ${row.sector}`} value={row.factor} dflt={1} lo={0.2} hi={4} step={0.05} kind="mult"
                onChange={(n) => put(["frequency", "sector", i, "factor"], n)} />
              <button className="cal-del" title={tr('ui.calibration.remove-this-exception', 'Remove this exception')}
                onClick={() => put(["frequency", "sector"], f.sector.filter((_x: SectorRow, k: number) => k !== i))}>×</button>
            </div>
          ))}
          <button className="cal-add" onClick={() => put(["frequency", "sector"], [...f.sector, { actor: actors[0], sector: SECTORS[0], factor: 1.5 }])}>
            + add an exception
          </button>
        </div>
      </Table>

      <Depth id="freq.mult" title="The multipliers - tempo, throughput, why us, reachability, the cap"
        edited={["tempo", "throughput", "targetPull", "reachability", "reachabilityDefault", "cap", "likelihoodBands"].some((k) => differs(["frequency", k]))}
        open={isOpen("freq.mult")} onToggle={toggleOpen}>
      <Table docKey="frequency.tempo" changed={differs(["frequency", "tempo"])} onReset={() => resetPath(["frequency", "tempo"])}>
        <Band labels={["dormant", "occasional", "regular", "persistent"]} values={f.tempo} dflt={D.frequency.tempo}
          lo={0.1} hi={3} step={0.05} kind="mult" onChange={(i, n) => put(["frequency", "tempo", i], n)} />
      </Table>

      <Table docKey="frequency.throughput" changed={differs(["frequency", "throughput"])} onReset={() => resetPath(["frequency", "throughput"])}>
        <Band labels={RATING} values={f.throughput} dflt={D.frequency.throughput}
          lo={0.1} hi={3} step={0.05} kind="mult" onChange={(i, n) => put(["frequency", "throughput", i], n)} />
      </Table>

      <Table docKey="frequency.targetPull" changed={differs(["frequency", "targetPull"])} onReset={() => resetPath(["frequency", "targetPull"])}>
        <div className="dial-rows">
          <DialRow name="Declared an objective on what this chain goes after"
            value={f.targetPull.declared} dflt={D.frequency.targetPull.declared} lo={0.2} hi={4} step={0.05} kind="mult"
            onChange={(n) => put(["frequency", "targetPull", "declared"], n)} />
          <DialRow name="Has objectives, but none of them match"
            value={f.targetPull.noMatch} dflt={D.frequency.targetPull.noMatch} lo={0.2} hi={4} step={0.05} kind="mult"
            onChange={(n) => put(["frequency", "targetPull", "noMatch"], n)} />
        </div>
        <p className="cal-sub">{tr('ui.calibration.no-objectives-modelled-the', 'No objectives modelled - the actor&apos;s relevance rating stands in:')}</p>
        <Band labels={["unlikely", "possible", "likely", "very likely"]} values={f.targetPull.byRelevance}
          dflt={D.frequency.targetPull.byRelevance} lo={0.2} hi={4} step={0.05} kind="mult"
          onChange={(i, n) => put(["frequency", "targetPull", "byRelevance", i], n)} />
      </Table>

      <Table docKey="frequency.reachability" changed={differs(["frequency", "reachability"]) || differs(["frequency", "cap"])}
        onReset={() => resetPaths(["frequency", "reachability"], ["frequency", "reachabilityDefault"], ["frequency", "cap"])}>
        <div className="dial-rows">
          {Object.keys(f.reachability).map((t) => (
            <DialRow key={t} name={t} hint={techName(t)} value={f.reachability[t]}
              dflt={D.frequency.reachability[t] ?? f.reachabilityDefault} lo={0.2} hi={3} step={0.05} kind="mult"
              onChange={(n) => put(["frequency", "reachability", t], n)}
              onRemove={t in D.frequency.reachability ? undefined : () => drop(["frequency", "reachability"], t)} />
          ))}
          <AddTechnique have={Object.keys(f.reachability)} tactic="Initial Access" options={MITRE_TECHNIQUES}
            placeholder="Another entry technique" onAdd={(id) => put(["frequency", "reachability", id], f.reachabilityDefault)} />
          <DialRow name="Any other entry technique" value={f.reachabilityDefault} dflt={D.frequency.reachabilityDefault}
            lo={0.2} hi={3} step={0.05} kind="mult" onChange={(n) => put(["frequency", "reachabilityDefault"], n)} />
          <DialRow name="Never more than" hint="cap on the product" value={f.cap} dflt={D.frequency.cap}
            lo={1} hi={50} step={1} kind="rate" onChange={(n) => put(["frequency", "cap"], n)} />
        </div>
      </Table>

      <Table docKey="frequency.likelihoodBands" changed={differs(["frequency", "likelihoodBands"])} onReset={() => resetPath(["frequency", "likelihoodBands"])}>
        <Band labels={f.likelihoodBands.map((_b: number, i: number) => `level ${i + 1} → ${i + 2}`)}
          values={f.likelihoodBands} dflt={D.frequency.likelihoodBands} lo={0.001} hi={5} step={0.001} kind="rate"
          onChange={(i, n) => put(["frequency", "likelihoodBands", i], n)} />
      </Table>

      </Depth>
      </Chapter>

      <Chapter id="demand" title={tr('ui.calibration.what-an-attempt-is', 'What an attempt is up against')}
        lead="what the first foothold costs, what the chain adds, how capable the attacker is"
        edited={differs(["demand"]) || differs(["adversary"])} tables={5} open={isOpen("demand")} onToggle={toggleOpen}>

      <Table docKey="demand.entry" changed={differs(["demand", "entry"]) || differs(["demand", "grantedAccess"])}
        onReset={() => resetPaths(["demand", "entry"], ["demand", "entryDefault"], ["demand", "grantedAccess"])}>
        <div className="dial-rows">
          {Object.keys(d.entry).map((t) => (
            <DialRow key={t} name={t} hint={techName(t)} value={d.entry[t]} dflt={D.demand.entry[t] ?? d.entryDefault}
              lo={0} hi={1} step={0.01} kind="pct" onChange={(n) => put(["demand", "entry", t], n)}
              onRemove={t in D.demand.entry ? undefined : () => drop(["demand", "entry"], t)} />
          ))}
          <AddTechnique have={Object.keys(d.entry)} tactic="Initial Access" options={MITRE_TECHNIQUES}
            placeholder="Another entry technique" onAdd={(id) => put(["demand", "entry", id], d.entryDefault)} />
          <DialRow name="Any other entry" value={d.entryDefault} dflt={D.demand.entryDefault}
            lo={0} hi={1} step={0.01} kind="pct" onChange={(n) => put(["demand", "entryDefault"], n)} />
          <DialRow name="Discount where a stakeholder grants the access" value={d.grantedAccess} dflt={D.demand.grantedAccess}
            lo={0} hi={0.5} step={0.01} kind="pct" onChange={(n) => put(["demand", "grantedAccess"], n)} />
        </div>
      </Table>

      <Depth id="demand.fine" title="The fine tuning - what the chain adds, tooling per technique, the fallback"
        edited={["wTooling", "wDepth", "wDwell", "depthSaturates", "dwellTactics", "spread", "tooling", "toolingByTactic", "difficultyFallback"].some((k) => differs(["demand", k]))}
        open={isOpen("demand.fine")} onToggle={toggleOpen}>
      <Table docKey="demand.weights" changed={["wTooling", "wDepth", "wDwell", "depthSaturates", "dwellTactics", "spread"].some((k) => differs(["demand", k]))}
        onReset={() => resetPaths(...["wTooling", "wDepth", "wDwell", "depthSaturates", "dwellSaturates", "dwellTactics", "spread", "floor"].map((k) => ["demand", k]))}>
        <div className="dial-rows">
          <DialRow name="Tooling maturity adds at most" value={d.wTooling} dflt={D.demand.wTooling}
            lo={0} hi={0.6} step={0.01} kind="pct" onChange={(n) => put(["demand", "wTooling"], n)} />
          <DialRow name="Breadth adds at most" value={d.wDepth} dflt={D.demand.wDepth}
            lo={0} hi={0.6} step={0.01} kind="pct" onChange={(n) => put(["demand", "wDepth"], n)} />
          <DialRow name="…reaching its full value at" hint="distinct tactics" value={d.depthSaturates} dflt={D.demand.depthSaturates}
            lo={2} hi={14} step={1} kind="int" onChange={(n) => put(["demand", "depthSaturates"], n)} />
          <DialRow name="Having to stay inside adds at most" value={d.wDwell} dflt={D.demand.wDwell}
            lo={0} hi={0.6} step={0.01} kind="pct" onChange={(n) => put(["demand", "wDwell"], n)} />
          <DialRow name="Spread either side of the derived bar" value={d.spread} dflt={D.demand.spread}
            lo={0} hi={0.5} step={0.01} kind="pct" onChange={(n) => put(["demand", "spread"], n)} />
        </div>
        <p className="cal-sub">{tr('ui.calibration.tactics-that-count-as', 'Tactics that count as having to stay inside:')}</p>
        <div className="cal-chips">
          {TACTIC_NAMES.map((t) => {
            const on = d.dwellTactics.includes(t);
            return (
              <button key={t} className={"cal-chip" + (on ? " on" : "")}
                onClick={() => put(["demand", "dwellTactics"], on ? d.dwellTactics.filter((x: string) => x !== t) : [...d.dwellTactics, t])}>
                {t}
              </button>
            );
          })}
        </div>
      </Table>

      <Table docKey="demand.tooling" changed={differs(["demand", "tooling"]) || differs(["demand", "toolingByTactic"])}
        onReset={() => resetPaths(["demand", "tooling"], ["demand", "toolingByTactic"])}>
        <p className="cal-sub">{tr('ui.calibration.by-tactic-used-where', 'By tactic - used where a technique is not listed below:')}</p>
        <div className="seg-grid">
          {Object.keys(d.toolingByTactic).sort((a, b) => d.toolingByTactic[b] - d.toolingByTactic[a] || a.localeCompare(b)).map((t) => (
            <div className="seg-row" key={t}>
              <span className="seg-k">{t}</span>
              <Seg name={t} value={d.toolingByTactic[t]} dflt={D.demand.toolingByTactic[t] ?? 0} options={TOOL_OPTS}
                onChange={(n) => put(["demand", "toolingByTactic", t], n)} />
            </div>
          ))}
        </div>
        {ranked.map((g) => (
          <div key={g.v}>
            <p className="cal-sub">{g.label} <span className="cal-count">{g.ids.length}</span></p>
            <div className="seg-grid">
              {g.ids.map((t) => (
                <div className="seg-row" key={t}>
                  <span className="seg-k" title={`${t} ${techName(t)}`}>
                    <b className="mono">{t}</b> {techName(t)}
                  </span>
                  <Seg name={t} value={d.tooling[t]} dflt={D.demand.tooling[t] ?? 0} options={TOOL_OPTS}
                    onChange={(n) => put(["demand", "tooling", t], n)} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </Table>

      <Table docKey="demand.difficultyFallback" changed={differs(["demand", "difficultyFallback"])} onReset={() => resetPath(["demand", "difficultyFallback"])}>
        <Band labels={RATING} values={d.difficultyFallback} dflt={D.demand.difficultyFallback}
          lo={0} hi={1} step={0.01} kind="pct" onChange={(i, n) => put(["demand", "difficultyFallback", i], n)} />
      </Table>

      </Depth>
      <Table docKey="adversary.capability" changed={differs(["adversary", "capability"])} onReset={() => resetPath(["adversary", "capability"])}>
        <div className="cal-curves">
          {cal.adversary.capability.map((b: Band2, i: number) => (
            <DistInput key={i} label={RATING[i] ?? `level ${i + 1}`}
              value={b} unit="prob" lo={0} hi={1} accent="var(--teal-bright)"
              onChange={(r) => put(["adversary", "capability", i], { ...b, ...r })} />
          ))}
        </div>
      </Table>
      </Chapter>
      </>}

      {all ? (
      <Chapter id="effect" title={tr('ui.calibration.what-a-measure-is-worth', 'What a measure is worth')}
        lead="strength, roll-out and lifecycle, the ceiling, what each class of measure does"
        edited={differs(["effect"])} tables={2} open={isOpen("effect")} onToggle={toggleOpen}>
        {effectTables}
      </Chapter>
      ) : effectTables}

      {all && (
      <Chapter id="time" title="How fast the two sides are"
        lead="the attacker's days per step and pace by capability; the defender's alert and response times"
        edited={differs(["time"])} tables={4} open={isOpen("time")} onToggle={toggleOpen}>
        <Table docKey="time.respond" changed={differs(["time", "respondDays"])} onReset={() => resetPath(["time", "respondDays"])}>
          <div className="cal-curves">
            {Object.keys(cal.time.respondDays).map((k) => (
              <DistInput key={k} label={k} value={cal.time.respondDays[k]} unit="days" lo={0.01} hi={120} log accent="var(--teal-bright)"
                onChange={(r) => put(["time", "respondDays", k], { ...cal.time.respondDays[k], ...r })} />
            ))}
          </div>
        </Table>
        <Table docKey="time.detect" changed={differs(["time", "detectDays"])} onReset={() => resetPath(["time", "detectDays"])}>
          <div className="cal-curves">
            {cal.time.detectDays.map((b: Band2, i: number) => (
              <DistInput key={i} label={["weak", "moderate", "strong", "very strong"][i] ?? `level ${i + 1}`} value={b} unit="days" lo={0.01} hi={120} log accent="var(--teal-bright)"
                onChange={(r) => put(["time", "detectDays", i], { ...b, ...r })} />
            ))}
          </div>
        </Table>
        <Depth id="time.fine" title="The fine tuning - days per step by tactic, pace by capability"
          edited={differs(["time", "stepDays"]) || differs(["time", "stepDaysDefault"]) || differs(["time", "capabilitySpeed"])}
          open={isOpen("time.fine")} onToggle={toggleOpen}>
          <Table docKey="time.step" changed={differs(["time", "stepDays"]) || differs(["time", "stepDaysDefault"])} onReset={() => resetPaths(["time", "stepDays"], ["time", "stepDaysDefault"])}>
            <div className="cal-curves">
              {Object.keys(cal.time.stepDays).map((k) => (
                <DistInput key={k} label={k} value={cal.time.stepDays[k]} unit="days" lo={0.005} hi={120} log accent="var(--teal-bright)"
                  onChange={(r) => put(["time", "stepDays", k], { ...cal.time.stepDays[k], ...r })} />
              ))}
              <DistInput label="Any other tactic" value={cal.time.stepDaysDefault} unit="days" lo={0.005} hi={120} log accent="var(--teal-bright)"
                onChange={(r) => put(["time", "stepDaysDefault"], { ...cal.time.stepDaysDefault, ...r })} />
            </div>
          </Table>
          <Table docKey="time.speed" changed={differs(["time", "capabilitySpeed"])} onReset={() => resetPath(["time", "capabilitySpeed"])}>
            <Band labels={RATING} values={cal.time.capabilitySpeed} dflt={D.time.capabilitySpeed}
              lo={0.1} hi={4} step={0.05} kind="mult" onChange={(i, n) => put(["time", "capabilitySpeed", i], n)} />
          </Table>
        </Depth>
      </Chapter>
      )}

      {all && (
      <Chapter id="magnitude" title={tr('ui.calibration.what-a-loss-costs', 'What a loss costs')}
        lead="direct and follow-on loss by severity - lognormal, points read P5 / median / P95"
        edited={differs(["magnitude"])} tables={1} open={isOpen("magnitude")} onToggle={toggleOpen}>
      <Table docKey="magnitude" changed={differs(["magnitude"])} onReset={() => resetPath(["magnitude"])}>
        {([["loss", "Direct loss per event"], ["cascadeLoss", "Follow-on loss, when it happens"]] as const).map(([k, name]) => (
          <div key={k}>
            <p className="cal-sub">{name}, by feared-event severity:</p>
            <div className="cal-curves">
              {mg[k].map((b: Band2, i: number) => (
                <DistInput key={i} label={SEVERITY[i] ?? `level ${i + 1}`} value={b} unit="money"
                  lo={1e3} hi={5e7} log accent="var(--teal-bright)"
                  onChange={(r) => put(["magnitude", k, i], { ...b, ...r })} />
              ))}
            </div>
          </div>
        ))}
        <p className="cal-sub">{tr('ui.calibration.chance-that-a-loss', 'Chance that a loss event drags a follow-on loss with it:')}</p>
        <Band labels={SEVERITY} values={mg.cascadeLikelihood.map((b: Band2) => b.mode)}
          dflt={D.magnitude.cascadeLikelihood.map((b) => b.mode)} lo={0} hi={1} step={0.01} kind="pct"
          onChange={(i, n) => put(["magnitude", "cascadeLikelihood", i, "mode"], n)} />
      </Table>
      </Chapter>
      )}

      {all && (
        <div className="cal-foot">
          {tr('ui.calibration.the-taxonomy-defines-which', 'The taxonomy defines which fields exist; the calibration defines how their values\n          become numbers.')}
        </div>
      )}
      </div>
    </div>
  );
}
