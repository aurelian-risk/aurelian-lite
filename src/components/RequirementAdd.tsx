// The Requirements table's add control: the "+ Requirement" button opens a dialog
// where you either pick suggestions from a bundled framework catalog (NIS2, NIST
// CSF) - searchable, multi-select, already-added items marked - or import your own
// catalog, or "Create custom…" to define one by hand (the normal entity form).
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { EntityTypeDef, Study, Taxonomy } from "../domain/types";
import { useStore } from "../domain/store";
import { BUNDLED_FRAMEWORKS, requirementValues, parseCatalog } from "../domain/frameworks";
import { EntityModal } from "./EntityModal";
import { Icon } from "./ui";

export function RequirementAdd({ tax, study, reqType }: { tax: Taxonomy; study: Study; reqType: EntityTypeDef }) {
  const addEntity = useStore((s) => s.addEntity);
  const [pick, setPick] = useState(false);
  const [custom, setCustom] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const reqs = study.entities.filter((e) => e.type === reqType.key);
  const exists = (fw: string, ref: string) => reqs.some((r) => String(r.values.framework ?? "") === fw && String(r.values.ref_id ?? "") === ref);
  const key = (fw: string, ref: string) => fw + "::" + ref;
  const toggle = (k: string) => setSel((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const match = (s: string) => q.trim() === "" || s.toLowerCase().includes(q.trim().toLowerCase());

  const addSelected = () => {
    for (const fw of BUNDLED_FRAMEWORKS) for (const it of fw.items)
      if (sel.has(key(fw.name, it.ref_id)) && !exists(fw.name, it.ref_id)) addEntity(reqType.key, requirementValues(fw, it));
    setSel(new Set()); setPick(false);
  };
  const importFile = async (file: File) => {
    try {
      const { name, items } = parseCatalog(await file.text(), file.name.replace(/\.[^.]+$/, ""));
      let n = 0;
      for (const it of items) if (!exists(name, it.ref_id)) {
        addEntity(reqType.key, { name: it.title, ref_id: it.ref_id, framework: name, category: it.category ?? "", description: it.description ?? "" });
        n++;
      }
      setPick(false);
      alert(n ? `Imported ${n} requirements from "${name}".` : "Nothing new to import.");
    } catch (e) { alert("Could not import catalog: " + (e instanceof Error ? e.message : String(e))); }
  };

  return (
    <>
      <button className="btn sm primary" onClick={() => { setSel(new Set()); setQ(""); setPick(true); }}>
        <Icon.plus /> {reqType.label}
      </button>

      {pick && createPortal(
        <div className="overlay" onMouseDown={() => setPick(false)}>
          <div className="modal-lg" style={{ maxWidth: 640 }} onMouseDown={(e) => e.stopPropagation()}>
            <header className="modal-lg-head">
              <div style={{ flex: 1 }}>
                <div className="dialog-sub" style={{ margin: 0 }}>Add requirement</div>
                <h2 style={{ fontSize: 19 }}>Choose from a framework catalog</h2>
              </div>
              <button className="btn ghost sm" onClick={() => setPick(false)} aria-label="Close"><Icon.close /></button>
            </header>
            <div className="modal-lg-body">
              <input placeholder="Search requirements…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} />
              {BUNDLED_FRAMEWORKS.map((fw) => {
                const items = fw.items.filter((it) => match(`${it.ref_id} ${it.title} ${it.category ?? ""} ${fw.name}`));
                if (!items.length) return null;
                return (
                  <div className="panel" style={{ marginBottom: 12 }} key={fw.key}>
                    <div className="panel-head"><h3>{fw.name}</h3><span className="badge">{items.length}</span></div>
                    <div className="panel-body" style={{ padding: "4px 12px 10px" }}>
                      {items.map((it) => {
                        const k = key(fw.name, it.ref_id); const already = exists(fw.name, it.ref_id);
                        return (
                          <label key={it.ref_id} className="ex-cand" style={already ? { opacity: 0.55 } : undefined}>
                            <input type="checkbox" style={{ width: "auto", marginTop: 3 }} checked={already || sel.has(k)} disabled={already} onChange={() => toggle(k)} />
                            <span style={{ flex: 1 }}>
                              <span className="ex-cand-name">{it.ref_id} · {it.title}</span>
                              {it.category && <span className="ex-cand-snip">{it.category}</span>}
                            </span>
                            {already && <span className="badge">added</span>}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <footer className="modal-lg-foot">
              <button className="btn ghost" onClick={() => { setPick(false); setCustom(true); }}><Icon.plus /> Create custom…</button>
              <button className="btn ghost" onClick={() => fileRef.current?.click()}><Icon.upload /> Import…</button>
              <span style={{ flex: 1 }} />
              <button className="btn primary" disabled={sel.size === 0} onClick={addSelected}>Add {sel.size ? sel.size + " " : ""}selected</button>
            </footer>
            <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />
          </div>
        </div>,
        document.body,
      )}

      {custom && <EntityModal type={reqType} tax={tax} study={study} record={null} onClose={() => setCustom(false)} />}
    </>
  );
}
