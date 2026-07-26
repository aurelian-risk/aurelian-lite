import { useState } from "react";
import { useStore } from "../domain/store";
import { makeSampleStudy } from "../domain/sample";
import { clearStorage } from "../domain/persistence";
import { deleteDocsForStudy } from "../domain/documents";
import { Dialog, Icon } from "./ui";
import { DataMenu } from "./DataMenu";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export function Dashboard({ onOpen }: { onOpen: () => void }) {
  const studies = useStore((s) => s.studies);
  const { createStudy, setActiveStudy, deleteStudy, mergeStudies, resetTaxonomy } = useStore();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", organization: "", scope: "" });

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
    createStudy(form.name.trim(), form.organization.trim(), form.scope.trim());
    setForm({ name: "", organization: "", scope: "" });
    setCreating(false);
    onOpen();
  };

  return (
    <div className="content">
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <h1 className="grad-text">Risk Studies</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn ghost danger" onClick={hardReset} title="Clear all locally stored data and reload">Reset</button>
          <DataMenu label="Data" />
          <button className="btn primary" onClick={() => setCreating(true)}><Icon.plus /> New study</button>
        </div>
      </div>

      {studies.length === 0 ? (
        <div className="empty">
          <h3>No studies yet</h3>
          Create your first EBIOS RM-inspired analysis, load the sample, or import a <span className="mono">.json</span> / <span className="mono">.yaml</span> file.
          <div style={{ marginTop: 18, display: "flex", gap: 8, justifyContent: "center" }}>
            <button className="btn primary" onClick={() => setCreating(true)}><Icon.plus /> New study</button>
            <button className="btn" onClick={loadSample}><Icon.spark /> Load sample study</button>
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
                <button className="btn ghost sm danger" title="Delete"
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
        <Dialog title="New study" subtitle="Define the analysis scope and perimeter" onClose={() => setCreating(false)}>
          <div className="field"><label>Study name</label>
            <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Riverside General Hospital — Core Systems"
              onKeyDown={(e) => e.key === "Enter" && submit()} /></div>
          <div className="field"><label>Organization</label>
            <input value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })}
              placeholder="e.g. Riverside General Hospital Trust" /></div>
          <div className="field"><label>Analysis perimeter / scope</label>
            <textarea value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}
              placeholder="What is in scope? Which systems, processes, boundaries?" /></div>
          <div className="dialog-actions">
            <button className="btn ghost" onClick={() => setCreating(false)}>Cancel</button>
            <button className="btn primary" onClick={submit} disabled={!form.name.trim()}>Create</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
