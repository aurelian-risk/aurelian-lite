// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Kill-chain mitigation (WS5) - a table of ALL operational scenarios (from WS4).
// Each row shows the mitigation status; expanding it reveals the scenario's
// kill-chain steps as an ordered lane (like WS4), with a dropdown on each step to
// assign the security measures that mitigate it (writes the measures' `covers`).
import { Fragment, useState } from "react";
import { t as tr } from "../domain/i18n";
import type { EntityRecord, Study, Taxonomy } from "../domain/types";
import { getType, isSetBack, toggleStates, recordTitle, scaleLabel, scaleMax } from "../domain/taxonomy";
import { useStore } from "../domain/store";
import { effectClassOf, effectChannel, defendsStep } from "../domain/controls";
import { scaleColor, statusColor } from "../domain/viz";
import { measureEfficacyInForce, measureEfficacyOf, stepCoverage } from "../domain/quantModel";
import { DEFAULT_CALIBRATION } from "../domain/calibration";
import { EntityModal } from "./EntityModal";
import { MultiSelect, Icon } from "./ui";
import { CatalogAdd } from "./CatalogAdd";
import { targetByKind } from "../domain/catalog";

export function KillChainMitigation({ tax, study, color }: { tax: Taxonomy; study: Study; color: string }) {
  // Where a measure is missing is exactly where someone goes looking for one, so the
  // catalogue is the last entry of the list itself rather than a button beside it.
  const measureTarget = targetByKind(tax, "measure");
  // Which step it was opened from, so what is chosen lands on that step, already in use.
  const [pickFor, setPickFor] = useState<string | null>(null);
  const updateEntity = useStore((s) => s.updateEntity);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [rec, setRec] = useState<EntityRecord | null>(null);
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Generic detection (mirrors KillChainLane): step type has a ref + number field;
  // measure type has a multiref pointing back at the step type (its `covers`).
  const stepType = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "ref" && f.refType) && t.fields.some((f) => f.type === "number"));
  const parentF = stepType?.fields.find((f) => f.type === "ref" && f.refType);
  const orderF = stepType?.fields.find((f) => f.type === "number");
  const tacticF = stepType?.fields.find((f) => f.type === "enum");
  const techF = stepType?.fields.find((f) => f.type === "text" && f.key !== (stepType?.titleField ?? "name"));
  const measureType = tax.entityTypes.find((t) => t.key !== stepType?.key && t.fields.some((f) => f.type === "multiref" && f.refType === stepType?.key));
  const coversF = measureType?.fields.find((f) => f.type === "multiref" && f.refType === stepType?.key);
  if (!stepType || !parentF?.refType || !orderF || !measureType || !coversF) return null;
  const opType = getType(tax, parentF.refType);
  if (!opType) return null;

  const ops = study.entities.filter((e) => e.type === opType.key);
  const measures = study.entities.filter((e) => e.type === measureType.key);
  // Where this taxonomy records that a measure is in use, if it says so at all.
  const inPlay = toggleStates(measureType);
  const measureOpts = measures.map((m) => ({ id: m.id, label: recordTitle(measureType, m) }));
  // Implementation mini-bar on each measure chip: fill AND colour both track the
  // implementation level itself, so the signal is unambiguous — full=green, then
  // amber → orange → red as coverage drops. (Status stays in the tooltip.)
  const implF = measureType.fields.find((f) => f.key === "implementation_level");
  const statusF = measureType.fields.find((f) => f.key === "status");
  const implBar = (id: string) => {
    if (!implF) return null;
    const m = measures.find((x) => x.id === id); if (!m) return null;
    const v = Number(m.values[implF.key] ?? 0); if (!v) return null;
    const max = scaleMax(implF);
    const s = statusF ? String(m.values[statusF.key] ?? "") : "";
    const c = scaleColor(v, max, true);
    return (
      <span className="scale mini" title={`Implementation: ${scaleLabel(implF, v)}${s ? ` · status: ${s}` : ""}`}>
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => <i key={n} className={n <= v ? "on" : ""} style={{ ["--sev" as string]: c }} />)}
      </span>
    );
  };
  // Status dot (blue = Planned): a distinct channel from the level bar above.
  const chipExtra = (id: string) => {
    const m = measures.find((x) => x.id === id);
    const s = statusF && m ? String(m.values[statusF.key] ?? "") : "";
    const cls = m ? effectClassOf(m) : null;
    return (
      <>
        {cls && <span className="dd-cls" title={`${cls}: ${effectChannel(cls)}`}>{cls.slice(0, 4).toLowerCase()}</span>}
        {s && <span className="status-dot" title={`Status: ${s}`} style={{ background: statusColor(s) }} />}
        {implBar(id)}
      </>
    );
  };
  const stepMeasures = (stepId: string) => measures.filter((m) => Array.isArray(m.values[coversF.key]) && (m.values[coversF.key] as string[]).includes(stepId));
  // What a step is defended TO, not whether somebody has been here. Presence was the old
  // reading and it said green on a study of measures that are all still on paper: a
  // planned control with implementation "none" is worth nothing, which the quantification
  // and the tactic heatmap both already said while this table said "defended".
  // Same arithmetic as `coverageOf`, down to leaving out measures that are set back.
  const cal = study.calibration ?? DEFAULT_CALIBRATION;
  const defending = (stepId: string) => stepMeasures(stepId).filter((m) => defendsStep(m) && !isSetBack(tax, m));
  const defenceOf = (stepId: string) => stepCoverage(defending(stepId).map((m) => measureEfficacyOf(tax, m, cal)));
  /** A measure whose lifecycle withholds part of its value - planned, recommended - is
   *  drawn HATCHED, the same hatch the tactic tile wears for the same reason. One mark,
   *  one meaning, in both places. The card said it in figures first ("63 % → 69 %"), then
   *  in words ("1 still planned"); both were a second statement beside the chip that
   *  already carried the status, and neither read on its own. */
  const stillPlanned = (m: EntityRecord) => measureEfficacyInForce(tax, m, cal) - measureEfficacyOf(tax, m, cal) > 1e-9;
  const chipClass = (id: string) => { const m = measures.find((x) => x.id === id); return m && stillPlanned(m) ? "pending" : ""; };
  /** The four things a step can be, which is one more than the colours used to say. */
  type StepState = "open" | "otherFactor" | "pending" | "defended";
  const stateOf = (stepId: string): StepState => {
    const here = stepMeasures(stepId);
    if (defenceOf(stepId) > 0.001) return "defended";
    if (here.some(defendsStep)) return "pending";     // recorded, none of it in force yet
    return here.length ? "otherFactor" : "open";
  };
  const assign = (stepId: string, ids: string[]) => {
    for (const m of measures) {
      const cur = Array.isArray(m.values[coversF.key]) ? (m.values[coversF.key] as string[]) : [];
      const has = cur.includes(stepId), should = ids.includes(m.id);
      // Putting a measure on a step states that it acts there, so it is in use by that
      // fact. Without this a measure taken from a catalogue stays switched off while
      // sitting on the chain: it fulfils nothing in the coverage matrix or the radar, and
      // the switch cannot correct it either, since it refuses only the other direction.
      if (should && !has) updateEntity(m.id, { ...m.values, [coversF.key]: [...cur, stepId],
        ...(inPlay ? { [inPlay.field.key]: inPlay.on } : {}) });
      else if (!should && has) updateEntity(m.id, { ...m.values, [coversF.key]: cur.filter((x) => x !== stepId) });
    }
  };
  const stepsOf = (opId: string) => study.entities
    .filter((e) => e.type === stepType.key && e.values[parentF.key] === opId)
    .sort((a, b) => Number(a.values[orderF.key] || 0) - Number(b.values[orderF.key] || 0));

  return (
    <>
    {measureTarget && pickFor && (
      <CatalogAdd tax={tax} study={study} target={measureTarget} open onClose={() => setPickFor(null)}
        preset={{ [coversF.key]: [pickFor], ...(inPlay ? { [inPlay.field.key]: inPlay.on } : {}) }} />
    )}
    <div className="panel ws-accent" style={{ ["--ws-color" as string]: color, marginBottom: 20 }}>
      <div className="panel-head">
        <h3>{tr('ui.killchainmitigation.kill-chain-mitigation', 'Kill-chain mitigation')}</h3>
        <span className="badge">{ops.length}</span>
        <span className="spacer" />
        <span className="hint hm-key-pending"><i /> {tr("ui.killchainmitigation.key-planned", "still planned")}</span>
        <span className="hint">{tr("ui.killchainmitigation.expand-a-scenario", "expand a scenario to assign measures to each step")}</span>
      </div>
      <div className="panel-body">
        {ops.length === 0
          ? <div className="empty" style={{ padding: "28px 16px" }}>{tr('ui.killchainmitigation.no-operational-scenarios-yet', 'No operational scenarios yet.')}</div>
          : (
            <table className="tbl">
              <colgroup><col style={{ width: 260 }} /><col /></colgroup>
              <thead><tr><th>{tr('ui.killchainmitigation.operational-scenario', 'Operational scenario')}</th><th>{tr('ui.killchainmitigation.mitigation', 'Mitigation')}</th></tr></thead>
              <tbody>
                {ops.map((op) => {
                  const steps = stepsOf(op.id);
                  const states = steps.map((s) => stateOf(s.id));
                  const covered = states.filter((s) => s === "defended").length;
                  const pending = states.filter((s) => s === "pending").length;
                  const isOpen = open.has(op.id);
                  // A chain whose measures are all still planned is not the same as one
                  // nobody has treated, so it does not get the same colour.
                  const sc = steps.length === 0 ? "var(--fg-subtle)"
                    : covered === steps.length ? "var(--color-state-success)"
                    : covered > 0 ? "var(--color-state-warning)"
                    : pending > 0 ? "var(--color-state-info, var(--primary))"
                    : "var(--color-state-error)";
                  return (
                    <Fragment key={op.id}>
                      <tr className={"row-clickable" + (isOpen ? " expanded" : "")} onClick={() => toggle(op.id)}>
                        <td>
                          <div className="name"><span className={"caret" + (isOpen ? " open" : "")}><Icon.chevron /></span>{recordTitle(opType, op)}</div>
                        </td>
                        <td>
                          <span className="badge" style={{ background: `color-mix(in oklch, ${sc} 20%, transparent)`, color: "var(--fg)" }}>
                            {steps.length === 0 ? tr("ui.killchainmitigation.no-steps", "no steps")
                              : `${covered}/${steps.length} ${tr("ui.killchainmitigation.defended", "defended")}`}
                            {pending > 0 && <span className="kcc-pending-n">{" "}
                              {tr("ui.killchainmitigation.n-planned", "+{0} planned").replace("{0}", String(pending))}</span>}
                          </span>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="detail-row">
                          <td colSpan={2}>
                            {steps.length === 0
                              ? <div className="empty" style={{ padding: "12px 0" }}>{tr('ui.killchainmitigation.no-kill-chain-steps', 'No kill-chain steps in this scenario yet — add them in Operational Scenarios.')}</div>
                              : (
                                <div className="kcc-lane">
                                  {steps.map((s, i) => {
                                    const mit = stepMeasures(s.id);
                                    const state = stateOf(s.id);
                                    const gap = state !== "defended";
                                    const otherFactor = state === "otherFactor";
                                    return (
                                      <Fragment key={s.id}>
                                        <div className={"kcc-card" + (state === "defended" ? "" : state === "pending" ? " pending" : " gap")}>
                                          <div className="kcc-top">
                                            <span className="kcc-idx">{i + 1}</span>
                                            {tacticF && s.values[tacticF.key] ? <span className="kcc-tactic">{String(s.values[tacticF.key])}</span> : null}
                                          </div>
                                          <button className="kcc-name" onClick={() => setRec(s)}>{recordTitle(stepType, s)}</button>
                                          {techF && s.values[techF.key] ? <span className="kcc-tech mono">{String(s.values[techF.key])}</span> : null}
                                          <div className="kcc-mit">
                                            <span className="hint" title={otherFactor
                                              ? tr("ui.killchainmitigation.other-factor-why", "these measures act on the loss or on the number of attacks - none of them prevents or detects an attacker at this step")
                                              : state === "pending"
                                                ? tr("ui.killchainmitigation.pending-why", "a measure counts for how far it is rolled out and where it stands in its lifecycle - these are recorded here but not yet in force")
                                                : undefined}>
                                              {otherFactor ? tr("ui.killchainmitigation.damage-control-only", "damage control only - nothing prevents or detects here")
                                                : state === "pending" ? tr("ui.killchainmitigation.planned-not-in-force", "planned - not in force yet")
                                                : gap ? tr("ui.killchainmitigation.no-mitigation", "no mitigation")
                                                : tr("ui.killchainmitigation.mitigations", "mitigations")}

                                            </span>
                                            <MultiSelect options={measureOpts} selected={mit.map((m) => m.id)} onChange={(ids) => assign(s.id, ids)}
                                              placeholder="+ measure" emptyHint="no security measures yet"
                                              onClickChip={(id) => { const m = measures.find((x) => x.id === id); if (m) setRec(m); }}
                                              renderChipExtra={chipExtra} chipClass={chipClass}
                                              action={measureTarget ? { label: "From a catalogue…", onPick: () => setPickFor(s.id) } : undefined} />
                                          </div>
                                        </div>
                                        {i < steps.length - 1 && <span className="kcc-arrow" aria-hidden>→</span>}
                                      </Fragment>
                                    );
                                  })}
                                </div>
                              )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
      </div>
      {rec && <EntityModal type={getType(tax, rec.type)!} tax={tax} study={study} record={rec} onClose={() => setRec(null)} />}
    </div>
    </>
  );
}
