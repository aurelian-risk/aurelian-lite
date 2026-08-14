// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Risk-Sources analytics: a radar comparing threat actors across their EBIOS
// rating scores (capability, resources, activity, relevance, …). Each actor is
// one polygon; the axes are the score dimensions. Falls back to bars for <3 scores.
import { useMemo } from "react";
import type { EntityTypeDef, Study } from "../domain/types";
import { recordTitle, scaleMax } from "../domain/taxonomy";
import { SERIES_PALETTE } from "../domain/viz";
import { RadarChart, type RadarSeries } from "./RadarChart";

export function ThreatActorRadar({ study, actorType, color }: { study: Study; actorType: EntityTypeDef; color: string }) {
  const { axisLabels, series } = useMemo(() => {
    const scales = actorType.fields.filter((f) => f.type === "scale");
    const catF = actorType.fields.find((f) => f.type === "enum");
    const actors = study.entities.filter((e) => e.type === actorType.key);
    const axisLabels = scales.map((f) => f.label);
    const series: RadarSeries[] = actors.map((a, i) => ({
      label: recordTitle(actorType, a),
      sub: catF ? String(a.values[catF.key] ?? "") : undefined,
      color: SERIES_PALETTE[i % SERIES_PALETTE.length],
      values: scales.map((f) => (Number(a.values[f.key] ?? 1) - 1) / Math.max(1, scaleMax(f) - 1)),
    }));
    return { axisLabels, series };
  }, [study, actorType]);

  if (series.length === 0 || axisLabels.length === 0) return null;

  return (
    <div className="panel ws-accent" style={{ ["--ws-color" as string]: color, marginBottom: 20 }}>
      <div className="panel-head">
        <h3>Threat landscape</h3>
        <span className="spacer" />
        <span className="hint">actors compared across EBIOS rating scores</span>
      </div>
      <div className="panel-body chart-center">
        <RadarChart axisLabels={axisLabels} series={series} accent={color} />
      </div>
    </div>
  );
}
