// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Coverage / traceability - maps EXISTING requirements to the security measures
// that fulfil them. A compact table of frameworks with a coverage status in the
// quick view; expand a framework to assign measures per requirement (writes their
// `fulfills`). Requirements themselves are added in the Requirements table above.
import { Fragment, useState } from "react";
import type { EntityRecord, EntityTypeDef, Study, Taxonomy } from "../domain/types";
import { isSetBack, getType, recordTitle } from "../domain/taxonomy";
import { useStore } from "../domain/store";
import { EntityModal } from "./EntityModal";
import { MultiSelect, Icon } from "./ui";
import { TableTools, useTableFilter } from "./TableTools";

export function CoverageMatrix({ tax, study, reqType, color }: { tax: Taxonomy; study: Study; reqType: EntityTypeDef; color: string }) {
  const updateEntity = useStore((s) => s.updateEntity);
  const [rec, setRec] = useState<EntityRecord | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const measureType = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "multiref" && f.refType === reqType.key));
  const fulfillsF = measureType?.fields.find((f) => f.type === "multiref" && f.refType === reqType.key);
  if (!measureType || !fulfillsF) return null;

  const reqs = study.entities.filter((e) => e.type === reqType.key);
  const measures = study.entities.filter((e) => e.type === measureType.key && !isSetBack(tax, e));
  const measureOpts = measures.map((m) => ({ id: m.id, label: recordTitle(measureType, m) }));

  const fulfils = (m: EntityRecord, rid: string) => Array.isArray(m.values[fulfillsF.key]) && (m.values[fulfillsF.key] as string[]).includes(rid);
  const fulfilling = (rid: string) => measures.filter((m) => fulfils(m, rid)).map((m) => m.id);
  const assign = (rid: string, ids: string[]) => {
    for (const m of measures) {
      const cur = Array.isArray(m.values[fulfillsF.key]) ? (m.values[fulfillsF.key] as string[]) : [];
      const has = cur.includes(rid), should = ids.includes(m.id);
      if (should && !has) updateEntity(m.id, { ...m.values, [fulfillsF.key]: [...cur, rid] });
      else if (!should && has) updateEntity(m.id, { ...m.values, [fulfillsF.key]: cur.filter((x) => x !== rid) });
    }
  };

  // The same filter every long table has. A package of a thousand requirements is not
  // readable as a matrix without one, and "show me only what nothing fulfils" is the
  // question this view exists to answer.
  const f = useTableFilter(reqType, reqs);
  const [gapsOnly, setGapsOnly] = useState(false);
  const visible = gapsOnly ? f.shown.filter((r) => !measures.some((m) => fulfils(m, r.id))) : f.shown;

  const byFw = new Map<string, EntityRecord[]>();
  for (const r of visible) { const k = String(r.values.framework || "Other"); const a = byFw.get(k) ?? []; a.push(r); byFw.set(k, a); }

  return (
    <div className="panel ws-accent" style={{ ["--ws-color" as string]: color, marginBottom: 20 }}>
      <div className="panel-head">
        <h3>Coverage &amp; traceability</h3>
        <span className="badge">{visible.length === reqs.length ? reqs.length : `${visible.length} / ${reqs.length}`}</span>
        <span className="spacer" />
        <button className={"facet-btn" + (gapsOnly ? " on" : "")} onClick={() => setGapsOnly((g) => !g)}
          title="Only the requirements no measure fulfils">Gaps only</button>
      </div>
      <TableTools type={reqType} f={f} groupable={false} />
      <div className="panel-body">
        {reqs.length === 0
          ? <div className="empty" style={{ padding: "24px 16px" }}>No requirements yet — add them in the Requirements table above (e.g. “+ From framework…”).</div>
          : (
            <table className="tbl">
              <colgroup><col style={{ width: 260 }} /><col /><col style={{ width: 40 }} /></colgroup>
              <thead><tr><th>Framework</th><th>Coverage</th><th /></tr></thead>
              <tbody>
                {[...byFw.entries()].map(([fw, list]) => {
                  const covered = list.filter((r) => measures.some((m) => fulfils(m, r.id))).length;
                  const gaps = list.length - covered;
                  const isOpen = open.has(fw);
                  const sc = gaps === 0 ? "var(--color-state-success)" : "var(--color-state-warning)";
                  return (
                    <Fragment key={fw}>
                      <tr className={"row-clickable" + (isOpen ? " expanded" : "")} onClick={() => toggle(fw)}>
                        <td><div className="name"><span className={"caret" + (isOpen ? " open" : "")}><Icon.chevron /></span>{fw}</div></td>
                        <td>
                          <span className="badge" style={{ background: `color-mix(in oklch, ${sc} 20%, transparent)`, color: "var(--fg)" }}>{covered}/{list.length} covered</span>
                          {gaps > 0 && <span className="hint" style={{ marginLeft: 8 }}>{gaps} gap{gaps > 1 ? "s" : ""}</span>}
                        </td>
                        <td />
                      </tr>
                      {isOpen && (
                        <tr className="detail-row">
                          <td colSpan={3}>
                            {list.slice(0, 400).map((r) => {
                              const gap = !measures.some((m) => fulfils(m, r.id));
                              return (
                                <div key={r.id} className={"kcm-step" + (gap ? " gap" : "")}>
                                  <span className="kcm-idx" style={{ width: "auto", padding: "0 6px" }}>{String(r.values.ref_id ?? "")}</span>
                                  <span className="kcm-main">
                                    <button className="chip link" onClick={() => setRec(r)}>{recordTitle(reqType, r)}</button>
                                    {r.values.category ? <span className="kcm-meta hint">{String(r.values.category)}</span> : null}
                                  </span>
                                  <span className="kcm-measures">
                                    {gap && <span className="badge" style={{ color: "var(--color-state-warning)", background: "color-mix(in oklch, var(--color-state-warning) 16%, transparent)" }}>gap</span>}
                                    <MultiSelect options={measureOpts} selected={fulfilling(r.id)} onChange={(ids) => assign(r.id, ids)} placeholder="+ measure" emptyHint="no security measures yet"
                                      onClickChip={(id) => { const m = measures.find((x) => x.id === id); if (m) setRec(m); }} />
                                  </span>
                                </div>
                              );
                            })}
                            {list.length > 400 && <div className="hint" style={{ padding: "6px 4px" }}>
                              +{list.length - 400} more - narrow the filter to see them.</div>}
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
      {rec && <EntityModal type={getType(tax, rec.type)!} tax={tax} study={study} record={rec} onClose={() => setRec(null)} />}
    </div>
  );
}
