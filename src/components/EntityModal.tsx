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

export function EntityModal({ type, tax, study, record, onClose, initialValues }: {
  type: EntityTypeDef; tax: Taxonomy; study: Study; record: EntityRecord | null; onClose: () => void;
  initialValues?: Record<string, FieldValue>;
}) {
  const { addEntity, updateEntity, deleteEntity } = useStore();
  const [draft, setDraft] = useState<Record<string, FieldValue>>(() => record ? { ...record.values } : { ...emptyValues(type), ...(initialValues ?? {}) });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const refOptions = (typeKey: string): RefOption[] =>
    study.entities.filter((e) => e.type === typeKey && e.id !== record?.id)
      .map((e) => ({ id: e.id, label: recordTitle(getType(tax, e.type)!, e) }));

  const save = () => {
    const err = validateRecord(type, draft);
    if (err) { setError(err); return; }
    if (record) updateEntity(record.id, draft);
    else addEntity(type.key, draft);
    onClose();
  };
  const remove = () => { if (record) { deleteEntity(record.id); onClose(); } };

  const incoming: { rel: string; from: string }[] = [];
  if (record) {
    for (const e of study.entities) {
      const et = getType(tax, e.type);
      if (!et || e.id === record.id) continue;
      for (const f of refFields(et)) {
        const v = e.values[f.key];
        const ids = f.type === "multiref" ? (Array.isArray(v) ? (v as string[]) : []) : v ? [v as string] : [];
        if (ids.includes(record.id)) incoming.push({ rel: f.relation ?? f.label, from: recordTitle(et, e) });
      }
    }
  }

  const patch = (key: string, v: FieldValue) => setDraft((d) => ({ ...d, [key]: v }));

  return createPortal(
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal-lg" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-lg-head">
          <div style={{ flex: 1 }}>
            <div className="dialog-sub" style={{ margin: 0 }}>{type.label}</div>
            <h2 style={{ fontSize: 19 }}>{record ? recordTitle(type, record) : `New ${type.label}`}</h2>
          </div>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close"><Icon.close /></button>
        </header>

        <div className="modal-lg-body">
          <div className="form-grid">
            {type.fields.map((f) => (
              <div className={"field" + (f.type === "textarea" || f.type === "multiref" ? " span2" : "")} key={f.key}>
                <label>{f.label}{f.required && <span style={{ color: "var(--color-state-error)" }}> *</span>}</label>
                <FieldInput field={f} value={draft[f.key] ?? null} onChange={(v) => patch(f.key, v)} refOptions={refOptions} />
                {f.help && <span className="hint">{f.help}</span>}
              </div>
            ))}
          </div>

          {incoming.length > 0 && (
            <div className="detail-rels" style={{ marginTop: 8 }}>
              <span className="d-sub">Referenced by</span>
              <div className="multi">
                {incoming.map((r, i) => <span className="chip" key={i}><span className="gi-rel-lbl">{r.rel}</span> {r.from}</span>)}
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
  );
}
