// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Shared right-frame info panel for the graph and the flow canvas: type, all
// field values, and clickable incoming/outgoing relationships (navigate).
import type { EntityRecord, FieldDef, FieldValue, Study, Taxonomy } from "../domain/types";
import { t as tr } from "../domain/i18n";
import { fieldLabel, fieldRelation, getType, recordTitle, refFields, scaleLabel, typeLabel } from "../domain/taxonomy";
import { Icon } from "./ui";

function valueText(tax: Taxonomy, study: Study, f: FieldDef, v: FieldValue): string {
  const nameOf = (id: string) => {
    const r = study.entities.find((e) => e.id === id);
    const t = r && getType(tax, r.type);
    return r && t ? recordTitle(t, r) : "?";
  };
  if (v == null || v === "") return "—";
  switch (f.type) {
    case "scale": return typeof v === "number" ? scaleLabel(f, v) : String(v);
    case "boolean": return v ? "yes" : "no";
    case "ref": return typeof v === "string" ? nameOf(v) : "—";
    case "multiref": return Array.isArray(v) && v.length ? (v as string[]).map(nameOf).join(", ") : "—";
    default: return String(v);
  }
}

export function EntityInfoPanel({ tax, study, id, onSelect, onEdit, onClose }: {
  tax: Taxonomy; study: Study; id: string;
  onSelect: (id: string) => void; onEdit: (id: string) => void; onClose: () => void;
}) {
  const rec = study.entities.find((e) => e.id === id) as EntityRecord | undefined;
  const type = rec && getType(tax, rec.type);
  if (!rec || !type) return null;
  const group = tax.groups.find((g) => g.key === type.group);
  const color = group?.color ?? "var(--primary)";

  const outgoing: { rel: string; id: string }[] = [];
  for (const f of refFields(type)) {
    const v = rec.values[f.key];
    const ids = f.type === "multiref" ? (Array.isArray(v) ? (v as string[]) : []) : v ? [v as string] : [];
    ids.forEach((tid) => outgoing.push({ rel: fieldRelation(f), id: tid }));
  }
  const incoming: { rel: string; id: string }[] = [];
  for (const e of study.entities) {
    const et = getType(tax, e.type);
    if (!et || e.id === id) continue;
    for (const f of refFields(et)) {
      const v = e.values[f.key];
      const ids = f.type === "multiref" ? (Array.isArray(v) ? (v as string[]) : []) : v ? [v as string] : [];
      if (ids.includes(id)) incoming.push({ rel: fieldRelation(f), id: e.id });
    }
  }
  const titleOf = (rid: string) => {
    const r = study.entities.find((e) => e.id === rid);
    const t = r && getType(tax, r.type);
    return r && t ? recordTitle(t, r) : "—";
  };

  return (
    <div className="info-panel">
      <div className="ip-head">
        <span className="badge" style={{ background: `color-mix(in oklch, ${color} 22%, transparent)`, color: "var(--fg)" }}>
          <span className="dot" style={{ background: color }} />{typeLabel(type)}
        </span>
        <span style={{ flex: 1 }} />
        <button className="btn ghost sm" onClick={() => onEdit(id)} title={tr('ui.entityinfo.edit', 'Edit')}><Icon.edit /></button>
        <button className="btn ghost sm" onClick={onClose} aria-label={tr('ui.entityinfo.close', 'Close')}><Icon.close /></button>
      </div>
      <h3 className="ip-title">{recordTitle(type, rec)}</h3>

      <div className="ip-fields">
        {type.fields.filter((f) => f.type !== "ref" && f.type !== "multiref").map((f) => {
          const txt = valueText(tax, study, f, rec.values[f.key] ?? null);
          if (f.type === "textarea") return txt === "—" ? null : <p key={f.key} className="ip-desc">{txt}</p>;
          return <div key={f.key} className="ip-row"><span className="ip-k">{fieldLabel(f)}</span><span className="ip-v">{txt}</span></div>;
        })}
      </div>

      {(outgoing.length > 0 || incoming.length > 0) && (
        <div className="ip-rels">
          <div className="d-sub">{tr('ui.entityinfo.relationships', 'Relationships')}</div>
          {outgoing.map((r, i) => (
            <button key={"o" + i} className="gi-rel" onClick={() => onSelect(r.id)}>
              <span className="gi-arrow">→</span> <span className="gi-rel-lbl">{r.rel}</span> {titleOf(r.id)}
            </button>
          ))}
          {incoming.map((r, i) => (
            <button key={"i" + i} className="gi-rel" onClick={() => onSelect(r.id)}>
              <span className="gi-arrow in">←</span> <span className="gi-rel-lbl">{r.rel}</span> {titleOf(r.id)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
