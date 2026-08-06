// Popup showing one entity's hash-chained change history. Reused from the entity
// table (opened on click) and the timeline (clicking a row).
import { createPortal } from "react-dom";
import type { ChangeEntry, EntityRecord, FieldValue, Study, Taxonomy } from "../domain/types";
import { getType, recordTitle, scaleLabel } from "../domain/taxonomy";
import { entryOf, verifyLog } from "../domain/audit";
import { Icon } from "./ui";

function fmtVal(tax: Taxonomy, study: Study, e: EntityRecord, key: string, v: FieldValue): string {
  const f = getType(tax, e.type)?.fields.find((x) => x.key === key);
  if (v == null || v === "") return "—";
  if (f?.type === "scale" && typeof v === "number") return scaleLabel(f, v);
  if (f?.type === "ref" && typeof v === "string") {
    const r = study.entities.find((x) => x.id === v), t = r && getType(tax, r.type);
    return r && t ? recordTitle(t, r) : "—";
  }
  if (Array.isArray(v)) return `${v.length} link${v.length === 1 ? "" : "s"}`;
  return String(v).length > 44 ? String(v).slice(0, 44) + "…" : String(v);
}

/** Human-readable action for a change entry ("created" / "changed X: a → b"). Works for
 *  a record that no longer exists: the entry carries its own type and title. */
export function changeActionText(tax: Taxonomy, study: Study, e: EntityRecord | undefined, entry: ChangeEntry): string {
  if (entry.kind === "create") return "created";
  if (entry.kind === "delete") return "deleted";
  const ch = entry.changes ?? [];
  const typeKey = e?.type ?? entry.entityType;
  const label = (k: string) => getType(tax, typeKey)?.fields.find((x) => x.key === k)?.label ?? k;
  const verb = entry.kind === "import" ? "imported" : "updated";
  if (!ch.length) return verb;
  if (ch.length === 1 && e) {
    const c = ch[0], f = getType(tax, typeKey)?.fields.find((x) => x.key === c.field);
    if (f && f.type !== "textarea" && f.type !== "multiref")
      return `changed ${label(c.field)}: ${fmtVal(tax, study, e, c.field, c.from)} → ${fmtVal(tax, study, e, c.field, c.to)}`;
    return `changed ${label(c.field)}`;
  }
  return "changed " + ch.map((c) => label(c.field)).join(", ");
}

/** Integrity of the whole study log, and of this record's place in it. Three separate
 *  statements, because they fail for different reasons: the log was altered, the record
 *  was edited outside the app, or it is not in the log at all. */
export function IntegrityBadge({ study, entityId }: { study: Study; entityId?: string }) {
  const v = verifyLog(study.log, study.entities);
  const state: "ok" | "chain" | "drift" | "untracked" =
    v.chainBroken ? "chain"
      : entityId && v.drifted.includes(entityId) ? "drift"
        : entityId && v.untracked.includes(entityId) ? "untracked"
          : !entityId && !v.ok ? "drift" : "ok";
  const text = { ok: "integrity verified", chain: "log altered", drift: "changed outside the app", untracked: "not in the log" }[state];
  const title = {
    ok: "Hash chain intact and matching the data",
    chain: `Hash chain broken at entry ${v.brokenAt ?? "?"} — an entry was altered, removed or reordered`,
    drift: "The values no longer match what the log last recorded — the file was edited outside the application. Re-import it and confirm the changes to re-establish the chain.",
    untracked: "The log knows nothing about this record — it was added to the file from outside. Re-import it and confirm to take it into the log.",
  }[state];
  return <span className={"hist-chain " + (state === "ok" ? "ok" : "bad")} title={title}>{text}</span>;
}

export function ChangeHistoryModal({ tax, study, record, onClose }:
  { tax: Taxonomy; study: Study; record: EntityRecord; onClose: () => void }) {
  const type = getType(tax, record.type);
  const history = entryOf(study.log, record.id);
  return createPortal(
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal-lg" style={{ maxWidth: 560 }} onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-lg-head">
          <div style={{ flex: 1 }}>
            <div className="dialog-sub" style={{ margin: 0 }}>Change history · {type?.label ?? record.type}</div>
            <h2 style={{ fontSize: 19 }}>{type ? recordTitle(type, record) : record.id}</h2>
          </div>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close"><Icon.close /></button>
        </header>
        <div className="modal-lg-body">
          <div className="hist-head" style={{ marginBottom: 10 }}>
            <span className="d-sub" style={{ margin: 0 }}>{history.length} change{history.length === 1 ? "" : "s"}</span>
            <IntegrityBadge study={study} entityId={record.id} />
          </div>
          {history.length === 0 ? (
            <div className="hint">No changes recorded yet.</div>
          ) : (
            <ul className="hist-list">
              {[...history].reverse().map((h, i) => (
                <li className="hist-item" key={i}>
                  <span className="hist-when mono">{new Date(h.ts).toLocaleString()}</span>
                  <span className="hist-who">{h.editor}</span>
                  <span className="hist-what">{changeActionText(tax, study, record, h)}</span>
                  {h.comment && <span className="hist-note">“{h.comment}”</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
