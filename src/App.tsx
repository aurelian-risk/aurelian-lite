import { useEffect, useState } from "react";
import { useStore } from "./domain/store";
import { Dashboard } from "./components/Dashboard";
import { StudyView } from "./components/StudyView";
import { TaxonomyView } from "./components/TaxonomyView";
import { DocumentsView } from "./components/DocumentsView";
import { ModelView } from "./components/ModelView";
import { TimelineView } from "./components/TimelineView";
import { Icon } from "./components/ui";

type Route = "dashboard" | "study" | "taxonomy" | "documents" | "model" | "timeline";

function Sidebar({ route, go, hasStudy }: { route: Route; go: (r: Route) => void; hasStudy: boolean }) {
  const [light, setLight] = useState(() => document.documentElement.classList.contains("light"));
  const toggleTheme = () => {
    const el = document.documentElement;
    const next = !light;
    el.classList.toggle("light", next);
    el.classList.toggle("dark", !next);
    setLight(next);
  };
  return (
    <div className="sidebar">
      <div className="brand">
        <svg className="logo-mark" width="42" height="42" viewBox="0 0 32 32" fill="none" aria-label="Aurelian">
          <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--fg-muted)" }}>
            <path d="M8.5 24.8 L16 19.8 L23.5 24.8" opacity="0.55" />
            <path d="M8.5 17.5 L16 12.5 L23.5 17.5" />
          </g>
          <path d="M8.5 12.0 L16 7.0 L23.5 12.0" fill="none" stroke="var(--color-workshop-2)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div>
          <div className="name">Aurelian Lite</div>
          <div className="tag">Structured cyber risk analysis</div>
        </div>
      </div>
      <div className="nav-section">Navigation</div>
      <button className={"nav-item" + (route === "dashboard" || route === "study" ? " active" : "")} onClick={() => go("dashboard")}>
        <span className="num">S</span> Studies
      </button>
      <button className={"nav-item" + (route === "documents" ? " active" : "")} onClick={() => go("documents")}
        title={hasStudy ? "Documents for the active study" : "Import a document corpus (creates a study)"}>
        <span className="num"><Icon.doc /></span> Documents
      </button>
      <button className={"nav-item" + (route === "model" ? " active" : "")} onClick={() => go("model")}>
        <span className="num"><Icon.spark /></span> Model
      </button>
      <button className={"nav-item" + (route === "taxonomy" ? " active" : "")} onClick={() => go("taxonomy")}>
        <span className="num"><Icon.schema /></span> Taxonomy
      </button>
      <button className={"nav-item" + (route === "timeline" ? " active" : "")} onClick={() => go("timeline")}
        title="Change timeline of the active study">
        <span className="num"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></span> Timeline
      </button>

      <div style={{ flex: 1 }} />
      <button className="nav-item" onClick={toggleTheme}>
        <span className="dot" style={{ background: "var(--primary)" }} />
        {light ? "Dark theme" : "Light theme"}
      </button>
    </div>
  );
}

export default function App() {
  const hydrated = useStore((s) => s.hydrated);
  const hydrate = useStore((s) => s.hydrate);
  const activeStudyId = useStore((s) => s.activeStudyId);
  const [route, setRoute] = useState<Route>("dashboard");

  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => { if (hydrated && activeStudyId) setRoute("study"); }, [hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!hydrated) {
    return <div className="empty" style={{ height: "100%", display: "grid", placeItems: "center" }}>Loading …</div>;
  }

  return (
    <div className="app">
      <Sidebar route={route} go={setRoute} hasStudy={!!activeStudyId} />
      {route === "timeline" ? (
        <div className="main"><TimelineView /></div>
      ) : route === "documents" ? (
        <div className="main"><DocumentsView /></div>
      ) : route === "model" ? (
        <div className="main"><ModelView /></div>
      ) : route === "taxonomy" ? (
        <div className="main"><TaxonomyView /></div>
      ) : route === "study" && activeStudyId ? (
        <StudyView onBack={() => setRoute("dashboard")} />
      ) : (
        <div className="main"><Dashboard onOpen={() => setRoute("study")} /></div>
      )}
    </div>
  );
}
