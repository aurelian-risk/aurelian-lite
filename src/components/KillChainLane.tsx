// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Kill-chain lane for ONE operational scenario — rendered inline inside the
// op-scenario's expanded row. Shows the parent WS3 scenario context and a lane
// of MITRE ATT&CK tactic tiles. Steps (dragged from the kill-chain-steps table
// or from tile to tile) drop onto tiles → assigns this scenario + tactic +
// order. Each tile's "+" creates a step pre-filled for that tactic.
import { useState } from "react";
import { t as tr } from "../domain/i18n";
import type { EntityRecord, FieldValue, Study, Taxonomy } from "../domain/types";
import { fieldRelation, getType, recordTitle, refFields } from "../domain/taxonomy";
import { useStore } from "../domain/store";
import { EntityModal } from "./EntityModal";
import { Icon } from "./ui";

function StepCard({ step, label, tech, onOpen }: { step: EntityRecord; label: string; tech: string; onOpen: () => void }) {
  return (
    <div className="kc-step" draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", step.id); e.dataTransfer.effectAllowed = "move"; }}
      onClick={onOpen} title={tr('ui.killchainlane.drag-to-a-tactic', 'Drag to a tactic tile · click to edit')}>
      <div className="kc-step-name">{label}</div>
      {tech && <div className="kc-step-tech mono">{tech}</div>}
    </div>
  );
}

export function KillChainLane({ tax, study, op, color }: { tax: Taxonomy; study: Study; op: EntityRecord; color: string }) {
  const updateEntity = useStore((s) => s.updateEntity);
  const [modal, setModal] = useState<{ record: EntityRecord | null; initial?: Record<string, FieldValue> } | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const stepType = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "ref" && f.refType) && t.fields.some((f) => f.type === "number"));
  if (!stepType) return null;
  const parentF = stepType.fields.find((f) => f.type === "ref" && f.refType);
  const orderF = stepType.fields.find((f) => f.type === "number");
  const tacticF = stepType.fields.find((f) => f.type === "enum");
  const techF = stepType.fields.find((f) => f.type === "text" && f.key !== (stepType.titleField ?? "name"));
  if (!parentF?.refType || !orderF || !tacticF || parentF.refType !== op.type) return null;
  const opType = getType(tax, op.type)!;
  const upF = opType.fields.find((f) => f.type === "ref" && f.refType && f.refType !== op.type);
  const tactics = tacticF.options ?? [];

  const ent = (id: unknown) => (typeof id === "string" ? study.entities.find((e) => e.id === id) : undefined);
  const nameOf = (id: unknown) => { const r = ent(id); const t = r && getType(tax, r.type); return r && t ? recordTitle(t, r) : null; };

  const ss = upF ? ent(op.values[upF.key]) : undefined;
  const ssType = ss && getType(tax, ss.type);
  const context = ss && ssType
    ? refFields(ssType).map((f) => { const v = ss.values[f.key]; const id = Array.isArray(v) ? v[0] : v; return { rel: fieldRelation(f), name: nameOf(id) }; }).filter((c) => c.name)
    : [];
  const steps = study.entities.filter((e) => e.type === stepType.key && e.values[parentF.key] === op.id);
  const inTactic = (t: string) => steps.filter((s) => s.values[tacticF.key] === t).sort((a, b) => Number(a.values[orderF.key] || 0) - Number(b.values[orderF.key] || 0));
  const unassigned = steps.filter((s) => !tactics.includes(String(s.values[tacticF.key] ?? "")));
  const label = (s: EntityRecord) => recordTitle(stepType, s);
  const tech = (s: EntityRecord) => techF ? String(s.values[techF.key] ?? "") : "";

  // Drop assigns the dragged step to THIS scenario + tactic (+ order).
  const place = (stepId: string, tactic: string, order: number) => {
    const s = study.entities.find((e) => e.id === stepId);
    if (!s || s.type !== stepType.key) return;
    updateEntity(stepId, { ...s.values, [parentF.key]: op.id, [tacticF.key]: tactic, [orderF.key]: order });
  };
  const onDrop = (tactic: string, order: number) => (e: React.DragEvent) => {
    e.preventDefault(); setOver(null);
    const id = e.dataTransfer.getData("text/plain");
    if (id) place(id, tactic, order);
  };

  return (
    <div className="kc-lane" style={{ ["--ws-color" as string]: color }}>
      {(ss || context.length > 0) && (
        <div className="kc-op-head">
          {ss && ssType && <><span className="hint">implements</span><span className="chip">{recordTitle(ssType, ss)}</span></>}
          {context.map((c, i) => <span key={i} className="chip"><span className="gi-rel-lbl">{c.rel}</span> {c.name}</span>)}
        </div>
      )}

      <div className={"kc-pool" + (over === "_" ? " over" : "")}
        onDragOver={(e) => { e.preventDefault(); setOver("_"); }} onDragLeave={() => setOver(null)} onDrop={onDrop("", 0)}>
        <span className="kc-pool-label">{tr('ui.killchainlane.unassigned', 'Unassigned')}</span>
        {unassigned.map((s) => <StepCard key={s.id} step={s} label={label(s)} tech={tech(s)} onOpen={() => setModal({ record: s })} />)}
        <button className="btn ghost sm" onClick={() => setModal({ record: null, initial: { [parentF.key]: op.id } })}><Icon.plus /> {tr('ui.killchainlane.step', 'Step')}</button>
        <span className="hint" style={{ marginLeft: "auto" }}>{tr("ui.killchainlane.drag-steps", "drag steps from the table or between tiles →")}</span>
      </div>

      <div className="kc-tiles">
        {tactics.map((t, ti) => (
          <div key={t} className={"kc-tile" + (over === t ? " over" : "")}
            onDragOver={(e) => { e.preventDefault(); setOver(t); }} onDragLeave={() => setOver(null)} onDrop={onDrop(t, ti + 1)}>
            <div className="kc-tile-head">
              <span className="kc-tile-idx">{ti + 1}</span><span style={{ flex: 1 }}>{t}</span>
              <button className="kc-tile-add" title={`New step · ${t}`} onClick={() => setModal({ record: null, initial: { [parentF.key]: op.id, [tacticF.key]: t, [orderF.key]: ti + 1 } })}><Icon.plus /></button>
            </div>
            <div className="kc-tile-body">
              {inTactic(t).map((s) => <StepCard key={s.id} step={s} label={label(s)} tech={tech(s)} onOpen={() => setModal({ record: s })} />)}
            </div>
          </div>
        ))}
      </div>

      {modal && <EntityModal type={stepType} tax={tax} study={study} record={modal.record} initialValues={modal.initial} onClose={() => setModal(null)} />}
    </div>
  );
}
