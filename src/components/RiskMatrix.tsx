// Risk matrix — plots entities of a type on a likelihood × gravity heatmap
// (uses the type's first two scale fields). When a treatment type carries a
// residual likelihood/gravity, an inherent↔residual toggle shows where the
// controls move each risk. Chips open the entity editor.
import { Fragment, useState } from "react";
import type { EntityRecord, EntityTypeDef, Study, Taxonomy } from "../domain/types";
import { recordTitle, scaleLabel, scaleMax } from "../domain/taxonomy";
import { residualPos } from "../domain/treatment";
import { EntityModal } from "./EntityModal";

function risk(r: number) {
  return r < 0.3 ? "var(--color-state-success)" : r < 0.55 ? "var(--color-state-info)" : r < 0.8 ? "var(--color-state-warning)" : "var(--color-state-error)";
}

export function RiskMatrix({ tax, study, type, color }: { tax: Taxonomy; study: Study; type: EntityTypeDef; color: string }) {
  const [rec, setRec] = useState<EntityRecord | null>(null);
  const [mode, setMode] = useState<"inherent" | "residual">("inherent");
  const scales = type.fields.filter((f) => f.type === "scale");
  const xF = scales[0], yF = scales[1];
  if (!xF || !yF) return null;
  const xMax = scaleMax(xF), yMax = scaleMax(yF);

  // A treatment type: refs this risk type and carries a decision. The residual
  // position is DERIVED from the decision + applied measures (see treatment.ts).
  const treatType = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "ref" && f.refType === type.key)
    && t.fields.some((f) => f.key === "decision"));
  const treatRefF = treatType?.fields.find((f) => f.type === "ref" && f.refType === type.key);
  const decisionF = treatType?.fields.find((f) => f.key === "decision");
  const treatOf = new Map<string, EntityRecord>();
  if (treatType && treatRefF) for (const t of study.entities.filter((e) => e.type === treatType.key)) {
    const sid = t.values[treatRefF.key]; if (typeof sid === "string") treatOf.set(sid, t);
  }
  const hasResidual = !!treatType && treatOf.size > 0;

  const items = study.entities.filter((e) => e.type === type.key);
  const inherent = (e: EntityRecord) => ({ x: Number(e.values[xF.key]) || 1, y: Number(e.values[yF.key]) || 1 });
  const residual = (e: EntityRecord) => {
    const t = treatOf.get(e.id);
    return t ? residualPos(study, tax, e, t, xF.key, yF.key) : inherent(e); // untreated stay put
  };
  // Resolve every position ONCE per render. The residual position now runs the chain
  // traversal (see treatment.ts), so calling it per grid cell - which is what a naive
  // `at(x, y)` does - would simulate the same risk once for every square on the board.
  const posMap = new Map<string, { x: number; y: number }>(
    items.map((e) => [e.id, mode === "residual" ? residual(e) : inherent(e)]),
  );
  const posOf = (e: EntityRecord) => posMap.get(e.id) ?? inherent(e);
  const at = (x: number, y: number) => items.filter((e) => { const p = posOf(e); return p.x === x && p.y === y; });
  const xs = Array.from({ length: xMax }, (_, i) => i + 1);
  const ys = Array.from({ length: yMax }, (_, i) => yMax - i); // high gravity on top

  const chipTitle = (e: EntityRecord) => {
    if (mode !== "residual") return recordTitle(type, e);
    const t = treatOf.get(e.id); const inh = inherent(e);
    if (!t) return `${recordTitle(type, e)} — untreated (stays at inherent)`;
    const dec = decisionF ? String(t.values[decisionF.key] ?? "") : "";
    const r = posOf(e);
    return `${recordTitle(type, e)} — ${dec || "treated"}: ${scaleLabel(xF, inh.x)}·${scaleLabel(yF, inh.y)} → ${scaleLabel(xF, r.x)}·${scaleLabel(yF, r.y)}`;
  };

  return (
    <div className="panel ws-accent" style={{ ["--ws-color" as string]: color, marginBottom: 20, padding: 16 }}>
      <div className="panel-head" style={{ padding: "0 0 12px", border: "none" }}>
        <h3>Risk matrix</h3>
        <span className="badge">{items.length}</span>
        {hasResidual && (
          <div className="qt-toggle" style={{ marginLeft: 12 }}>
            <button className={"seg-btn" + (mode === "inherent" ? " on" : "")} onClick={() => setMode("inherent")}>Inherent</button>
            <button className={"seg-btn" + (mode === "residual" ? " on" : "")} onClick={() => setMode("residual")}>Residual</button>
          </div>
        )}
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
                  {at(x, y).map((e) => {
                    const treated = mode === "residual" && treatOf.has(e.id);
                    return (
                      <button key={e.id} className="rm-chip" style={{ borderColor: c }} title={chipTitle(e)} onClick={() => setRec(e)}>
                        {treated && <span className="rm-treated" aria-hidden>✓ </span>}{recordTitle(type, e)}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </Fragment>
        ))}
        <div />
        {xs.map((x) => <div key={x} className="rm-xlabel">{scaleLabel(xF, x)}</div>)}
      </div>
      {mode === "residual" && (
        <div className="hint" style={{ marginTop: 8 }}>Residual = position after treatment, <b>derived</b> from the decision + how well the risk's kill chain is mitigated: <b>Reduce</b> lowers likelihood (by that coverage), <b>Share</b> lowers gravity, <b>Accept</b> keeps it, <b>Avoid</b> removes it. Untreated risks stay at inherent. Hover a chip for the shift.</div>
      )}
      {rec && <EntityModal type={type} tax={tax} study={study} record={rec} onClose={() => setRec(null)} />}
    </div>
  );
}
