// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Global change timeline: every entity's hash-chained history, aggregated across
// the active study and shown newest-first, grouped by day. A left-nav view.
import { useMemo, useState } from "react";
import { useActiveStudy, useStore } from "../domain/store";
import { getType, recordTitle } from "../domain/taxonomy";
import { STUDY_SCOPE, verifyLog } from "../domain/audit";
import { ChangeHistoryModal, IntegrityBadge, changeActionText } from "./ChangeHistoryModal";
import type { ChangeEntry, EntityRecord } from "../domain/types";

interface Row { entity?: EntityRecord; entry: ChangeEntry; color: string; typeLabel: string; entLabel: string; gone: boolean; scope: boolean }

export function TimelineView() {
  const study = useActiveStudy();
  const tax = useStore((s) => s.taxonomy);
  const [openRec, setOpenRec] = useState<EntityRecord | null>(null);

  const verdict = useMemo(() => verifyLog(study?.log, study?.entities ?? []), [study]);

  const rows = useMemo<Row[]>(() => {
    if (!study) return [];
    const groupColor = (gk?: string) => tax.groups.find((g) => g.key === gk)?.color ?? "var(--fg-subtle)";
    const byId = new Map(study.entities.map((e) => [e.id, e]));
    // Newest first BY TIMESTAMP, not by append order: adopting a colleague's entries on
    // import inserts older changes at the end of the chain, and the day grouping below
    // relies on the rows being ordered.
    return [...(study.log ?? [])]
      .sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : b.seq - a.seq))
      .map((entry) => {
        const e = byId.get(entry.entity);
        const scope = entry.entity === STUDY_SCOPE;
        const t = scope ? undefined : getType(tax, e?.type ?? entry.entityType);
        return {
          entity: e, entry, color: scope ? "var(--fg-subtle)" : groupColor(t?.group),
          typeLabel: scope ? "study" : t?.label ?? entry.entityType,
          entLabel: e && t ? recordTitle(t, e) : entry.title, gone: !scope && !e, scope,
        };
      });
  }, [study, tax]);

  if (!study) return <div className="empty" style={{ padding: "60px 24px" }}>No active study. Open a study to see its change timeline.</div>;

  const editors = new Set(rows.map((r) => r.entry.editor));
  const entities = new Set(rows.map((r) => r.entry.entity).filter((id) => id !== STUDY_SCOPE));

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
            <span><strong>{entities.size}</strong> records</span>
            <span><strong>{editors.size}</strong> {editors.size === 1 ? "editor" : "editors"}</span>
            <IntegrityBadge study={study} />
          </div>
          {!verdict.ok && (
            <div className="guide warn tl-warn">
              {verdict.chainBroken
                ? <>The log itself does not check out from entry {verdict.brokenAt} onwards - an entry was altered, removed or reordered outside the application.</>
                : <>
                    {verdict.drifted.length > 0 && <>{verdict.drifted.length} record{verdict.drifted.length === 1 ? " no longer matches" : "s no longer match"} what the log last recorded. </>}
                    {verdict.untracked.length > 0 && <>{verdict.untracked.length} record{verdict.untracked.length === 1 ? " is" : "s are"} not in the log at all. </>}
                    The file was edited outside the application. Import it again and confirm the changes to put the chain back on a defensible footing.
                  </>}
            </div>
          )}
          {days.map((day) => (
            <div className="tl-day" key={day.key}>
              <div className="tl-day-h">{day.label}</div>
              <ul className="tl-list">
                {day.rows.map((r, i) => (
                  <li className={"tl-item" + (r.gone ? " tl-gone" : "") + (r.scope ? " tl-scope" : "")} key={i}
                    role={r.entity ? "button" : undefined} tabIndex={r.entity ? 0 : undefined}
                    title={r.entity ? "Open this record's change history" : "This record no longer exists"}
                    onClick={() => r.entity && setOpenRec(r.entity)}
                    onKeyDown={(e) => { if (r.entity && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setOpenRec(r.entity); } }}>
                    <span className="tl-time mono">{new Date(r.entry.ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="tl-dot" style={{ background: r.color }} />
                    <span className="tl-body">
                      <span className="tl-line1">
                        <span className="tl-ent">{r.entLabel}</span>
                        <span className="tl-type" style={{ color: r.color, borderColor: `color-mix(in oklch, ${r.color} 45%, transparent)` }}>{r.typeLabel}</span>
                        {r.entry.kind === "delete" && <span className="tl-kind del">deleted</span>}
                        {r.entry.kind === "import" && <span className="tl-kind imp">imported</span>}
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
