// Kill-chain mitigation (WS5) - a table of ALL operational scenarios (from WS4).
// Each row shows the mitigation status; expanding it reveals the scenario's
// kill-chain steps as an ordered lane (like WS4), with a dropdown on each step to
// assign the security measures that mitigate it (writes the measures' `covers`).
import { Fragment, useState } from "react";
import type { EntityRecord, Study, Taxonomy } from "../domain/types";
import { getType, recordTitle, scaleLabel, scaleMax } from "../domain/taxonomy";
import { useStore } from "../domain/store";
import { statusColor } from "../domain/viz";
import { EntityModal } from "./EntityModal";
import { MultiSelect, Icon } from "./ui";

export function KillChainMitigation({ tax, study, color }: { tax: Taxonomy; study: Study; color: string }) {
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
  const measureType = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "multiref" && f.refType === stepType?.key));
  const coversF = measureType?.fields.find((f) => f.type === "multiref" && f.refType === stepType?.key);
  if (!stepType || !parentF?.refType || !orderF || !measureType || !coversF) return null;
  const opType = getType(tax, parentF.refType);
  if (!opType) return null;

  const ops = study.entities.filter((e) => e.type === opType.key);
  const measures = study.entities.filter((e) => e.type === measureType.key);
  const measureOpts = measures.map((m) => ({ id: m.id, label: recordTitle(measureType, m) }));
  // Implementation mini-bar on each measure chip: fill AND colour both track the
  // implementation level itself, so the signal is unambiguous — full=green, then
  // amber → orange → red as coverage drops. (Status stays in the tooltip.)
  const implF = measureType.fields.find((f) => f.key === "implementation_level");
  const statusF = measureType.fields.find((f) => f.key === "status");
  const levelColor = (v: number, max: number) => {
    const r = max ? v / max : 0;
    return r >= 1 ? "var(--color-state-success)"                                        // full → green
      : r >= 0.66 ? "var(--color-state-warning)"                                         // substantial → amber
      : r >= 0.34 ? "color-mix(in oklch, var(--color-state-warning) 45%, var(--color-state-error))" // partial → orange
      : "var(--color-state-error)";                                                      // minimal → red
  };
  const implBar = (id: string) => {
    if (!implF) return null;
    const m = measures.find((x) => x.id === id); if (!m) return null;
    const v = Number(m.values[implF.key] ?? 0); if (!v) return null;
    const max = scaleMax(implF);
    const s = statusF ? String(m.values[statusF.key] ?? "") : "";
    const c = levelColor(v, max);
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
    return (
      <>
        {s && <span className="status-dot" title={`Status: ${s}`} style={{ background: statusColor(s) }} />}
        {implBar(id)}
      </>
    );
  };
  const stepMeasures = (stepId: string) => measures.filter((m) => Array.isArray(m.values[coversF.key]) && (m.values[coversF.key] as string[]).includes(stepId));
  const assign = (stepId: string, ids: string[]) => {
    for (const m of measures) {
      const cur = Array.isArray(m.values[coversF.key]) ? (m.values[coversF.key] as string[]) : [];
      const has = cur.includes(stepId), should = ids.includes(m.id);
      if (should && !has) updateEntity(m.id, { ...m.values, [coversF.key]: [...cur, stepId] });
      else if (!should && has) updateEntity(m.id, { ...m.values, [coversF.key]: cur.filter((x) => x !== stepId) });
    }
  };
  const stepsOf = (opId: string) => study.entities
    .filter((e) => e.type === stepType.key && e.values[parentF.key] === opId)
    .sort((a, b) => Number(a.values[orderF.key] || 0) - Number(b.values[orderF.key] || 0));

  return (
    <div className="panel ws-accent" style={{ ["--ws-color" as string]: color, marginBottom: 20 }}>
      <div className="panel-head">
        <h3>Kill-chain mitigation</h3>
        <span className="badge">{ops.length}</span>
        <span className="spacer" />
        <span className="hint">expand a scenario to assign measures to each step</span>
      </div>
      <div className="panel-body">
        {ops.length === 0
          ? <div className="empty" style={{ padding: "28px 16px" }}>No operational scenarios yet.</div>
          : (
            <table className="tbl">
              <colgroup><col style={{ width: 260 }} /><col /><col style={{ width: 40 }} /></colgroup>
              <thead><tr><th>Operational scenario</th><th>Mitigation</th><th /></tr></thead>
              <tbody>
                {ops.map((op) => {
                  const steps = stepsOf(op.id);
                  const covered = steps.filter((s) => stepMeasures(s.id).length).length;
                  const isOpen = open.has(op.id);
                  const sc = steps.length === 0 ? "var(--fg-subtle)" : covered === steps.length ? "var(--color-state-success)" : "var(--color-state-warning)";
                  return (
                    <Fragment key={op.id}>
                      <tr className={"row-clickable" + (isOpen ? " expanded" : "")} onClick={() => toggle(op.id)}>
                        <td>
                          <div className="name"><span className={"caret" + (isOpen ? " open" : "")}><Icon.chevron /></span>{recordTitle(opType, op)}</div>
                        </td>
                        <td>
                          <span className="badge" style={{ background: `color-mix(in oklch, ${sc} 20%, transparent)`, color: "var(--fg)" }}>
                            {steps.length === 0 ? "no steps" : `${covered}/${steps.length} mitigated`}
                          </span>
                        </td>
                        <td />
                      </tr>
                      {isOpen && (
                        <tr className="detail-row">
                          <td colSpan={3}>
                            {steps.length === 0
                              ? <div className="empty" style={{ padding: "12px 0" }}>No kill-chain steps in this scenario yet — add them in Operational Scenarios.</div>
                              : (
                                <div className="kcc-lane">
                                  {steps.map((s, i) => {
                                    const mit = stepMeasures(s.id);
                                    const gap = mit.length === 0;
                                    return (
                                      <Fragment key={s.id}>
                                        <div className={"kcc-card" + (gap ? " gap" : "")}>
                                          <div className="kcc-top">
                                            <span className="kcc-idx">{i + 1}</span>
                                            {tacticF && s.values[tacticF.key] ? <span className="kcc-tactic">{String(s.values[tacticF.key])}</span> : null}
                                          </div>
                                          <button className="kcc-name" onClick={() => setRec(s)}>{recordTitle(stepType, s)}</button>
                                          {techF && s.values[techF.key] ? <span className="kcc-tech mono">{String(s.values[techF.key])}</span> : null}
                                          <div className="kcc-mit">
                                            <span className="hint">{gap ? "no mitigation" : "mitigations"}</span>
                                            <MultiSelect options={measureOpts} selected={mit.map((m) => m.id)} onChange={(ids) => assign(s.id, ids)}
                                              placeholder="+ measure" emptyHint="no security measures yet"
                                              onClickChip={(id) => { const m = measures.find((x) => x.id === id); if (m) setRec(m); }}
                                              renderChipExtra={chipExtra} />
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
  );
}
