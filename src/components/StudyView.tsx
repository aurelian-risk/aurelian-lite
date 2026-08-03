import { Fragment, useState } from "react";
import type { Study, Taxonomy } from "../domain/types";
import { useActiveStudy, useStore } from "../domain/store";
import { workshopMarkdown, reportMarkdown, reportHtml, openReportHtml, downloadText, copyText } from "../domain/clipboard";
import { EntitySection } from "./EntitySection";
import { RiskMatrix } from "./RiskMatrix";
import { KillChainLane } from "./KillChainLane";
import { AttackPathsView } from "./AttackPathsView";
import { KillChainMitigation } from "./KillChainMitigation";
import { CoverageMatrix } from "./CoverageMatrix";
import { MitigationCharts } from "./MitigationCharts";
import { FrameworkRadar } from "./FrameworkRadar";
import { ThreatActorRadar } from "./ThreatActorRadar";
import { AssetHeatmap } from "./AssetHeatmap";
import { QuantificationView } from "./QuantificationView";
import { CatalogAdd } from "./CatalogAdd";
import { catalogTargets } from "../domain/catalog";
import { GraphView } from "./GraphView";
import { CompletenessView } from "./CompletenessView";
import { CanvasView } from "./CanvasView";
import { DataMenu } from "./DataMenu";
import { Icon } from "./ui";

const reportSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "study";

// One "Report" button with two output choices: a rendered, print-ready HTML page
// (new tab) or a Markdown file.
function ReportMenu({ tax, study }: { tax: Taxonomy; study: Study }) {
  const [open, setOpen] = useState(false);
  const slug = reportSlug(study.name);
  return (
    <div style={{ position: "relative" }}>
      <button className="btn sm" title="Generate a report of this study" onClick={() => setOpen((o) => !o)}>
        <Icon.doc /> Report
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div className="menu-pop">
            <div className="menu-label">Report</div>
            <button className="menu-item stacked" onClick={() => { setOpen(false); openReportHtml(reportHtml(tax, study), `${slug}-report.html`); }}>
              <Icon.doc />
              <span className="mi-text"><span>Open in browser (HTML)</span><span className="menu-hint">rendered · print-ready · new tab</span></span>
            </button>
            <button className="menu-item stacked" onClick={() => { setOpen(false); downloadText(`${slug}-report.md`, reportMarkdown(tax, study)); }}>
              <Icon.download />
              <span className="mi-text"><span>Download Markdown</span><span className="menu-hint">.md file</span></span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function CopyButton({ getText }: { getText: () => string }) {
  const [done, setDone] = useState(false);
  const onClick = async () => {
    const ok = await copyText(getText());
    setDone(ok);
    setTimeout(() => setDone(false), 1800);
  };
  return (
    <button className="btn sm" onClick={onClick} title="Copy this workshop as LLM-ready context">
      {done ? <><Icon.check /> Copied</> : <><Icon.copy /> Copy for LLM</>}
    </button>
  );
}

export function StudyView({ onBack }: { onBack: () => void }) {
  const study = useActiveStudy();
  const tax = useStore((s) => s.taxonomy);
  const setActiveStudy = useStore((s) => s.setActiveStudy);
  const [tab, setTab] = useState<string>(tax.groups[0]?.key ?? "graph");

  if (!study) return null;
  const back = () => { setActiveStudy(null); onBack(); };
  const activeGroup = tax.groups.find((g) => g.key === tab);

  return (
    <div className="main">
      <div className="topbar">
        <button className="btn ghost sm" onClick={back}>← Studies</button>
        <div>
          <div className="title">{study.name}</div>
          <div className="sub">{study.organization || "no organization"}</div>
        </div>
        <span className="spacer" />
        <ReportMenu tax={tax} study={study} />
        <DataMenu studyScope={study} label="Export / Import" />
      </div>

      <div className="ws-tabs">
        {tax.groups.map((g, i) => (
          <button key={g.key} className={"ws-tab" + (tab === g.key ? " active" : "")}
            style={{ ["--ws" as string]: g.color }} onClick={() => setTab(g.key)} title={g.description || g.label}>
            <span className="num">{i + 1}</span>
            <span className="t-title">{g.label}</span>
          </button>
        ))}
        <span className="ws-sep" aria-hidden />
        <button className={"ws-tab plain" + (tab === "canvas" ? " active" : "")} onClick={() => setTab("canvas")} title="Event chains">
          <span className="num"><Icon.canvas /></span>
          <span className="t-title">Flow</span>
        </button>
        <button className={"ws-tab plain" + (tab === "graph" ? " active" : "")} onClick={() => setTab("graph")} title="Relationships">
          <span className="num"><Icon.graph /></span>
          <span className="t-title">Graph</span>
        </button>
        <button className={"ws-tab plain" + (tab === "checks" ? " active" : "")} onClick={() => setTab("checks")} title="Analysis completeness checks">
          <span className="num"><Icon.check /></span>
          <span className="t-title">Checks</span>
        </button>
      </div>

      <div className="content">
        {tab === "graph" ? (
          <GraphView tax={tax} study={study} />
        ) : tab === "checks" ? (
          <CompletenessView tax={tax} study={study} />
        ) : tab === "canvas" ? (
          <CanvasView tax={tax} study={study} />
        ) : activeGroup ? (
          <>
            <div className="group-toolbar">
              {activeGroup.description && (
                <div className="guide" style={{ flex: 1, marginBottom: 0 }}>
                  <strong>{activeGroup.label}.</strong> {activeGroup.description}.
                </div>
              )}
              <CopyButton getText={() => workshopMarkdown(tax, study, activeGroup.key)} />
            </div>
            {(() => {
              // Risk matrix: only for the strategic-scenario workshop (WS3).
              const mt = tax.entityTypes.find((t) => t.group === activeGroup.key
                && /scenario/i.test(t.key) && !/operational/i.test(t.key)
                && t.fields.filter((f) => f.type === "scale").length >= 2);
              return mt ? <RiskMatrix tax={tax} study={study} type={mt} color={activeGroup.color} /> : null;
            })()}
            {(() => {
              // WS5: coverage overview (ring + tactic heatmap) ABOVE the tables.
              const stepT = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "ref" && f.refType) && t.fields.some((f) => f.type === "number"));
              const hasMeasure = tax.entityTypes.some((t) => t.group === activeGroup.key && t.key !== stepT?.key && t.fields.some((f) => f.type === "multiref" && f.refType === stepT?.key));
              return hasMeasure ? <MitigationCharts tax={tax} study={study} color={activeGroup.color} /> : null;
            })()}
            {(() => {
              // WS5: kill-chain mitigation (per-step measure assignment) ABOVE the tables.
              const stepT = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "ref" && f.refType) && t.fields.some((f) => f.type === "number"));
              const hasMeasure = tax.entityTypes.some((t) => t.group === activeGroup.key && t.key !== stepT?.key && t.fields.some((f) => f.type === "multiref" && f.refType === stepT?.key));
              return hasMeasure ? <KillChainMitigation tax={tax} study={study} color={activeGroup.color} /> : null;
            })()}
            {(() => {
              // WS4: the kill-chain lane is embedded in each operational scenario's
              // expanded row; the kill-chain-steps table stays and its rows are
              // draggable onto the tactic tiles.
              const stepT = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "ref" && f.refType) && t.fields.some((f) => f.type === "number"));
              const opKey = stepT?.fields.find((f) => f.type === "ref" && f.refType)?.refType;
              // WS1: the asset-criticality heatmap sits BETWEEN the business-asset
              // table and its supporting-asset table. "business" = a type with a
              // scale that a sibling's multiref points at (its supporting assets).
              const gts = tax.entityTypes.filter((t) => t.group === activeGroup.key);
              const biz = gts.find((t) => t.fields.some((f) => f.type === "scale") && gts.some((o) => o.fields.some((f) => f.type === "multiref" && f.refType === t.key)));
              const supp = biz ? (gts.find((t) => t.fields.some((f) => f.type === "multiref" && f.refType === biz.key)) ?? null) : null;
              // Catalog-backed types (requirement, security measure) get the "+ Add"
              // catalog picker in place of the plain add button — treated analogously.
              const targets = catalogTargets(tax);
              return gts.map((t) => {
                const target = targets.find((tg) => tg.type.key === t.key);
                return (
                  <Fragment key={t.key}>
                    <EntitySection type={t} study={study} tax={tax} color={activeGroup.color}
                      draggableRows={t.key === stepT?.key}
                      hideAdd={!!target}
                      headerExtra={target ? <CatalogAdd tax={tax} study={study} target={target} /> : undefined}
                      renderDetailExtra={t.key === opKey ? (r) => <KillChainLane tax={tax} study={study} op={r} color={activeGroup.color} /> : undefined} />
                    {biz && t.key === biz.key && (
                      <AssetHeatmap tax={tax} study={study} businessType={biz} supportingType={supp} color={activeGroup.color} />
                    )}
                  </Fragment>
                );
              });
            })()}
            {(() => {
              // WS4: integrated attack-paths projection — all kill chains of this study
              // converging on the target assets, as a sub-section below the tables. Shown
              // only in the workshop that owns the kill-chain step type.
              const stepT = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "ref" && f.refType) && t.fields.some((f) => f.type === "number"));
              return stepT && stepT.group === activeGroup.key ? <AttackPathsView tax={tax} study={study} color={activeGroup.color} /> : null;
            })()}
            {/* Risk Quantification: the derived Monte-Carlo tuner. Purely parametric
                (from the qualitative model), so the group needs no manual entity. */}
            {activeGroup.key === "quant" && <QuantificationView tax={tax} study={study} color={activeGroup.color} />}
            {(() => {
              // WS2: threat-landscape radar over the risk-source actors.
              const actorT = tax.entityTypes.find((t) => t.group === activeGroup.key && t.fields.some((f) => f.type === "scale" && f.key === "capability"));
              return actorT ? <ThreatActorRadar study={study} actorType={actorT} color={activeGroup.color} /> : null;
            })()}
            {(() => {
              // Compliance: framework-coverage radar ABOVE the traceability matrix.
              const reqType = tax.entityTypes.find((t) => t.group === activeGroup.key && t.fields.some((f) => f.key === "framework"));
              return reqType ? <FrameworkRadar tax={tax} study={study} reqType={reqType} color={activeGroup.color} /> : null;
            })()}
            {(() => {
              // Compliance: coverage / traceability matrix, rendered BELOW the requirements table.
              const reqType = tax.entityTypes.find((t) => t.group === activeGroup.key && t.fields.some((f) => f.key === "framework"));
              return reqType ? <CoverageMatrix tax={tax} study={study} reqType={reqType} color={activeGroup.color} /> : null;
            })()}
          </>
        ) : null}
      </div>
    </div>
  );
}
