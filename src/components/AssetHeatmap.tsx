// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Foundation (WS1) analytics: a criticality heatmap of the business assets -
// each a tile shaded on the severity ramp (green = low … red = critical). Click a
// tile to expand a tree of the supporting assets that depend on it; any node
// opens the underlying entity. Deterministic, generic.
import { useMemo, useState } from "react";
import { t as tr, tn } from "../domain/i18n";
import type { EntityRecord, EntityTypeDef, Study, Taxonomy } from "../domain/types";
import { getType, recordTitle, scaleLabel, scaleMax, typeLabel, typeLabelPlural } from "../domain/taxonomy";
import { badColor } from "../domain/viz";
import { EntityModal } from "./EntityModal";
import { Icon } from "./ui";

export function AssetHeatmap({ tax, study, businessType, supportingType, color }:
  { tax: Taxonomy; study: Study; businessType: EntityTypeDef; supportingType: EntityTypeDef | null; color: string }) {
  const [rec, setRec] = useState<EntityRecord | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const { critF, typeF, tiles, max } = useMemo(() => {
    const critF = businessType.fields.find((f) => f.type === "scale");
    const suppRefF = supportingType?.fields.find((f) => f.type === "multiref" && f.refType === businessType.key);
    const typeF = supportingType?.fields.find((f) => f.type === "enum");
    const items = study.entities.filter((e) => e.type === businessType.key);
    const supportersOf = (id: string): EntityRecord[] => !supportingType || !suppRefF ? []
      : study.entities.filter((e) => e.type === supportingType.key && Array.isArray(e.values[suppRefF.key]) && (e.values[suppRefF.key] as string[]).includes(id));
    const max = critF ? scaleMax(critF) : 4;
    const tiles = items
      .map((e) => ({ e, v: critF ? Number(e.values[critF.key] ?? 1) : 1, supporters: supportersOf(e.id) }))
      .sort((a, b) => b.v - a.v);
    return { critF, typeF, tiles, max };
  }, [tax, study, businessType, supportingType]);

  if (!critF || tiles.length === 0) return null;
  const suppLabel = (n: number) =>
    `${n} ${(n === 1 ? typeLabel(supportingType!) : typeLabelPlural(supportingType!)).toLowerCase()}`;

  return (
    <div className="panel ws-accent" style={{ ["--ws-color" as string]: color, marginBottom: 20 }}>
      <div className="panel-head">
        <h3>{tr('ui.assetheatmap.asset-criticality', 'Asset criticality')}</h3>
        <span className="spacer" />
        <div className="ah-legend" aria-hidden>
          {Array.from({ length: max }, (_, i) => {
            const v = i + 1, ratio = (v - 1) / Math.max(1, max - 1);
            return <span key={v} className="ah-legend-item"><i style={{ background: badColor(ratio) }} />{scaleLabel(critF, v)}</span>;
          })}
        </div>
      </div>
      <div className="panel-body" style={{ padding: "6px 16px 14px" }}>
        <p className="ah-intro">{tr('ui.assetheatmap.your-business-assets-ranked', 'Your business assets ranked by criticality (most critical first). Click a tile to reveal the supporting assets it depends on - so you can focus protection where a compromise would hurt most.')}</p>
        <div className="asset-heat">
          {tiles.map(({ e, v, supporters }) => {
            const ratio = (v - 1) / Math.max(1, max - 1);
            const c = badColor(ratio);
            const isOpen = open.has(e.id);
            const canExpand = supporters.length > 0;
            return (
              <div key={e.id} className={"ah-tile" + (isOpen ? " open" : "")}
                style={{ background: `color-mix(in oklch, ${c} ${16 + ratio * 60}%, transparent)`, borderColor: `color-mix(in oklch, ${c} 55%, transparent)` }}>
                <div className="ah-head" role={canExpand ? "button" : undefined} tabIndex={canExpand ? 0 : undefined}
                  onClick={canExpand ? () => toggle(e.id) : undefined}
                  onKeyDown={canExpand ? (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggle(e.id); } } : undefined}
                  title={canExpand ? (isOpen ? tr("ui.assetheatmap.collapse", "Collapse") : tr("ui.assetheatmap.expand-dependencies", "Expand dependencies")) : undefined}>
                  {canExpand && <span className={"caret" + (isOpen ? " open" : "")}><Icon.chevron /></span>}
                  <span className="ah-name" title={recordTitle(businessType, e)}>{recordTitle(businessType, e)}</span>
                  <button className="ah-open" title={`Open ${typeLabel(businessType).toLowerCase()}`} onClick={(ev) => { ev.stopPropagation(); setRec(e); }}><Icon.edit /></button>
                </div>
                <div className="ah-meta">
                  <span className="ah-crit" style={{ color: c }}>{scaleLabel(critF, v)}</span>
                  {canExpand && <span className="ah-sup" title={tn("ui.assetheatmap.depend-on-this", supporters.length, "{0} depends on this asset", "{0} depend on this asset").replace("{0}", suppLabel(supporters.length))}>{suppLabel(supporters.length)}</span>}
                </div>
                {isOpen && (
                  <div className="ah-tree">
                    {supporters.map((sa) => (
                      <button key={sa.id} className="ah-node" onClick={() => setRec(sa)} title={tr('ui.assetheatmap.open', 'Open')}>
                        {typeF && sa.values[typeF.key] && <span className="ah-node-tag">{String(sa.values[typeF.key])}</span>}
                        <span className="ah-node-name">{recordTitle(supportingType!, sa)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {rec && <EntityModal type={getType(tax, rec.type)!} tax={tax} study={study} record={rec} onClose={() => setRec(null)} />}
    </div>
  );
}
