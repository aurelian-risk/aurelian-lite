// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Import / export popover: full data-layer swap. Export a bundle (taxonomy +
// data), data-only or taxonomy-only, as JSON or YAML. Import any of them.
import { useState } from "react";
import type { Study } from "../domain/types";
import { useStore } from "../domain/store";
import { exportToFile, type ExportWhat, type Format } from "../domain/persistence";
import { exportDocs } from "../domain/documents";
import { getModelId } from "../domain/embeddings";
import { cryptoAvailable } from "../domain/crypto";
import { ImportDialog } from "./ImportDialog";
import { Icon } from "./ui";

export function DataMenu({ studyScope, label = "Data" }: { studyScope?: Study; label?: string }) {
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [format, setFormat] = useState<Format>("yaml");
  const [encrypt, setEncrypt] = useState(false);
  const [password, setPassword] = useState("");
  const store = useStore();

  const scoped = studyScope ? [studyScope] : undefined;
  const nameHint = studyScope?.name;
  const canEncrypt = cryptoAvailable();

  const doExport = async (what: ExportWhat) => {
    if (encrypt && password.length < 4) { alert("Enter a password (at least 4 characters) to encrypt the export."); return; }
    setOpen(false);
    // A full/data export is a 100% portable session: include the referenced
    // documents (with cached text) and the settings, not just the study data.
    let documents; let settings;
    if (what !== "taxonomy") {
      documents = await exportDocs(studyScope ? [studyScope.id] : undefined);
      settings = { modelId: getModelId(), theme: document.documentElement.classList.contains("light") ? "light" as const : "dark" as const };
    }
    await exportToFile(store.exportState(), what, format, { studies: scoped, nameHint, documents, settings, password: encrypt ? password : undefined });
    if (encrypt) setPassword("");
  };

  return (
    <div style={{ position: "relative" }}>
      <button className="btn sm" onClick={() => setOpen((o) => !o)}>
        <Icon.download /> {label}
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div className="menu-pop">
            <div className="menu-label">Format</div>
            <div className="seg">
              {(["yaml", "json"] as Format[]).map((f) => (
                <button key={f} className={"seg-btn" + (format === f ? " on" : "")} onClick={() => setFormat(f)}>
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="menu-label">Export {studyScope ? "(this study)" : "(everything)"}</div>
            <button className="menu-item" onClick={() => doExport("bundle")}>
              <Icon.download /> Portable session <span className="menu-hint">taxonomy + data + docs + settings</span>
            </button>
            <button className="menu-item" onClick={() => doExport("data")}>
              <Icon.download /> {studyScope ? "This study" : "Studies"} <span className="menu-hint">data only</span>
            </button>
            <button className="menu-item" onClick={() => doExport("taxonomy")}>
              <Icon.schema /> Taxonomy <span className="menu-hint">schema only</span>
            </button>
            {canEncrypt && (
              <>
                <div className="menu-label">Protection</div>
                <div className="seg">
                  <button className={"seg-btn" + (!encrypt ? " on" : "")} onClick={() => setEncrypt(false)}>Plain</button>
                  <button className={"seg-btn" + (encrypt ? " on" : "")} onClick={() => setEncrypt(true)}>Encrypted</button>
                </div>
                {encrypt && (
                  <input className="menu-pw" type="password" autoComplete="new-password" placeholder="Password (AES-256)"
                    value={password} onChange={(e) => setPassword(e.target.value)} onClick={(e) => e.stopPropagation()} />
                )}
              </>
            )}
            <div className="menu-sep" />
            <button className="menu-item" onClick={() => { setOpen(false); setImporting(true); }}>
              <Icon.upload /> Import data… <span className="menu-hint">file or paste</span>
            </button>
          </div>
        </>
      )}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}
