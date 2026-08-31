// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// The "+ Add" control on a catalog-backed table (Requirements in Compliance,
// Security Measures in Treatment). Pick from bundled catalogs — the curated measure
// library and the free frameworks (NIS2 / NIST CSF / 800-53) — or "Create custom…".
// FILE / TABLE import lives in the Documents system (semi-deterministic), not here.
import { useState } from "react";
import { Sentence } from "./Sentence";
import { t as tr } from "../domain/i18n";
import { typeLabel } from "../domain/taxonomy";
import { createPortal } from "react-dom";
import type { FieldValue, Study, Taxonomy } from "../domain/types";
import type { CatalogTarget } from "../domain/catalog";
import { useStore } from "../domain/store";
import { EntityModal } from "./EntityModal";
import { Icon, Overlay } from "./ui";

/** `preset` is merged into every record created here, and `onAdded` receives the new ids.
 *  Together they are what lets the picker be opened from somewhere that already knows
 *  where the result belongs - a step of a kill chain, say - so a control is chosen from
 *  the catalogue and put to work in one move instead of three. */
export function CatalogAdd({ tax, study, target, preset, onAdded, open, onClose }:
  { tax: Taxonomy; study: Study; target: CatalogTarget;
    preset?: Record<string, FieldValue>; onAdded?: (ids: string[]) => void;
    /** Controlled: when given, the component renders no trigger of its own and is opened
     *  from wherever the user actually asked for it - an entry in a list, say. */
    open?: boolean; onClose?: () => void }) {
  const addEntity = useStore((s) => s.addEntity);
  const controlled = open !== undefined;
  const [pickState, setPickState] = useState(false);
  const pick = controlled ? open : pickState;
  const setPick = (v: boolean) => { if (controlled) { if (!v) onClose?.(); } else setPickState(v); };
  const [custom, setCustom] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");

  const existing = study.entities.filter((e) => e.type === target.type.key);
  const key = (fw: string, ref: string, i: number) => `${fw}::${ref || "#" + i}`;
  const toggle = (k: string) => setSel((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const match = (s: string) => q.trim() === "" || s.toLowerCase().includes(q.trim().toLowerCase());

  const addSelected = () => {
    const made: string[] = [];
    for (const fw of target.bundled) fw.items.forEach((it, i) => {
      if (sel.has(key(fw.name, it.ref_id, i)) && !target.exists(existing, fw, it)) {
        made.push(addEntity(target.type.key, { ...target.toValues(fw, it), ...preset }));
      }
    });
    setSel(new Set()); setPick(false);
    if (made.length) onAdded?.(made);
  };

  return (
    <>
      {controlled ? null : (
        <button className="btn sm primary" onClick={() => { setSel(new Set()); setQ(""); setPick(true); }}>
          <Icon.plus /> {typeLabel(target.type)}
        </button>
      )}

      {pick && createPortal(
        <Overlay onClose={() => setPick(false)}>
          <div className="modal-lg" style={{ maxWidth: 640 }} onMouseDown={(e) => e.stopPropagation()}>
            <header className="modal-lg-head">
              <div style={{ flex: 1 }}>
                <div className="dialog-sub" style={{ margin: 0 }}>Add {target.kind}</div>
                <h2 style={{ fontSize: 19 }}>{tr('ui.catalogadd.choose-from-a-catalog', 'Choose from a catalog')}</h2>
              </div>
              <button className="btn ghost sm" onClick={() => setPick(false)} aria-label={tr('ui.catalogadd.close', 'Close')}><Icon.close /></button>
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
              <button className="btn ghost" onClick={() => { setPick(false); setCustom(true); }}><Icon.plus /> {tr('ui.catalogadd.create-custom', 'Create custom…')}</button>
              <span className="hint" style={{ flex: 1, alignSelf: "center" }}><Sentence k="ui.catalogadd.import-elsewhere" parts={[<b>{tr('ui.catalogadd.documents', 'Documents')}</b>]} en={"Import a framework file in {0}."} /></span>
              <button className="btn primary" disabled={sel.size === 0} onClick={addSelected}>Add {sel.size ? sel.size + " " : ""}selected</button>
            </footer>
          </div>
        </Overlay>,
        document.body,
      )}

      {custom && <EntityModal type={target.type} tax={tax} study={study} record={null} initialValues={preset}
        onClose={() => setCustom(false)} />}
    </>
  );
}
