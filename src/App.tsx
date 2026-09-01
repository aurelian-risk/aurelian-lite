// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
import { useEffect, useState } from "react";
import { useStore } from "./domain/store";
import { t, tn, chooseLanguage, getLanguage, languagesOffered } from "./domain/i18n";
import { PRODUCT } from "./profile";
import { Dashboard } from "./components/Dashboard";
import { StudyView } from "./components/StudyView";
import { TaxonomyView } from "./components/TaxonomyView";
import { DocumentsView } from "./components/DocumentsView";
import { ModelView } from "./components/ModelView";
import { TimelineView } from "./components/TimelineView";
import { Icon, useLanguage } from "./components/ui";

type Route = "dashboard" | "study" | "taxonomy" | "documents" | "model" | "timeline";

/** A language named in ITSELF, not in the one being read.
 *
 *  The whole use of this button is to be understood by someone who cannot read the
 *  language they are currently being shown, so "German" on an English screen is exactly
 *  the wrong word — the reader looking for a way out is the one who does not read English.
 *  `Intl.DisplayNames` carries the endonyms already; a hand-written list would be a second
 *  place to add a language, and the one that gets forgotten. */
const endonym = (lang: string): string => {
  try {
    const own = new Intl.DisplayNames([lang], { type: "language" }).of(lang);
    // A locale with no data for itself answers with the tag it was given.
    if (own && own.toLowerCase() !== lang.toLowerCase()) return own[0].toUpperCase() + own.slice(1);
  } catch { /* no Intl data in this browser: the tag says enough */ }
  return lang.toUpperCase();
};

/** Offered only where there is something to choose. One language is not a choice, and a
 *  product that ships one should not carry a button that does nothing. */
/** Change language, and re-seed the sample study with it.
 *
 *  The sample is demonstration material and follows the reader — a half-German example is
 *  the state that confuses. But it is replaced, not converted, so anything typed into it
 *  goes: where that would discard work the reader is asked first, and where it would not
 *  (the ordinary case) nothing is asked at all. */
function switchTo(lang: string): void {
  const edited = useStore.getState().editedSamples();
  if (edited > 0 && !confirm(tn("ui.nav.language.reseed-ask", edited,
    "The sample study has been edited. Switching language replaces it with the version in the new language, and those edits are lost. Continue?",
    "The sample studies have been edited. Switching language replaces them with the versions in the new language, and those edits are lost. Continue?"))) return;
  chooseLanguage(lang);
  useStore.getState().reseedSample();
}

function LanguageSwitch() {
  const offered = languagesOffered();
  if (offered.length < 2) return null;
  const next = offered[(offered.indexOf(getLanguage()) + 1) % offered.length];
  return (
    <button className="nav-item" onClick={() => switchTo(next)}
      title={t("ui.nav.language.title", "Show the interface in another language")} lang={next}>
      <span className="nav-mark"><Icon.globe /></span>
      {endonym(next)}
    </button>
  );
}

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
        <svg className="logo-mark" width="42" height="42" viewBox="0 0 32 32" fill="none" aria-label={PRODUCT.mark}>
          <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--fg-muted)" }}>
            <path d="M8.5 24.8 L16 19.8 L23.5 24.8" opacity="0.55" />
            <path d="M8.5 17.5 L16 12.5 L23.5 17.5" />
          </g>
          <path d="M8.5 12.0 L16 7.0 L23.5 12.0" fill="none" stroke="var(--color-workshop-2)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div>
          <div className="name">{PRODUCT.name}</div>
          <div className="tag">{t("product.tagline", PRODUCT.tagline)}</div>
        </div>
      </div>
      <div className="nav-section">{t("ui.nav.section", "Navigation")}</div>
      <button className={"nav-item" + (route === "dashboard" || route === "study" ? " active" : "")} onClick={() => go("dashboard")}>
        <span className="num">S</span> {t("ui.nav.studies", "Studies")}
      </button>
      <button className={"nav-item" + (route === "documents" ? " active" : "")} onClick={() => go("documents")}
        title={hasStudy ? t("ui.nav.documents.hasStudy", "Documents for the active study") : t("ui.nav.documents.none", "Import a document corpus (creates a study)")}>
        <span className="num"><Icon.doc /></span> {t("ui.nav.documents", "Documents")}
      </button>
      <button className={"nav-item" + (route === "model" ? " active" : "")} onClick={() => go("model")}>
        <span className="num"><Icon.spark /></span> {t("ui.nav.model", "Model")}
      </button>
      <button className={"nav-item" + (route === "taxonomy" ? " active" : "")} onClick={() => go("taxonomy")}>
        <span className="num"><Icon.schema /></span> {t("ui.nav.taxonomy", "Taxonomy")}
      </button>
      <button className={"nav-item" + (route === "timeline" ? " active" : "")} onClick={() => go("timeline")}
        title={t("ui.nav.timeline.title", "Change timeline of the active study")}>
        <span className="num"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></span> {t("ui.nav.timeline", "Timeline")}
      </button>

      <div style={{ flex: 1 }} />
      <LanguageSwitch />
      <button className="nav-item" onClick={toggleTheme}>
        <span className="nav-mark"><span className="dot" style={{ background: "var(--primary)" }} /></span>
        {light ? t("ui.nav.theme.dark", "Dark theme") : t("ui.nav.theme.light", "Light theme")}
      </button>
      {/* Under a file-level copyleft the built file has to tell its recipient where the
          source is - this build may well be the only copy someone ever receives. */}
      <div className="colophon">
        {PRODUCT.name} {__APP_VERSION__} · {__APP_LICENSE__}
        {PRODUCT.source && <><br /><a href={`https://${PRODUCT.source}`} target="_blank" rel="noreferrer">{PRODUCT.source}</a></>}
      </div>
    </div>
  );
}

export default function App() {
  // Redraw when the language changes. A plain render is the whole mechanism and it is
  // enough here, which was worth measuring rather than assuming: nothing in this tree is
  // wrapped in `memo`, so one render at the root reaches every string, and no module
  // builds a translated string once at import time. Only a `useMemo` that computes FROM
  // words can hold the old language, and those name it in their dependencies.
  //
  // It costs the reader nothing — not the open workshop, not the selected record, not a
  // half-typed field. Remounting under a key would also have worked and would have thrown
  // all three away.
  useLanguage();
  const hydrated = useStore((s) => s.hydrated);
  const hydrate = useStore((s) => s.hydrate);
  const activeStudyId = useStore((s) => s.activeStudyId);
  const [route, setRoute] = useState<Route>("dashboard");

  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => { if (hydrated && activeStudyId) setRoute("study"); }, [hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!hydrated) {
    return <div className="empty" style={{ height: "100%", display: "grid", placeItems: "center" }}>{t("ui.app.loading", "Loading …")}</div>;
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
