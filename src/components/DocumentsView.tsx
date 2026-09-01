// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Document references. By design we hold only references (name + metadata) —
// content is NOT ingested into the browser. Files can be opened transiently in
// a viewer, but nothing is stored. (LLM extraction will read content on demand.)
import { useEffect, useState } from "react";
import { Sentence } from "./Sentence";
import { t as tr, tn } from "../domain/i18n";
import { useActiveStudy, useStore } from "../domain/store";
import { addRef, deleteDoc, getDocFile, listDocs, pickFileForRef, type RefDoc } from "../domain/documents";
import { ExtractionDialog } from "./ExtractionDialog";
import { CatalogImport } from "./CatalogImport";
import { Icon } from "./ui";

const fmtSize = (n: number) => (!n ? "—" : n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const fmtDate = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function DocumentsView() {
  const study = useActiveStudy();
  const { createStudy, setActiveStudy } = useStore();
  const tax = useStore((s) => s.taxonomy);
  const [docs, setDocs] = useState<RefDoc[]>([]);
  const [extract, setExtract] = useState<{ name: string; docId?: string } | null>(null);
  const [catImport, setCatImport] = useState(false);

  const refresh = () => { if (study) listDocs(study.id).then(setDocs); };
  useEffect(() => { setDocs([]); refresh(); }, [study?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Import works even without a study: the first document bootstraps a study to
  // hold the corpus (documents are attached to a study).
  /** Hand a stored source file back to the reader.
   *
   *  Documents live in the app's database, not on disk - which is what lets a study move
   *  between machines without a path to fix up. The price is that a file which travelled
   *  in would be trapped there, so this is the way out: the browser's own save dialog,
   *  which works in every browser and on file://. */
  const saveFile = async (d: RefDoc) => {
    const blob = await getDocFile(d.id);
    if (!blob) return;
    // Where it goes is the reader's to decide, so ASK where it goes. A plain `<a download>`
    // obeys a browser setting that is off by default in Chrome - the file then lands in
    // the downloads folder without a word, which is not the same as choosing.
    //
    // The picker exists on file:// too (measured); Firefox does not have it at all, so the
    // download stays as the fallback rather than as the only way.
    const picker = (window as unknown as { showSaveFilePicker?: (o: object) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
    if (picker) {
      try {
        const handle = await picker({
          suggestedName: d.name,
          types: d.mime ? [{ description: d.mime, accept: { [d.mime]: [`.${d.name.split(".").pop() ?? "bin"}`] } }] : undefined,
        });
        const w = await handle.createWritable();
        await w.write(blob);
        await w.close();
        return;
      } catch (e) {
        // The reader closing the dialog is an answer, not a failure - do not then save the
        // file anyway behind their back.
        if ((e as { name?: string })?.name === "AbortError") return;
        // Anything else (no permission, an unsupported type): fall through to the download.
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = d.name;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const addReference = async () => {
    const m = await pickFileForRef();
    if (!m) return;
    let sid = study?.id;
    if (!sid) { sid = createStudy(m.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Document corpus"); setActiveStudy(sid); }
    await addRef(sid, m.name, m.mime, m.size, m.text, "", m.file);
    listDocs(sid).then(setDocs);
  };

  if (!study) {
    return (
      <div className="content">
        <div className="page-head"><div style={{ flex: 1 }}><div className="eyebrow">{tr('ui.documents.reference-library', 'Reference library')}</div><h1 className="grad-text">{tr('ui.documents.documents', 'Documents')}</h1></div></div>
        <div className="empty">
          <h3>{tr('ui.documents.import-a-document-corpus', 'Import a document corpus')}</h3>
          {tr('ui.documents.add-word-pdf-or', 'Add Word, PDF or text files (text is extracted locally, fully offline). The first document starts a new study to hold the corpus.')}
          <div style={{ marginTop: 14 }}><button className="btn primary" onClick={addReference}><Icon.plus /> {tr('ui.documents.add-document', 'Add document…')}</button></div>
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
          <h1 className="grad-text">{tr('ui.documents.documents', 'Documents')}</h1>
          <div className="meta" style={{ color: "var(--fg-subtle)" }}>{tn("ui.documents.references-for-study", docs.length, "{0} reference for this study · Word / PDF / text - extracted \u0026 cached locally for extraction", "{0} references for this study · Word / PDF / text - extracted \u0026 cached locally for extraction")}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn primary" onClick={addReference}><Icon.plus /> {tr('ui.documents.add-reference', 'Add reference')}</button>
          <button className="btn" onClick={() => setCatImport(true)} title={tr('ui.documents.import-a-requirement-measure', 'Import a requirement/measure framework from a table (CSV/TSV/JSON)')}><Icon.upload /> {tr('ui.documents.import-framework', 'Import framework')}</button>
          <button className="btn" onClick={() => setExtract({ name: "" })}><Icon.spark /> {tr('ui.documents.extract', 'Extract')}</button>
        </div>
      </div>

      <div className="guide">
        <Sentence k="ui.documents.guide" parts={[
          <strong>{tr("ui.documents.text-files", "text files")}</strong>,
          <em>{tr('ui.documents.extract', 'Extract')}</em>,
          <em>{tr('ui.documents.extract', 'Extract')}</em>,
        ]} en={"References keep each source document's name, type and size. For {0} the plain text is also cached locally (offline, in your browser) so {1} can read it instantly — nothing is uploaded. Click {2} on a reference to propose entities for the active study."} />
      </div>

      {docs.length === 0 ? (
        <div className="empty"><h3>{tr('ui.documents.no-references-yet', 'No references yet')}</h3>{tr('ui.documents.add-a-reference-to', 'Add a reference to a source document to start your library.')}</div>
      ) : (
        <div className="panel">
          <div className="panel-head"><h3>{tr('ui.documents.references', 'References')}</h3><span className="badge">{docs.length}</span></div>
          <div className="panel-body">
            <table className="tbl">
              <colgroup><col /><col style={{ width: 140 }} /><col style={{ width: 90 }} /><col /><col style={{ width: 80 }} /></colgroup>
              <thead><tr><th>{tr('ui.documents.name', 'Name')}</th><th>{tr('ui.documents.type', 'Type')}</th><th>{tr('ui.documents.size', 'Size')}</th><th>{tr('ui.documents.added', 'Added')}</th><th /></tr></thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td><div className="name">{d.name}</div>{d.note && <div className="desc">{d.note}</div>}</td>
                    <td><span className="badge">{d.mime || "—"}</span></td>
                    <td><span className="mono" style={{ fontSize: 12 }}>{fmtSize(d.size)}</span></td>
                    <td><span className="desc">{fmtDate(d.addedAt)}</span></td>
                    <td>
                      <div className="row-actions">
                        <button className="btn ghost sm" onClick={() => setExtract({ name: d.name, docId: d.id })} title={d.hasText ? "Extract from cached text" : "Extract (open file)"} aria-label={tr('ui.documents.extract', 'Extract')}><Icon.spark /></button>
                        {d.hasFile && (
                          <button className="btn ghost sm" onClick={() => saveFile(d)}
                            title={tr("ui.documents.save-file", "Save the source file")}
                            aria-label={tr("ui.documents.save-file", "Save the source file")}><Icon.download /></button>
                        )}
                        <button className="btn ghost sm danger" onClick={() => remove(d.id)} aria-label={tr('ui.documents.remove', 'Remove')}><Icon.trash /></button>
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
      {catImport && <CatalogImport tax={tax} study={study} onClose={() => { setCatImport(false); refresh(); }} />}
    </div>
  );
}
