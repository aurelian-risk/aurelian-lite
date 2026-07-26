// Risk matrix — plots entities of a type on a likelihood × gravity heatmap
// (uses the type's first two scale fields). Chips open the entity editor.
import { Fragment, useState } from "react";
import type { EntityRecord, EntityTypeDef, Study, Taxonomy } from "../domain/types";
import { recordTitle, scaleLabel, scaleMax } from "../domain/taxonomy";
import { EntityModal } from "./EntityModal";

function risk(r: number) {
  return r < 0.3 ? "var(--color-state-success)" : r < 0.55 ? "var(--color-state-info)" : r < 0.8 ? "var(--color-state-warning)" : "var(--color-state-error)";
}

export function RiskMatrix({ tax, study, type, color }: { tax: Taxonomy; study: Study; type: EntityTypeDef; color: string }) {
  const [rec, setRec] = useState<EntityRecord | null>(null);
  const scales = type.fields.filter((f) => f.type === "scale");
  const xF = scales[0], yF = scales[1];
  if (!xF || !yF) return null;
  const xMax = scaleMax(xF), yMax = scaleMax(yF);
  const items = study.entities.filter((e) => e.type === type.key);
  const at = (x: number, y: number) => items.filter((e) => (Number(e.values[xF.key]) || 1) === x && (Number(e.values[yF.key]) || 1) === y);
  const xs = Array.from({ length: xMax }, (_, i) => i + 1);
  const ys = Array.from({ length: yMax }, (_, i) => yMax - i); // high gravity on top

  return (
    <div className="panel ws-accent" style={{ ["--ws-color" as string]: color, marginBottom: 20, padding: 16 }}>
      <div className="panel-head" style={{ padding: "0 0 12px", border: "none" }}>
        <h3>Risk matrix</h3>
        <span className="badge">{items.length}</span>
        <span className="spacer" />
        <span className="hint">{yF.label} ↑ × {xF.label} →</span>
      </div>
      <div className="risk-matrix" style={{ ["--xn" as string]: xMax }}>
        {ys.map((y) => (
          <Fragment key={y}>
            <div className="rm-ylabel">{scaleLabel(yF, y)}</div>
            {xs.map((x) => {
              const c = risk((x / xMax) * (y / yMax));
              return (
                <div key={x} className="rm-cell" style={{ background: `color-mix(in oklch, ${c} 16%, transparent)`, borderColor: `color-mix(in oklch, ${c} 38%, transparent)` }}>
                  {at(x, y).map((e) => (
                    <button key={e.id} className="rm-chip" style={{ borderColor: c }} onClick={() => setRec(e)}>{recordTitle(type, e)}</button>
                  ))}
                </div>
              );
            })}
          </Fragment>
        ))}
        <div />
        {xs.map((x) => <div key={x} className="rm-xlabel">{scaleLabel(xF, x)}</div>)}
      </div>
      {rec && <EntityModal type={type} tax={tax} study={study} record={rec} onClose={() => setRec(null)} />}
    </div>
  );
}
