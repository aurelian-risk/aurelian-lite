// Global change timeline: every entity's hash-chained history, aggregated across
// the active study and shown newest-first, grouped by day. A left-nav view.
import { useMemo, useState } from "react";
import { useActiveStudy, useStore } from "../domain/store";
import { getType, recordTitle } from "../domain/taxonomy";
import { verifyChain } from "../domain/audit";
import { ChangeHistoryModal, changeActionText } from "./ChangeHistoryModal";
import type { ChangeEntry, EntityRecord } from "../domain/types";

interface Row { entity: EntityRecord; entry: ChangeEntry; color: string; typeLabel: string; entLabel: string; chainOk: boolean }

export function TimelineView() {
  const study = useActiveStudy();
  const tax = useStore((s) => s.taxonomy);
  const [openRec, setOpenRec] = useState<EntityRecord | null>(null);

  const rows = useMemo<Row[]>(() => {
    if (!study) return [];
    const groupColor = (gk?: string) => tax.groups.find((g) => g.key === gk)?.color ?? "var(--fg-subtle)";
    const out: Row[] = [];
    for (const e of study.entities) {
      if (!e.history?.length) continue;
      const t = getType(tax, e.type);
      const chainOk = verifyChain(e.history);
      for (const entry of e.history)
        out.push({ entity: e, entry, color: groupColor(t?.group), typeLabel: t?.label ?? e.type, entLabel: t ? recordTitle(t, e) : e.id, chainOk });
    }
    return out.sort((a, b) => (a.entry.ts < b.entry.ts ? 1 : a.entry.ts > b.entry.ts ? -1 : 0));
  }, [study, tax]);

  if (!study) return <div className="empty" style={{ padding: "60px 24px" }}>No active study. Open a study to see its change timeline.</div>;

  const editors = new Set(rows.map((r) => r.entry.editor));
  const entities = new Set(rows.map((r) => r.entity.id));

  // group rows by calendar day
  const days: { key: string; label: string; rows: Row[] }[] = [];
  for (const r of rows) {
    const d = new Date(r.entry.ts);
    const key = d.toISOString().slice(0, 10);
    const last = days[days.length - 1];
    if (last && last.key === key) last.rows.push(r);
    else days.push({ key, label: d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" }), rows: [r] });
  }

  return (
    <div className="content tl-wrap">
      <div className="page-head">
        <div>
          <h2 style={{ margin: 0 }}>Change timeline</h2>
          <p className="hint" style={{ margin: "4px 0 0" }}>Every change across “{study.name}”, newest first — hash-chained for tamper-evidence.</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty" style={{ padding: "48px 24px" }}>No changes recorded yet. Edit any entity (with an editor name and optional note) and it appears here.</div>
      ) : (
        <>
          <div className="tl-stats">
            <span><strong>{rows.length}</strong> changes</span>
            <span><strong>{entities.size}</strong> entities</span>
            <span><strong>{editors.size}</strong> {editors.size === 1 ? "editor" : "editors"}</span>
          </div>
          {days.map((day) => (
            <div className="tl-day" key={day.key}>
              <div className="tl-day-h">{day.label}</div>
              <ul className="tl-list">
                {day.rows.map((r, i) => (
                  <li className="tl-item" key={i} role="button" tabIndex={0} title="Open this entity's change history"
                    onClick={() => setOpenRec(r.entity)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenRec(r.entity); } }}>
                    <span className="tl-time mono">{new Date(r.entry.ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="tl-dot" style={{ background: r.color }} />
                    <span className="tl-body">
                      <span className="tl-line1">
                        <span className="tl-ent">{r.entLabel}</span>
                        <span className="tl-type" style={{ color: r.color, borderColor: `color-mix(in oklch, ${r.color} 45%, transparent)` }}>{r.typeLabel}</span>
                        {!r.chainOk && <span className="tl-altered" title="Hash chain broken — this entity's history was altered">integrity altered</span>}
                      </span>
                      <span className="tl-line2">
                        <span className="tl-who">{r.entry.editor}</span>
                        <span className="tl-what">{changeActionText(tax, study, r.entity, r.entry)}</span>
                        {r.entry.comment && <span className="tl-note">“{r.entry.comment}”</span>}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
      {openRec && <ChangeHistoryModal tax={tax} study={study} record={openRec} onClose={() => setOpenRec(null)} />}
    </div>
  );
}
