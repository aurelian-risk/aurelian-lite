// Popup showing one entity's hash-chained change history. Reused from the entity
// table (opened on click) and the timeline (clicking a row).
import { createPortal } from "react-dom";
import type { ChangeEntry, EntityRecord, FieldValue, Study, Taxonomy } from "../domain/types";
import { getType, recordTitle, scaleLabel } from "../domain/taxonomy";
import { verifyChain } from "../domain/audit";
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

/** Human-readable action for a change entry ("created" / "changed X: a → b"). */
export function changeActionText(tax: Taxonomy, study: Study, e: EntityRecord, entry: ChangeEntry): string {
  if (entry.kind === "create") return "created";
  const ch = entry.changes ?? [];
  const label = (k: string) => getType(tax, e.type)?.fields.find((x) => x.key === k)?.label ?? k;
  if (!ch.length) return "updated";
  if (ch.length === 1) {
    const c = ch[0], f = getType(tax, e.type)?.fields.find((x) => x.key === c.field);
    if (f && f.type !== "textarea" && f.type !== "multiref")
      return `changed ${label(c.field)}: ${fmtVal(tax, study, e, c.field, c.from)} → ${fmtVal(tax, study, e, c.field, c.to)}`;
    return `changed ${label(c.field)}`;
  }
  return "changed " + ch.map((c) => label(c.field)).join(", ");
}

/** Verified / altered integrity label (no icon). */
export function IntegrityBadge({ history }: { history?: ChangeEntry[] }) {
  const ok = verifyChain(history);
  return <span className={"hist-chain " + (ok ? "ok" : "bad")}
    title={ok ? "Hash chain intact — history is unmodified" : "Hash chain broken — a past entry was altered"}>
    {ok ? "integrity verified" : "integrity altered"}
  </span>;
}

export function ChangeHistoryModal({ tax, study, record, onClose }:
  { tax: Taxonomy; study: Study; record: EntityRecord; onClose: () => void }) {
  const type = getType(tax, record.type);
  const history = record.history ?? [];
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
            <IntegrityBadge history={history} />
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
