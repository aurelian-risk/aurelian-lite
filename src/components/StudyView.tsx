import { useState } from "react";
import { useActiveStudy, useStore } from "../domain/store";
import { workshopMarkdown, copyText } from "../domain/clipboard";
import { EntitySection } from "./EntitySection";
import { RiskMatrix } from "./RiskMatrix";
import { KillChainLane } from "./KillChainLane";
import { GraphView } from "./GraphView";
import { CanvasView } from "./CanvasView";
import { DataMenu } from "./DataMenu";
import { Icon } from "./ui";

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
      </div>

      <div className="content">
        {tab === "graph" ? (
          <GraphView tax={tax} study={study} />
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
              // WS4: the kill-chain lane is embedded in each operational scenario's
              // expanded row; the kill-chain-steps table stays and its rows are
              // draggable onto the tactic tiles.
              const stepT = tax.entityTypes.find((t) => t.fields.some((f) => f.type === "ref" && f.refType) && t.fields.some((f) => f.type === "number"));
              const opKey = stepT?.fields.find((f) => f.type === "ref" && f.refType)?.refType;
              return tax.entityTypes.filter((t) => t.group === activeGroup.key).map((t) => (
                <EntitySection key={t.key} type={t} study={study} tax={tax} color={activeGroup.color}
                  draggableRows={t.key === stepT?.key}
                  renderDetailExtra={t.key === opKey ? (r) => <KillChainLane tax={tax} study={study} op={r} color={activeGroup.color} /> : undefined} />
              ));
            })()}
          </>
        ) : null}
      </div>
    </div>
  );
}
