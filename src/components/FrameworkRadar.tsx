// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Compliance analytics: a radar of requirement-coverage per framework.
// Coverage = share of a framework's requirements fulfilled by >=1 security measure that is
// actually in play: a control recorded from a publisher's library but never adopted fulfils
// nothing, however many requirements it names.
import { useMemo } from "react";
import { t as tr } from "../domain/i18n";
import type { EntityTypeDef, Study, Taxonomy } from "../domain/types";
import { isSetBack } from "../domain/taxonomy";
import { RadarChart, type RadarAxis } from "./RadarChart";

export function FrameworkRadar({ tax, study, reqType, color }: { tax: Taxonomy; study: Study; reqType: EntityTypeDef; color: string }) {
  const axes = useMemo<RadarAxis[]>(() => {
    const fwF = reqType.fields.find((f) => f.key === "framework") ?? reqType.fields.find((f) => f.type === "text" && f.key !== (reqType.titleField ?? "name"));
    const measureType = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "multiref" && f.refType === reqType.key));
    const fulfillsF = measureType?.fields.find((f) => f.type === "multiref" && f.refType === reqType.key);
    if (!fwF || !measureType || !fulfillsF) return [];
    const reqs = study.entities.filter((e) => e.type === reqType.key);
    const measures = study.entities.filter((e) => e.type === measureType.key && !isSetBack(tax, e));
    const fulfilled = (id: string) => measures.some((m) => Array.isArray(m.values[fulfillsF.key]) && (m.values[fulfillsF.key] as string[]).includes(id));
    const groups = new Map<string, { total: number; cov: number }>();
    for (const r of reqs) {
      const fw = String(r.values[fwF.key] || "Other");
      const g = groups.get(fw) ?? { total: 0, cov: 0 };
      g.total++; if (fulfilled(r.id)) g.cov++;
      groups.set(fw, g);
    }
    return [...groups.entries()].map(([label, g]) => ({ label, value: g.total ? g.cov / g.total : 0, sub: `${g.cov}/${g.total}` }));
  }, [tax, study, reqType]);

  if (axes.length === 0) return null;

  return (
    <div className="panel ws-accent" style={{ ["--ws-color" as string]: color, marginBottom: 20 }}>
      <div className="panel-head">
        <h3>{tr('ui.frameworkradar.framework-coverage', 'Framework coverage')}</h3>
        <span className="spacer" />
        <span className="hint">{tr("ui.frameworkradar.requirements-per-framework", "requirements fulfilled per framework")}</span>
      </div>
      <div className="panel-body chart-center">
        <RadarChart axes={axes} accent={color} />
      </div>
    </div>
  );
}
