import { Fragment, useState, type ReactNode } from "react";
import type { EntityRecord, EntityTypeDef, FieldDef, FieldValue, Study, Taxonomy } from "../domain/types";
import { columnFields, getType, recordTitle, refFields, scaleLabel, scaleMax, titleField } from "../domain/taxonomy";
import { useStore } from "../domain/store";
import { EntityModal } from "./EntityModal";
import { Icon, ScaleBadge, ScaleBars } from "./ui";

const clip = (s: string, n = 90) => (s.length > n ? s.slice(0, n) + "…" : s);

const NAME_COL = 210;
const VALUE_COL = 150;

function FieldValueView({ field, value, tax, study, onOpen }:
  { field: FieldDef; value: FieldValue; tax: Taxonomy; study: Study; onOpen?: (id: string) => void }) {
  const nameOf = (id: string) => {
    const r = study.entities.find((e) => e.id === id);
    const t = r && getType(tax, r.type);
    return r && t ? recordTitle(t, r) : "—";
  };
  const chip = (id: string) => onOpen
    ? <button className="chip link" key={id} title="Open" onClick={(e) => { e.stopPropagation(); onOpen(id); }}>{nameOf(id)}</button>
    : <span className="chip" key={id}>{nameOf(id)}</span>;
  switch (field.type) {
    case "enum":
      return value ? <span className="badge">{String(value)}</span> : <span className="hint">—</span>;
    case "scale": {
      const v = typeof value === "number" ? value : 1;
      return <ScaleBadge value={v} max={scaleMax(field)} label={scaleLabel(field, v)} positive={field.polarity === "positive"} />;
    }
    case "boolean":
      return <span className="badge">{value ? "yes" : "no"}</span>;
    case "ref":
      return typeof value === "string" && value ? chip(value) : <span className="hint">—</span>;
    case "multiref": {
      const ids = Array.isArray(value) ? (value as string[]) : [];
      return ids.length
        ? <div className="multi">{ids.map(chip)}</div>
        : <span className="hint">—</span>;
    }
    default:
      return <span>{clip(String(value ?? ""), 60) || <span className="hint">—</span>}</span>;
  }
}

export function EntitySection({ type, study, tax, color, draggableRows, renderDetailExtra, headerExtra, hideAdd }:
  { type: EntityTypeDef; study: Study; tax: Taxonomy; color: string;
    draggableRows?: boolean; renderDetailExtra?: (r: EntityRecord) => ReactNode; headerExtra?: ReactNode; hideAdd?: boolean }) {
  const deleteEntity = useStore((s) => s.deleteEntity);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [modal, setModal] = useState<{ typeKey: string; record: EntityRecord | null } | null>(null);

  const items = study.entities.filter((e) => e.type === type.key);
  const cols = columnFields(type);
  const title = titleField(type);

  const refTargets = (typeKey: string) => study.entities.filter((e) => e.type === typeKey);
  const missingReq = type.fields.find((f) => f.type === "ref" && f.required && refTargets(f.refType ?? "").length === 0);
  const targetLabel = missingReq ? getType(tax, missingReq.refType ?? "")?.label ?? "entity" : "";
  const addBlocked = missingReq ? `Create a ${targetLabel} first — required by "${missingReq.label}".` : null;

  // Open a linked entity from ANOTHER workshop (or type) in the modal popup.
  const openEntity = (id: string) => { const r = study.entities.find((e) => e.id === id); if (r) setModal({ typeKey: r.type, record: r }); };

  return (
    <div className="panel ws-accent" style={{ ["--ws-color" as string]: color, marginBottom: 20 }}>
      <div className="panel-head">
        <h3>{type.labelPlural}</h3>
        <span className="badge">{items.length}</span>
        <span className="spacer" />
        {headerExtra}
        {!hideAdd && (
          <button className="btn sm primary" disabled={!!addBlocked} title={addBlocked ?? undefined}
            onClick={() => setModal({ typeKey: type.key, record: null })}>
            <Icon.plus /> {type.label}
          </button>
        )}
      </div>

      {addBlocked && <div style={{ padding: "12px 16px 0" }}><div className="guide warn">{addBlocked}</div></div>}

      <div className="panel-body">
        {items.length === 0 ? (
          <div className="empty" style={{ padding: "28px 16px" }}>No {type.labelPlural.toLowerCase()} yet.</div>
        ) : (
          <table className="tbl" style={{ minWidth: NAME_COL + cols.length * VALUE_COL + 56 }}>
            <colgroup>
              <col style={{ width: NAME_COL }} />
              {cols.map((c) => <col key={c.key} style={{ width: VALUE_COL }} />)}
              <col />
            </colgroup>
            <thead>
              <tr>
                <th>{type.fields.find((f) => f.key === title)?.label ?? "Name"}</th>
                {cols.map((c) => <th key={c.key}>{c.label}</th>)}
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const isOpen = expanded === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr className={"row-clickable" + (isOpen ? " expanded" : "") + (draggableRows ? " row-drag" : "")}
                      draggable={draggableRows || undefined}
                      onDragStart={draggableRows ? (e) => { e.dataTransfer.setData("text/plain", r.id); e.dataTransfer.effectAllowed = "move"; } : undefined}
                      onClick={() => setExpanded(isOpen ? null : r.id)}>
                      <td>
                        <div className="name">
                          <span className={"caret" + (isOpen ? " open" : "")}><Icon.chevron /></span>
                          {recordTitle(type, r)}
                        </div>
                        {typeof r.values.description === "string" && r.values.description && (
                          <div className="desc">{clip(r.values.description)}</div>
                        )}
                      </td>
                      {cols.map((c) => <td key={c.key}><FieldValueView field={c} value={r.values[c.key] ?? null} tax={tax} study={study} onOpen={openEntity} /></td>)}
                      <td />
                    </tr>
                    {isOpen && (
                      <tr className="detail-row">
                        <td colSpan={cols.length + 2}>
                          <EntityDetail type={type} record={r} tax={tax} study={study} color={color}
                            onEdit={() => setModal({ typeKey: type.key, record: r })}
                            onDelete={() => deleteEntity(r.id)} onOpenEntity={openEntity}
                            extra={renderDetailExtra ? renderDetailExtra(r) : null} />
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

      {modal && <EntityModal type={getType(tax, modal.typeKey)!} tax={tax} study={study} record={modal.record} onClose={() => setModal(null)} />}
    </div>
  );
}

// Inline expandable detail. Linked entities (refs + referenced-by) are
// clickable → open in the popup (used to reach items from other workshops).
function EntityDetail({ type, record, tax, study, color, onEdit, onDelete, onOpenEntity, extra }: {
  type: EntityTypeDef; record: EntityRecord; tax: Taxonomy; study: Study; color: string;
  onEdit: () => void; onDelete: () => void; onOpenEntity: (id: string) => void; extra?: ReactNode;
}) {
  const title = titleField(type);
  const scalarFields = type.fields.filter((f) => f.key !== title && f.type !== "textarea" && f.type !== "ref" && f.type !== "multiref");
  const scaleFields = scalarFields.filter((f) => f.type === "scale");
  const otherScalars = scalarFields.filter((f) => f.type !== "scale");
  const relFields = refFields(type);
  const descFields = type.fields.filter((f) => f.type === "textarea");

  const linkChip = (id: string) => {
    const r = study.entities.find((e) => e.id === id);
    const t = r && getType(tax, r.type);
    return (
      <button className="chip link" key={id} onClick={() => onOpenEntity(id)} title="Open">
        {r && t ? recordTitle(t, r) : "—"}
      </button>
    );
  };

  const incoming: { rel: string; from: string }[] = [];
  for (const e of study.entities) {
    const et = getType(tax, e.type);
    if (!et || e.id === record.id) continue;
    for (const f of refFields(et)) {
      const v = e.values[f.key];
      const ids = f.type === "multiref" ? (Array.isArray(v) ? (v as string[]) : []) : v ? [v as string] : [];
      if (ids.includes(record.id)) incoming.push({ rel: f.relation ?? f.label, from: e.id });
    }
  }

  return (
    <div className="detail">
      <div className="detail-actions">
        <span className="d-sub" style={{ margin: 0, flex: 1 }}>Details</span>
        <button className="btn sm" style={{ background: `color-mix(in oklch, ${color} 20%, transparent)`, borderColor: `color-mix(in oklch, ${color} 45%, transparent)`, color: "var(--fg)" }} onClick={onEdit}><Icon.edit /> Edit</button>
        <button className="btn sm danger" onClick={onDelete}><Icon.trash /> Delete</button>
      </div>
      {descFields.map((f) => {
        const v = record.values[f.key];
        return typeof v === "string" && v.trim() ? <p className="d-desc" key={f.key}>{v}</p> : null;
      })}
      {extra && <div className="detail-extra">{extra}</div>}
      {scaleFields.length > 0 && (
        <div className="d-scales">
          {scaleFields.map((f) => {
            const v = typeof record.values[f.key] === "number" ? (record.values[f.key] as number) : 1;
            return (
              <div className="d-scale-row" key={f.key}>
                <span className="d-k">{f.label}</span>
                <ScaleBars value={v} max={scaleMax(f)} label={scaleLabel(f, v)} positive={f.polarity === "positive"} />
              </div>
            );
          })}
        </div>
      )}
      <div className="detail-grid">
        {otherScalars.map((f) => (
          <div className="d-item" key={f.key}>
            <span className="d-k">{f.label}</span>
            <div className="d-v"><FieldValueView field={f} value={record.values[f.key] ?? null} tax={tax} study={study} /></div>
          </div>
        ))}
        {relFields.map((f) => {
          const v = record.values[f.key];
          const ids = f.type === "multiref" ? (Array.isArray(v) ? (v as string[]) : []) : v ? [v as string] : [];
          return (
            <div className="d-item" key={f.key}>
              <span className="d-k">{f.label}</span>
              <div className="d-v multi">{ids.length ? ids.map(linkChip) : <span className="hint">—</span>}</div>
            </div>
          );
        })}
      </div>
      {incoming.length > 0 && (
        <div className="detail-rels">
          <span className="d-sub">Referenced by</span>
          <div className="multi">
            {incoming.map((r, i) => (
              <span className="link-rel" key={i}>{linkChip(r.from)} <span className="gi-rel-lbl">{r.rel} →</span></span>
            ))}
          </div>
        </div>
      )}
      <div className="detail-meta mono">updated {new Date(record.updatedAt).toLocaleString()}</div>
    </div>
  );
}
