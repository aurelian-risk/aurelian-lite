// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
import { useState } from "react";
import { Sentence } from "./Sentence";
import { t as tr } from "../domain/i18n";
import { useStore } from "../domain/store";
import { makeSampleStudy } from "../profile";
import { clearStorage } from "../domain/persistence";
import { deleteDocsForStudy } from "../domain/documents";
import { SECTORS } from "../domain/calibration";
import { Dialog, Icon } from "./ui";
import { DataMenu } from "./DataMenu";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export function Dashboard({ onOpen }: { onOpen: () => void }) {
  const studies = useStore((s) => s.studies);
  const { createStudy, updateStudy, setActiveStudy, deleteStudy, mergeStudies, resetTaxonomy } = useStore();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", organization: "", scope: "", sector: "" });

  const open = (id: string) => { setActiveStudy(id); onOpen(); };
  const loadSample = () => {
    resetTaxonomy(); // ensure the full EBIOS taxonomy (scenarios/kill-chains/risk quantification) is active
    const s = makeSampleStudy();
    mergeStudies([s]);
    setActiveStudy(s.id);
    onOpen();
  };
  const hardReset = async () => {
    if (!confirm("Reset ALL local data (all studies + taxonomy) and reload? This clears the browser's stored data and cannot be undone.")) return;
    await clearStorage();
    location.reload();
  };
  const submit = () => {
    if (!form.name.trim()) return;
    const id = createStudy(form.name.trim(), form.organization.trim(), form.scope.trim());
    if (form.sector) updateStudy(id, { sector: form.sector });
    setForm({ name: "", organization: "", scope: "", sector: "" });
    setCreating(false);
    onOpen();
  };

  return (
    <div className="content">
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <h1 className="grad-text">{tr('ui.dashboard.risk-studies', 'Risk Studies')}</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn ghost danger" onClick={hardReset} title={tr('ui.dashboard.clear-all-locally-stored', 'Clear all locally stored data and reload')}>{tr('ui.dashboard.reset', 'Reset')}</button>
          <DataMenu label={tr("ui.datamenu.data", "Data")} />
          <button className="btn primary" onClick={() => setCreating(true)}><Icon.plus /> {tr('ui.dashboard.new-study', 'New study')}</button>
        </div>
      </div>

      {studies.length === 0 ? (
        <div className="empty">
          <h3>{tr('ui.dashboard.no-studies-yet', 'No studies yet')}</h3>
          <Sentence k="ui.dashboard.create-your-first" parts={[<span className="mono">.json</span>, <span className="mono">.yaml</span>]} en={"Create your first EBIOS RM-inspired analysis, load the sample, or import a {0} / {1} file."} />
          <div style={{ marginTop: 18, display: "flex", gap: 8, justifyContent: "center" }}>
            <button className="btn primary" onClick={() => setCreating(true)}><Icon.plus /> {tr('ui.dashboard.new-study', 'New study')}</button>
            <button className="btn" onClick={loadSample}><Icon.spark /> {tr('ui.dashboard.load-sample-study', 'Load sample study')}</button>
          </div>
        </div>
      ) : (
        <div className="grid-cards">
          {studies.map((s) => (
            <div className="card clickable" key={s.id} onClick={() => open(s.id)}>
              <div style={{ display: "flex", alignItems: "start" }}>
                <div style={{ flex: 1 }}>
                  <h3>{s.name}</h3>
                  <div className="meta">{s.organization || "—"}</div>
                </div>
                <button className="btn ghost sm danger" title={tr('ui.dashboard.delete', 'Delete')}
                  onClick={(e) => { e.stopPropagation(); if (confirm(`Delete study "${s.name}"?`)) { deleteStudy(s.id); void deleteDocsForStudy(s.id); } }}>
                  <Icon.trash />
                </button>
              </div>
              {s.scope && <div className="meta" style={{ marginTop: 8 }}>{s.scope}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center" }}>
                <span className="badge">{s.entities.length} entities</span>
                <span className="meta" style={{ marginLeft: "auto" }}>{fmt(s.updatedAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <Dialog title={tr('ui.dashboard.new-study', 'New study')} subtitle="Define the analysis scope and perimeter" onClose={() => setCreating(false)}>
          <div className="field"><label>{tr('ui.dashboard.study-name', 'Study name')}</label>
            <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Riverside General Hospital — Core Systems"
              onKeyDown={(e) => e.key === "Enter" && submit()} /></div>
          <div className="field"><label>{tr('ui.dashboard.organization', 'Organization')}</label>
            <input value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })}
              placeholder="e.g. Riverside General Hospital Trust" /></div>
          <div className="field"><label>{tr('ui.dashboard.sector', 'Sector')}</label>
            <select value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })}>
              <option value="">{tr('ui.dashboard.not-set-no-sector', 'Not set — no sector adjustment')}</option>
              {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="hint">{tr('ui.dashboard.some-kinds-of-attacker', 'Some kinds of attacker go after some sectors far more than others. Used by the quantification&apos;s base rates; changeable later in Calibration.')}</span></div>
          <div className="field"><label>{tr('ui.dashboard.analysis-perimeter-scope', 'Analysis perimeter / scope')}</label>
            <textarea value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}
              placeholder={tr('ui.dashboard.what-is-in-scope', 'What is in scope? Which systems, processes, boundaries?')} /></div>
          <div className="dialog-actions">
            <button className="btn ghost" onClick={() => setCreating(false)}>{tr('ui.dashboard.cancel', 'Cancel')}</button>
            <button className="btn primary" onClick={submit} disabled={!form.name.trim()}>{tr('ui.dashboard.create', 'Create')}</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
