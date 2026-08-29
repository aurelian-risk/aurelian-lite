// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { EntityRecord, EntityTypeDef, FieldDef, FieldType, FieldValue, Study, Taxonomy } from "../domain/types";
import { columnFields, getType, isSetBack, optionLabel, recordTitle, refFields, scaleLabel, scaleMax, setBackBlocked, titleField, toggleStates } from "../domain/taxonomy";
import { foldScope, getFolds, getHiddenColumns, setFolds, setHiddenColumns } from "../domain/viewstate";
import { scopeChange, deleteChange } from "../domain/scope";
import { deletedRefs } from "../domain/audit";
import { TOOLBAR_MIN_ROWS } from "../domain/tablefilter";
import { TableTools, useTableFilter } from "./TableTools";
import { useStore } from "../domain/store";
import { ChangeHistoryModal, IntegrityBadge } from "./ChangeHistoryModal";
import { entryOf } from "../domain/audit";
import { EntityModal } from "./EntityModal";
import { Icon, Overlay, ScaleBadge, ScaleBars, useDismissOnEscape } from "./ui";

const clip = (s: string, n = 90) => (s.length > n ? s.slice(0, n) + "…" : s);

/** Records shown per incoming relation before the rest fold behind a "+n more". */
const BACKREF_PREVIEW = 12;

// ── How wide a table gets ────────────────────────────────────────────────────
//
// The name column takes whatever is left over, so it grows with the window; every other
// column is sized by WHAT IT HOLDS. One flat width for all of them was measured
// (harness/table-width.mjs) to fail in both directions at once: a badge column paid rent
// on 150px it does not use while a column of chips wrapped its rows to ten lines. The
// numbers below are that measurement rounded - what each field type wants to show one
// value on one line, chips truncated.
const COL_WIDTH: Record<FieldType, number> = {
  number: 80,
  boolean: 96,
  enum: 124,
  scale: 148,      // bars plus the longest scale label
  text: 156,
  textarea: 156,   // never a column today (columnFields drops it), sized for completeness
  ref: 156,        // one chip
  multiref: 164,   // two chips and a "+n", each chip clipped to a readable stub
};
/** Floor for the name column, and the only thing the table's min-width adds to the sum of
 *  its value columns. There is no allowance for the trailing spacer: it is empty, and in a
 *  fixed layout it collapses to zero as soon as the table overflows - so reserving width
 *  for it only pushed tables past the edge of the window that would otherwise have fit. */
const NAME_MIN = 320;
const tableMinWidth = (cols: FieldDef[]) =>
  NAME_MIN + cols.reduce((w, c) => w + COL_WIDTH[c.type], 0);
/** A table whose columns alone ask for more than this offers the choice of which to show,
 *  however few rows it has - at 1280px, the commonest window, a panel is 958px wide, and
 *  no arrangement of eight columns fits in it. Rows are a different problem, solved by the
 *  search and the facets; this one is about width. */
const WIDE_TABLE = 960;

function FieldValueView({ field, value, tax, study, recordId, onOpen, onToggle, toggleBlocked }:
  { field: FieldDef; value: FieldValue; tax: Taxonomy; study: Study; recordId?: string;
    onOpen?: (id: string) => void;
    onToggle?: (field: FieldDef, next: string) => void;
    /** Why the switch may not be flipped right now, if it may not - see setBackBlocked. */
    toggleBlocked?: string | null }) {
  // What this field used to point at and no longer can, read out of the change log. A
  // deletion clears the reference, so an empty field is all that is left in the data - and
  // an empty field says nothing about whether it was ever filled. The mark says so.
  const lost = recordId ? (deletedRefs(study.log, recordId).get(field.key) ?? []) : [];
  const gonePill = (x: { id: string; title: string }) => (
    <span className="chip gone" key={"gone-" + x.id} title={`${x.title} — deleted`}>{x.title}</span>
  );
  const nameOf = (id: string) => {
    const r = study.entities.find((e) => e.id === id);
    const t = r && getType(tax, r.type);
    return r && t ? recordTitle(t, r) : "—";
  };
  // The chip is clipped to the column's width, so the full title has to be reachable
  // without opening the record: it is the tooltip.
  const chip = (id: string) => onOpen
    ? <button className="chip link" key={id} title={nameOf(id)} onClick={(e) => { e.stopPropagation(); onOpen(id); }}>{nameOf(id)}</button>
    : <span className="chip" key={id} title={nameOf(id)}>{nameOf(id)}</span>;
  switch (field.type) {
    case "enum": {
      // A two-state field that is flipped often is a switch, not a label to open a form for.
      if (field.toggle && field.options?.length === 2 && onToggle) {
        // SILENCE MEANS IN USE, and the cell has to say the same thing the model does.
        // `isSetBack` treats an empty value as in scope - only an explicit first option takes
        // a record out - but this read the value as "in scope" ONLY when it literally said
        // so, and every untouched record therefore displayed its own opposite: a study of 62
        // records showed "out of scope" on all of them while every count included them.
        const on = String(value ?? "") !== field.options[0];
        // Blocked only in the direction that would take the record out of play: putting
        // one IN is never in conflict with anything.
        return (
          <button className={"cell-toggle" + (on ? " on" : "") + (on && toggleBlocked ? " locked" : "")}
            disabled={!!(on && toggleBlocked)}
            title={(on && toggleBlocked) || `${optionLabel(field, field.options[on ? 0 : 1])} instead`}
            onClick={(e) => { e.stopPropagation(); if (!(on && toggleBlocked)) onToggle(field, field.options![on ? 0 : 1]); }}>
            {optionLabel(field, field.options[on ? 1 : 0])}
          </button>
        );
      }
      return value ? <span className="badge" title={String(value)}>{optionLabel(field, String(value))}</span> : <span className="hint">—</span>;
    }
    case "scale": {
      const v = typeof value === "number" ? value : 1;
      return <ScaleBadge value={v} max={scaleMax(field)} label={scaleLabel(field, v)} positive={field.polarity === "positive"} />;
    }
    case "boolean":
      return <span className="badge">{value ? "yes" : "no"}</span>;
    case "ref":
      if (typeof value === "string" && value) return chip(value);
      return lost.length ? <>{lost.map(gonePill)}</> : <span className="hint">—</span>;
    case "multiref": {
      const ids = Array.isArray(value) ? (value as string[]) : [];
      if (!ids.length && !lost.length) return <span className="hint">—</span>;
      // Compact in the table: first two, then a count - the full list is in the row detail.
      return (
        <div className="multi">
          {ids.slice(0, 2).map(chip)}
          {ids.length > 2 && <span className="chip more" title={ids.map(nameOf).join(", ")}>+{ids.length - 2}</span>}
          {lost.map(gonePill)}
        </div>
      );
    }
    default:
      return <span>{clip(String(value ?? ""), 60) || <span className="hint">—</span>}</span>;
  }
}

export function EntitySection({ type, study, tax, color, draggableRows, renderDetailExtra, headerExtra, hideAdd }:
  { type: EntityTypeDef; study: Study; tax: Taxonomy; color: string;
    draggableRows?: boolean; renderDetailExtra?: (r: EntityRecord) => ReactNode; headerExtra?: ReactNode; hideAdd?: boolean }) {
  const deleteEntity = useStore((s) => s.deleteEntity);
  const updateEntity = useStore((s) => s.updateEntity);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [modal, setModal] = useState<{ typeKey: string; record: EntityRecord | null } | null>(null);

  const items = study.entities.filter((e) => e.type === type.key);
  const allCols = columnFields(type);
  const title = titleField(type);

  // One filter, shared with every other long table - see TableTools.
  // The table's own name, so its arrangement is remembered per study and per type.
  const tableScope = foldScope(study.id, type.key);
  const f = useTableFilter(type, items, () => setCollapsed(new Set()), tableScope);
  const { shown, groups, groupField, filtered } = f;
  // What this reader folded away here last time. Kept out of the study on purpose: a fold
  // belongs to whoever is reading, not to the analysis - see viewstate.ts. Grouping by a
  // different field is a different layout, so the axis is part of the name.
  const scope = foldScope(study.id, type.key, groupField?.key ?? "");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => getFolds(scope));
  useEffect(() => { setCollapsed(getFolds(scope)); }, [scope]);
  // Which columns this reader put away. Independent of the grouping axis - the same
  // choice of columns holds however the rows are arranged - so it hangs on the table's
  // own name, and like the folds it stays out of the study.
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => getHiddenColumns(tableScope));
  useEffect(() => { setHiddenCols(getHiddenColumns(tableScope)); }, [tableScope]);
  const cols = allCols.filter((c) => !hiddenCols.has(c.key));
  const setColumns = (next: Set<string>) => { setHiddenCols(next); setHiddenColumns(tableScope, next); };
  // Worth showing once a table is long enough to be hard to read - or wide enough that it
  // cannot be read in one piece whatever its length.
  const showTools = items.length >= TOOLBAR_MIN_ROWS || tableMinWidth(allCols) > WIDE_TABLE;
  const clearAll = f.clearAll;
  const toggleGroup = (k: string) => setCollapsed((c) => {
    const n = new Set(c); n.has(k) ? n.delete(k) : n.add(k);
    setFolds(scope, n);        // coalesced; a burst of clicks writes once
    return n;
  });

  // Whether the pinned title column has anything sliding under it yet. Painting it
  // unconditionally would put a seam on every table, including the ones that fit.
  const body = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);

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
        <span className="badge" title={filtered ? `${shown.length} shown of ${items.length}` : undefined}>{filtered ? `${shown.length} / ${items.length}` : items.length}</span>
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

      {showTools && <TableTools type={type} f={f} columns={{
        fields: allCols, hidden: hiddenCols,
        toggle: (key) => { const n = new Set(hiddenCols); n.has(key) ? n.delete(key) : n.add(key); setColumns(n); },
        showAll: () => setColumns(new Set()),
      }} />}

      <div className={"panel-body" + (pinned ? " pinned" : "")} ref={body}
        onScroll={() => setPinned((body.current?.scrollLeft ?? 0) > 0)}>
        {items.length === 0 ? (
          <div className="empty" style={{ padding: "28px 16px" }}>No {type.labelPlural.toLowerCase()} yet.</div>
        ) : shown.length === 0 ? (
          <div className="empty" style={{ padding: "28px 16px" }}>
            Nothing matches. <button className="btn ghost sm" onClick={clearAll}>Clear filters</button>
          </div>
        ) : (
          <table className="tbl" style={{ minWidth: tableMinWidth(cols) }}>
            <colgroup>
              {/* No width: in a fixed layout the unsized column takes what the sized ones
                  leave, so the name grows with the window and there is no dead gutter. */}
              <col />
              {cols.map((c) => <col key={c.key} style={{ width: COL_WIDTH[c.type] }} />)}
            </colgroup>
            <thead>
              <tr>
                <th>{type.fields.find((f) => f.key === title)?.label ?? "Name"}</th>
                {cols.map((c) => <th key={c.key} title={c.label}>{c.label}</th>)}
              </tr>
            </thead>
            {groups.map((g) => (
            <tbody key={g.key || "_"} className={groupField ? "grouped" : undefined}>
              {groupField && (
                <tr className="group-row" onClick={() => toggleGroup(g.key)}>
                  <th colSpan={cols.length + 1}>
                    <span className={"caret" + (collapsed.has(g.key) ? "" : " open")}><Icon.chevron /></span>
                    {g.key || <span className="hint">no {groupField.label.toLowerCase()}</span>}
                    <span className="badge">{g.items.length}</span>
                  </th>
                </tr>
              )}
              {(groupField && collapsed.has(g.key) ? [] : g.items).map((r) => {
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
                      {cols.map((c) => <td key={c.key}><FieldValueView field={c} value={r.values[c.key] ?? null} tax={tax} study={study} recordId={r.id}
                        onOpen={openEntity} toggleBlocked={setBackBlocked(tax, study, r)}
                        onToggle={(f, next) => updateEntity(r.id, { ...r.values, [f.key]: next },
                          `${f.label}: ${optionLabel(f, next)}`)} /></td>)}
                    </tr>
                    {isOpen && (
                      <tr className="detail-row">
                        <td colSpan={cols.length + 1}>
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
            ))}
          </table>
        )}
      </div>

      {modal && <EntityModal type={getType(tax, modal.typeKey)!} tax={tax} study={study} record={modal.record} onClose={() => setModal(null)} />}
    </div>
  );
}

/** What disabling a record would do, shown before it is done.
 *
 *  Three lists, no prose: what is in use here (and therefore refuses), what goes with it,
 *  what stays with one reason fewer. Each entry is a box carrying the record, its type and
 *  the field it hangs on - a sentence would say the same and be read less carefully. */
function ScopeDialog({ record, tax, study, onClose }:
  { record: EntityRecord; tax: Taxonomy; study: Study; onClose: () => void }) {
  const setScope = useStore((s) => s.setScope);
  const change = scopeChange(tax, study, record.id);
  const inPlay = !isSetBack(tax, record);
  const typeOf = (r: EntityRecord) => getType(tax, r.type)?.label ?? r.type;
  const title = (r: EntityRecord) => { const t = getType(tax, r.type); return t ? recordTitle(t, r) : r.id; };
  useDismissOnEscape(true, onClose);

  const boxes = (items: { record: EntityRecord; note?: string }[], tone: string, cap = 10) => (
    <div className="dep-grid">
      {items.slice(0, cap).map((x, i) => (
        <div className={"dep " + tone} key={`${x.record.id}-${i}`}>
          <b>{title(x.record)}</b>
          <span>{typeOf(x.record)}{x.note ? ` · ${x.note}` : ""}</span>
        </div>
      ))}
      {items.length > cap && <div className={"dep " + tone + " more"}>+{items.length - cap} more</div>}
    </div>
  );

  const others = change.carried.filter((r) => r.id !== record.id);
  const blocked = change.blocked.map((b) => ({ record: b.record, note: b.field }));
  const weak = change.weakened.map((w) => ({ record: w.record,
    note: w.left === 0 ? `${w.field}: none left` : `${w.field}: ${w.left} other${w.left === 1 ? "" : "s"}` }));

  return (
    <Overlay onClose={onClose}>
      <div className="modal-lg scope-dlg" style={{ maxWidth: 620 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-lg-head">
          <h3>{inPlay ? "Disable" : "Enable"} <span className="scope-name">{title(record)}</span></h3>
        </div>
        <div className="modal-lg-body">
          {!inPlay ? (
            <p className="scope-lead">Counts again everywhere.</p>
          ) : blocked.length ? (
            <>
              <p className="scope-lead warn">Currently in use by {blocked.length} record{blocked.length === 1 ? "" : "s"}</p>
              {boxes(blocked, "block")}
            </>
          ) : (
            <>
              {others.length > 0 && (
                <>
                  <p className="scope-h">Disabled with it ({others.length})</p>
                  {boxes(others.map((r) => ({ record: r })), "carry")}
                </>
              )}
              {weak.length > 0 && (
                <>
                  {/* Not "still used elsewhere": some of these lose their last link in the
                      field named and keep standing for another reason entirely. "Affected"
                      is what they have in common; the box says the rest. */}
                  <p className="scope-h">Also affected ({weak.length})</p>
                  {boxes(weak, "weak", 6)}
                </>
              )}
              {!others.length && !weak.length && <p className="scope-lead">Nothing else is affected.</p>}
              {!change.possible && <p className="scope-lead warn">A type involved has no switch in this taxonomy.</p>}
            </>
          )}
        </div>
        <div className="modal-lg-foot">
          <span className="spacer" />
          <button className="btn ghost sm" onClick={onClose}>Cancel</button>
          <button className={"btn sm " + (inPlay ? "danger" : "primary")}
            disabled={inPlay && (blocked.length > 0 || !change.possible)}
            onClick={() => {
              if (inPlay) setScope(change.carried.map((r) => r.id), false, others.length ? `Disabled with ${others.length} dependent record${others.length === 1 ? "" : "s"}` : "Disabled");
              else setScope([record.id], true, "Enabled");
              onClose();
            }}>
            {/* The count is what WILL happen; with the action refused there is nothing to
                count, and a disabled button reading "Disable 4" reads like a threat. */}
            {inPlay ? <><Icon.ban /> Disable{others.length && !blocked.length ? ` ${change.carried.length}` : ""}</> : "Enable"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

// Deleting asks the same question as disabling and answers it destructively. The warning
// and the store read the SAME traversal (domain/scope.ts), so what is listed here is what
// will happen - a warning derived separately would eventually describe something else.
function DeleteDialog({ record, tax, study, onConfirm, onClose }:
  { record: EntityRecord; tax: Taxonomy; study: Study; onConfirm: () => void; onClose: () => void }) {
  const change = deleteChange(tax, study, record.id);
  const typeOf = (r: EntityRecord) => getType(tax, r.type)?.label ?? r.type;
  const title = (r: EntityRecord) => { const t = getType(tax, r.type); return t ? recordTitle(t, r) : r.id; };
  useDismissOnEscape(true, onClose);

  const boxes = (items: { record: EntityRecord; note?: string }[], tone: string, cap = 10) => (
    <div className="dep-grid">
      {items.slice(0, cap).map((x, i) => (
        <div className={"dep " + tone} key={`${x.record.id}-${i}`}>
          <b>{title(x.record)}</b>
          <span>{typeOf(x.record)}{x.note ? ` · ${x.note}` : ""}</span>
        </div>
      ))}
      {items.length > cap && <div className={"dep " + tone + " more"}>+{items.length - cap} more</div>}
    </div>
  );

  const others = change.removed.filter((r) => r.id !== record.id);
  const lost = [
    ...change.cleared.map((c) => ({ record: c.record, note: `${c.field}: emptied` })),
    ...change.shortened.map((c) => ({ record: c.record,
      note: c.left === 0 ? `${c.field}: none left` : `${c.field}: ${c.left} left` })),
  ];

  return (
    <Overlay onClose={onClose}>
      <div className="modal-lg scope-dlg" style={{ maxWidth: 620 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-lg-head">
          <h3>Delete <span className="scope-name">{title(record)}</span></h3>
        </div>
        <div className="modal-lg-body">
          {others.length > 0 ? (
            <>
              <p className="scope-lead warn">Deleted with it ({others.length}) — this cannot be undone</p>
              {boxes(others.map((r) => ({ record: r })), "block")}
            </>
          ) : (
            <p className="scope-lead">Nothing else is deleted.</p>
          )}
          {lost.length > 0 && (
            <>
              {/* These keep standing; what they lose is the link. The record will show
                  a "deleted" mark where the link was, so the gap is not silent. */}
              <p className="scope-h">Loses a reference to it ({lost.length})</p>
              {boxes(lost, "weak", 6)}
            </>
          )}
          {!others.length && !lost.length && <p className="scope-lead">Nothing else is affected.</p>}
          <p className="scope-lead">To keep the record and its judgement out of the figures, disable it instead.</p>
        </div>
        <div className="modal-lg-foot">
          <span className="spacer" />
          <button className="btn ghost sm" onClick={onClose}>Cancel</button>
          <button className="btn sm danger" onClick={() => { onConfirm(); onClose(); }}>
            <Icon.trash /> Delete{others.length ? ` ${change.removed.length}` : ""}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

// Inline expandable detail. Linked entities (refs + referenced-by) are
// clickable → open in the popup (used to reach items from other workshops).
function EntityDetail({ type, record, tax, study, color, onEdit, onDelete, onOpenEntity, extra }: {
  type: EntityTypeDef; record: EntityRecord; tax: Taxonomy; study: Study; color: string;
  onEdit: () => void; onDelete: () => void; onOpenEntity: (id: string) => void; extra?: ReactNode;
}) {
  const [histOpen, setHistOpen] = useState(false);
  const [scopeAsk, setScopeAsk] = useState(false);
  const [delAsk, setDelAsk] = useState(false);
  const [openRels, setOpenRels] = useState<Set<string>>(new Set());
  const title = titleField(type);
  // The switch is not listed among the values: it has a button of its own two lines above,
  // and as a field it reads "In scope —" on every record that was never touched, which is
  // a row of nothing wherever the eye goes.
  const toggleKey = toggleStates(type)?.field.key;
  const scalarFields = type.fields.filter((f) => f.key !== title && f.key !== toggleKey
    && f.type !== "textarea" && f.type !== "ref" && f.type !== "multiref");
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

  // What points at this record, grouped by WHO points and THROUGH WHICH relation. An
  // asset a hundred requirements name is a wall of chips as one flat list; as "Requirements
  // - applies to (93)" it is a sentence, and the hundred are one press away.
  const backGroups = new Map<string, { type: EntityTypeDef; rel: string; ids: string[] }>();
  for (const e of study.entities) {
    const et = getType(tax, e.type);
    if (!et || e.id === record.id) continue;
    for (const f of refFields(et)) {
      const v = e.values[f.key];
      const ids = f.type === "multiref" ? (Array.isArray(v) ? (v as string[]) : []) : v ? [v as string] : [];
      if (!ids.includes(record.id)) continue;
      const rel = f.relation ?? f.label;
      const key = `${et.key}::${rel}`;
      const g = backGroups.get(key);
      if (g) g.ids.push(e.id);
      else backGroups.set(key, { type: et, rel, ids: [e.id] });
    }
  }
  const incoming = [...backGroups.values()].sort((a, b) => b.ids.length - a.ids.length);

  return (
    <div className="detail">
      <div className="detail-actions">
        <span className="d-sub" style={{ margin: 0, flex: 1 }}>Details</span>
        <button className="btn sm" style={{ background: `color-mix(in oklch, ${color} 20%, transparent)`, borderColor: `color-mix(in oklch, ${color} 45%, transparent)`, color: "var(--fg)" }} onClick={onEdit}><Icon.edit /> Edit</button>
        {/* Out of scope sits next to Edit because it is an edit - of what the study still
            considers, not of what it says. Delete is the other thing entirely and keeps
            its distance. */}
        {toggleStates(type) && (
          <button className="btn sm warn" onClick={() => setScopeAsk(true)}
            title={isSetBack(tax, record)
              ? "Bring this record back into the analysis"
              : "Keep the record, take it out of every count"}>
            <Icon.ban /> {isSetBack(tax, record) ? "Enable" : "Disable"}
          </button>
        )}
        <button className="btn sm danger" onClick={() => setDelAsk(true)}><Icon.trash /> Delete</button>
      </div>
      {scopeAsk && <ScopeDialog record={record} tax={tax} study={study} onClose={() => setScopeAsk(false)} />}
      {delAsk && <DeleteDialog record={record} tax={tax} study={study}
        onConfirm={onDelete} onClose={() => setDelAsk(false)} />}
      {record.source && <div className="ent-source" style={{ marginBottom: 8 }} title="Extracted from this source"><Icon.doc /> {record.source}</div>}
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
            <div className="d-v"><FieldValueView field={f} value={record.values[f.key] ?? null} tax={tax} study={study} recordId={record.id} /></div>
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
          {incoming.map((g) => {
            const key = `${g.type.key}::${g.rel}`;
            const all = openRels.has(key);
            const shown = all ? g.ids : g.ids.slice(0, BACKREF_PREVIEW);
            return (
              <div className="d-rel-group" key={key}>
                <div className="d-rel-head">
                  <span className="d-rel-what">{g.ids.length === 1 ? g.type.label : g.type.labelPlural}</span>
                  <span className="d-rel-how">{g.rel} &rarr;</span>
                  <span className="badge">{g.ids.length}</span>
                </div>
                <div className="multi">
                  {shown.map(linkChip)}
                  {g.ids.length > shown.length && (
                    <button type="button" className="chip more"
                      onClick={() => setOpenRels((o) => { const n = new Set(o); n.add(key); return n; })}>
                      +{g.ids.length - shown.length} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {(() => {
        const hist = entryOf(study.log, record.id);
        return hist.length > 0 && (
          <button className="hist-btn" onClick={() => setHistOpen(true)}>
            <span className="d-sub" style={{ margin: 0 }}>Change history</span>
            <span className="hist-count">{hist.length}</span>
            <IntegrityBadge study={study} entityId={record.id} />
            <span className="hist-view">View →</span>
          </button>
        );
      })()}
      {histOpen && <ChangeHistoryModal tax={tax} study={study} record={record} onClose={() => setHistOpen(false)} />}
      <div className="detail-meta mono">updated {new Date(record.updatedAt).toLocaleString()}</div>
    </div>
  );
}
