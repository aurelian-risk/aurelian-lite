// Document references. By design we hold only references (name + metadata) —
// content is NOT ingested into the browser. Files can be opened transiently in
// a viewer, but nothing is stored. (LLM extraction will read content on demand.)
import { useEffect, useState } from "react";
import { useActiveStudy, useStore } from "../domain/store";
import { addRef, deleteDoc, listDocs, pickFileForRef, type RefDoc } from "../domain/documents";
import { ExtractionDialog } from "./ExtractionDialog";
import { Icon } from "./ui";

const fmtSize = (n: number) => (!n ? "—" : n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const fmtDate = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function DocumentsView() {
  const study = useActiveStudy();
  const { createStudy, setActiveStudy } = useStore();
  const [docs, setDocs] = useState<RefDoc[]>([]);
  const [extract, setExtract] = useState<{ name: string; docId?: string } | null>(null);

  const refresh = () => { if (study) listDocs(study.id).then(setDocs); };
  useEffect(() => { setDocs([]); refresh(); }, [study?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Import works even without a study: the first document bootstraps a study to
  // hold the corpus (documents are attached to a study).
  const addReference = async () => {
    const m = await pickFileForRef();
    if (!m) return;
    let sid = study?.id;
    if (!sid) { sid = createStudy(m.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Document corpus"); setActiveStudy(sid); }
    await addRef(sid, m.name, m.mime, m.size, m.text);
    listDocs(sid).then(setDocs);
  };

  if (!study) {
    return (
      <div className="content">
        <div className="page-head"><div style={{ flex: 1 }}><div className="eyebrow">Reference library</div><h1 className="grad-text">Documents</h1></div></div>
        <div className="empty">
          <h3>Import a document corpus</h3>
          Add Word, PDF or text files (text is extracted locally, fully offline). The first document starts a new study to hold the corpus.
          <div style={{ marginTop: 14 }}><button className="btn primary" onClick={addReference}><Icon.plus /> Add document…</button></div>
        </div>
      </div>
    );
  }
  const remove = async (id: string) => {
    if (!confirm("Remove this reference?")) return;
    await deleteDoc(id);
    refresh();
  };

  return (
    <div className="content">
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <div className="eyebrow">Reference library · {study.name}</div>
          <h1 className="grad-text">Documents</h1>
          <div className="meta" style={{ color: "var(--fg-subtle)" }}>{docs.length} reference{docs.length === 1 ? "" : "s"} for this study · Word / PDF / text - extracted &amp; cached locally for extraction</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => setExtract({ name: "" })}><Icon.spark /> Extract</button>
          <button className="btn primary" onClick={addReference}><Icon.plus /> Add reference</button>
        </div>
      </div>

      <div className="guide">
        References keep each source document's name, type and size. For <strong>text files</strong> the plain
        text is also cached locally (offline, in your browser) so <em>Extract</em> can read it instantly —
        nothing is uploaded. Click <em>Extract</em> on a reference to propose entities for the active study.
      </div>

      {docs.length === 0 ? (
        <div className="empty"><h3>No references yet</h3>Add a reference to a source document to start your library.</div>
      ) : (
        <div className="panel">
          <div className="panel-head"><h3>References</h3><span className="badge">{docs.length}</span></div>
          <div className="panel-body">
            <table className="tbl">
              <colgroup><col /><col style={{ width: 140 }} /><col style={{ width: 90 }} /><col /><col style={{ width: 80 }} /></colgroup>
              <thead><tr><th>Name</th><th>Type</th><th>Size</th><th>Added</th><th /></tr></thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td><div className="name">{d.name}</div>{d.note && <div className="desc">{d.note}</div>}</td>
                    <td><span className="badge">{d.mime || "—"}</span></td>
                    <td><span className="mono" style={{ fontSize: 12 }}>{fmtSize(d.size)}</span></td>
                    <td><span className="desc">{fmtDate(d.addedAt)}</span></td>
                    <td>
                      <div className="row-actions">
                        <button className="btn ghost sm" onClick={() => setExtract({ name: d.name, docId: d.id })} title={d.hasText ? "Extract from cached text" : "Extract (open file)"} aria-label="Extract"><Icon.spark /></button>
                        <button className="btn ghost sm danger" onClick={() => remove(d.id)} aria-label="Remove"><Icon.trash /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {extract && <ExtractionDialog initialName={extract.name} docId={extract.docId} onClose={() => setExtract(null)} />}
    </div>
  );
}
