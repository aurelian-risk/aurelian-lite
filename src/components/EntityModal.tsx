// Large popup for viewing + editing a single entity — the same fields as the
// workshop table's editor, plus its incoming relationships. Fixed header and
// footer, scrollable body, so nothing is ever cut off.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { EntityRecord, EntityTypeDef, FieldValue, Study, Taxonomy } from "../domain/types";
import { emptyValues, getType, recordTitle, refFields, validateRecord } from "../domain/taxonomy";
import { useStore } from "../domain/store";
import { FieldInput, type RefOption } from "./FieldInput";
import { Icon } from "./ui";

export function EntityModal({ type, tax, study, record, onClose, onBack, backLabel, initialValues }: {
  type: EntityTypeDef; tax: Taxonomy; study: Study; record: EntityRecord | null; onClose: () => void;
  onBack?: () => void; backLabel?: string; initialValues?: Record<string, FieldValue>;
}) {
  const { addEntity, updateEntity, deleteEntity } = useStore();
  const [draft, setDraft] = useState<Record<string, FieldValue>>(() => record ? { ...record.values } : { ...emptyValues(type), ...(initialValues ?? {}) });
  const [error, setError] = useState<string | null>(null);
  const [refRec, setRefRec] = useState<EntityRecord | null>(null);

  // Escape steps back one level (to the previous entity or the factor trace);
  // when a nested entity is open here, let that innermost modal handle it.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !refRec) { (onBack ?? onClose)(); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, onBack, refRec]);

  const refOptions = (typeKey: string): RefOption[] =>
    study.entities.filter((e) => e.type === typeKey && e.id !== record?.id)
      .map((e) => ({ id: e.id, label: recordTitle(getType(tax, e.type)!, e) }));

  // Soft, non-restricting suggestions for a ref field: entities of the field's
  // target type reachable through this record's OTHER relationships (e.g. a
  // kill-chain step's target asset → via its operational scenario → strategic
  // scenario → stakeholder access). Surfaced first; everything stays selectable.
  const refIds = (vals: Record<string, FieldValue>, f: { type: string; key: string }): string[] => {
    const v = vals[f.key];
    return f.type === "multiref" ? (Array.isArray(v) ? (v as string[]) : []) : (typeof v === "string" && v ? [v] : []);
  };
  const suggestedFor = (field: { type: string; key: string; refType?: string }): Set<string> => {
    const out = new Set<string>();
    if (field.type !== "ref" || !field.refType) return out;
    const seen = new Set<string>();
    const queue: { id: string; d: number }[] = [];
    for (const f of type.fields) if ((f.type === "ref" || f.type === "multiref") && f.key !== field.key)
      for (const id of refIds(draft, f)) queue.push({ id, d: 1 });
    while (queue.length) {
      const { id, d } = queue.shift()!;
      if (seen.has(id) || d > 5) continue; seen.add(id);
      const e = study.entities.find((x) => x.id === id); if (!e) continue;
      if (e.type === field.refType) out.add(e.id);
      const et = getType(tax, e.type); if (!et) continue;
      for (const f of et.fields) if (f.type === "ref" || f.type === "multiref")
        for (const nid of refIds(e.values, f)) queue.push({ id: nid, d: d + 1 });
    }
    return out;
  };

  const save = () => {
    const err = validateRecord(type, draft);
    if (err) { setError(err); return; }
    if (record) updateEntity(record.id, draft);
    else addEntity(type.key, draft);
    onClose();
  };
  const remove = () => { if (record) { deleteEntity(record.id); onClose(); } };

  const incoming: { rel: string; from: EntityRecord }[] = [];
  if (record) {
    for (const e of study.entities) {
      const et = getType(tax, e.type);
      if (!et || e.id === record.id) continue;
      for (const f of refFields(et)) {
        const v = e.values[f.key];
        const ids = f.type === "multiref" ? (Array.isArray(v) ? (v as string[]) : []) : v ? [v as string] : [];
        if (ids.includes(record.id)) incoming.push({ rel: f.relation ?? f.label, from: e });
      }
    }
  }

  const patch = (key: string, v: FieldValue) => setDraft((d) => ({ ...d, [key]: v }));

  return (<>
    {createPortal(
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal-lg" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-lg-head">
          {onBack && <button className="btn ghost sm em-back" onClick={onBack} title="Back">‹ {backLabel ?? "Back"}</button>}
          <div style={{ flex: 1 }}>
            <div className="dialog-sub" style={{ margin: 0 }}>{type.label}</div>
            <h2 style={{ fontSize: 19 }}>{record ? recordTitle(type, record) : `New ${type.label}`}</h2>
            {record?.source && <div className="ent-source" title="Extracted from this source"><Icon.doc /> {record.source}</div>}
          </div>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close"><Icon.close /></button>
        </header>

        <div className="modal-lg-body">
          <div className="form-grid">
            {type.fields.map((f) => (
              <div className={"field" + (f.type === "textarea" || f.type === "multiref" ? " span2" : "")} key={f.key}>
                <label>{f.label}{f.required && <span style={{ color: "var(--color-state-error)" }}> *</span>}</label>
                <FieldInput field={f} value={draft[f.key] ?? null} onChange={(v) => patch(f.key, v)} refOptions={refOptions} siblings={draft} suggested={f.type === "ref" ? suggestedFor(f) : undefined} />
                {f.help && <span className="hint">{f.help}</span>}
              </div>
            ))}
          </div>

          {incoming.length > 0 && (
            <div className="detail-rels" style={{ marginTop: 8 }}>
              <span className="d-sub">Referenced by</span>
              <div className="multi">
                {incoming.map((r, i) => (
                  <span className="chip clickable" key={i} role="button" tabIndex={0} title="Open"
                    onClick={() => setRefRec(r.from)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setRefRec(r.from); } }}>
                    <span className="chip-lbl">{recordTitle(getType(tax, r.from.type)!, r.from)}</span>
                    <span className="gi-rel-lbl">{r.rel} →</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {error && <div className="guide warn" style={{ marginTop: 14 }}>{error}</div>}
        </div>

        <footer className="modal-lg-foot">
          {record && <button className="btn ghost danger" onClick={remove}><Icon.trash /> Delete</button>}
          <span style={{ flex: 1 }} />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>{record ? "Save" : "Create"}</button>
        </footer>
      </div>
    </div>,
    document.body,
    )}
    {refRec && <EntityModal type={getType(tax, refRec.type)!} tax={tax} study={study} record={refRec}
      onClose={onClose} onBack={() => setRefRec(null)} backLabel={record ? recordTitle(type, record) : "Back"} />}
  </>);
}
