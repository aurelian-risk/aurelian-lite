// The "+ Add" control on a catalog-backed table (Requirements in Compliance,
// Security Measures in Treatment). Pick from bundled catalogs — the curated measure
// library and the free frameworks (NIS2 / NIST CSF / 800-53) — or "Create custom…".
// FILE / TABLE import lives in the Documents system (semi-deterministic), not here.
import { useState } from "react";
import { createPortal } from "react-dom";
import type { Study, Taxonomy } from "../domain/types";
import type { CatalogTarget } from "../domain/catalog";
import { useStore } from "../domain/store";
import { EntityModal } from "./EntityModal";
import { Icon } from "./ui";

export function CatalogAdd({ tax, study, target }: { tax: Taxonomy; study: Study; target: CatalogTarget }) {
  const addEntity = useStore((s) => s.addEntity);
  const [pick, setPick] = useState(false);
  const [custom, setCustom] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");

  const existing = study.entities.filter((e) => e.type === target.type.key);
  const key = (fw: string, ref: string, i: number) => `${fw}::${ref || "#" + i}`;
  const toggle = (k: string) => setSel((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const match = (s: string) => q.trim() === "" || s.toLowerCase().includes(q.trim().toLowerCase());

  const addSelected = () => {
    for (const fw of target.bundled) fw.items.forEach((it, i) => {
      if (sel.has(key(fw.name, it.ref_id, i)) && !target.exists(existing, fw, it)) addEntity(target.type.key, target.toValues(fw, it));
    });
    setSel(new Set()); setPick(false);
  };

  return (
    <>
      <button className="btn sm primary" onClick={() => { setSel(new Set()); setQ(""); setPick(true); }}>
        <Icon.plus /> {target.type.label}
      </button>

      {pick && createPortal(
        <div className="overlay" onMouseDown={() => setPick(false)}>
          <div className="modal-lg" style={{ maxWidth: 640 }} onMouseDown={(e) => e.stopPropagation()}>
            <header className="modal-lg-head">
              <div style={{ flex: 1 }}>
                <div className="dialog-sub" style={{ margin: 0 }}>Add {target.kind}</div>
                <h2 style={{ fontSize: 19 }}>Choose from a catalog</h2>
              </div>
              <button className="btn ghost sm" onClick={() => setPick(false)} aria-label="Close"><Icon.close /></button>
            </header>
            <div className="modal-lg-body">
              <input placeholder={`Search ${target.kind === "measure" ? "measures" : "requirements"}…`} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} />
              {target.bundled.map((fw) => {
                const items = fw.items.map((it, i) => ({ it, i })).filter(({ it }) => match(`${it.ref_id} ${it.title} ${it.category ?? ""} ${fw.name}`));
                if (!items.length) return null;
                return (
                  <div className="panel" style={{ marginBottom: 12 }} key={fw.key}>
                    <div className="panel-head"><h3>{fw.name}</h3><span className="badge">{items.length}</span></div>
                    <div className="panel-body" style={{ padding: "4px 12px 10px" }}>
                      {items.map(({ it, i }) => {
                        const k = key(fw.name, it.ref_id, i); const already = target.exists(existing, fw, it);
                        return (
                          <label key={k} className="ex-cand" style={already ? { opacity: 0.55 } : undefined}>
                            <input type="checkbox" style={{ width: "auto", marginTop: 3 }} checked={already || sel.has(k)} disabled={already} onChange={() => toggle(k)} />
                            <span style={{ flex: 1 }}>
                              <span className="ex-cand-name">{it.ref_id ? `${it.ref_id} · ` : ""}{it.title}</span>
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
              <span className="hint" style={{ flex: 1, alignSelf: "center" }}>Import a framework file in <b>Documents</b>.</span>
              <button className="btn primary" disabled={sel.size === 0} onClick={addSelected}>Add {sel.size ? sel.size + " " : ""}selected</button>
            </footer>
          </div>
        </div>,
        document.body,
      )}

      {custom && <EntityModal type={target.type} tax={tax} study={study} record={null} onClose={() => setCustom(false)} />}
    </>
  );
}
