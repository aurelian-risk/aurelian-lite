// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Import / export popover: full data-layer swap. Export a bundle (taxonomy +
// data), data-only or taxonomy-only, as JSON or YAML. Import any of them.
import { useState } from "react";
import { t as tr } from "../domain/i18n";
import { knownKeys } from "../domain/keys";
import type { Study } from "../domain/types";
import { useStore } from "../domain/store";
import { exportToFile, type ExportWhat, type Format } from "../domain/persistence";
import { cryptoAvailable } from "../domain/crypto";
import { exportDocs } from "../domain/documents";
import { getModelId } from "../domain/embeddings";
import { gen } from "../domain/gen";
import { ImportDialog } from "./ImportDialog";
import { Icon, useDismissOnEscape } from "./ui";

export function DataMenu({ studyScope, label }: { studyScope?: Study; label?: string }) {
  const [open, setOpen] = useState(false);
  useDismissOnEscape(open, () => setOpen(false));
  const [importing, setImporting] = useState(false);
  const [format, setFormat] = useState<Format>("yaml");
  // Two ways to protect an export, and they answer different problems. A password has to
  // reach the recipient somehow, and in practice it travels the same way the file does.
  // Addressing the file to a key removes that step - but only for keys already on the
  // ring, which is why the choice is offered rather than assumed.
  const [encrypt, setEncrypt] = useState<"off" | "password" | "keys">("off");
  const [password, setPassword] = useState("");
  const [to, setTo] = useState<Set<string>>(new Set());
  const ring = knownKeys();
  const store = useStore();

  const scoped = studyScope ? [studyScope] : undefined;
  const nameHint = studyScope?.name;
  const canEncrypt = cryptoAvailable();

  const doExport = async (what: ExportWhat) => {
    if (encrypt === "password" && password.length < 4) { alert("Enter a password (at least 4 characters) to encrypt the export."); return; }
    if (encrypt === "keys" && to.size === 0) { alert("Pick at least one recipient - otherwise nobody could open the file."); return; }
    setOpen(false);
    // A full/data export is a 100% portable session: include the referenced
    // documents (with cached text) and the settings, not just the study data.
    let documents; let settings;
    if (what !== "taxonomy") {
      documents = await exportDocs(studyScope ? [studyScope.id] : undefined);
      settings = { modelId: getModelId(), genModelId: (await gen())?.getGenModelId(), theme: document.documentElement.classList.contains("light") ? "light" as const : "dark" as const };
    }
    await exportToFile(store.exportState(), what, format, { studies: scoped, nameHint, documents, settings,
      password: encrypt === "password" ? password : undefined,
      recipients: encrypt === "keys" ? ring.filter((k) => to.has(k.kid)).map((k) => ({ kid: k.kid, name: k.name, jwk: k.jwk })) : undefined });
    if (encrypt === "password") setPassword("");
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
            <div className="menu-label">{tr('ui.datamenu.format', 'Format')}</div>
            <div className="seg">
              {(["yaml", "json"] as Format[]).map((f) => (
                <button key={f} className={"seg-btn" + (format === f ? " on" : "")} onClick={() => setFormat(f)}>
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
            {canEncrypt && (
              <>
                <div className="menu-label">{tr('ui.datamenu.protection', 'Protection')}</div>
                <div className="seg">
                  <button className={"seg-btn" + (encrypt === "off" ? " on" : "")} onClick={() => setEncrypt("off")}>{tr('ui.datamenu.none', 'None')}</button>
                  <button className={"seg-btn" + (encrypt === "password" ? " on" : "")} onClick={() => setEncrypt("password")}>{tr('ui.datamenu.password', 'Password')}</button>
                  <button className={"seg-btn" + (encrypt === "keys" ? " on" : "")} disabled={!ring.length}
                    title={ring.length ? tr("ui.datamenu.encrypt-to-named-keys", "Encrypt to the keys you have named") : tr("ui.datamenu.no-keys-named", "No keys named yet - name one in the Timeline's seal panel first")}
                    onClick={() => setEncrypt("keys")}>{tr('ui.datamenu.key', 'Key')}</button>
                </div>
                {encrypt === "password" && (
                  <input className="menu-pw" type="password" autoComplete="new-password" placeholder={tr('ui.datamenu.password-aes', 'Password (AES-256)')}
                    value={password} onChange={(e) => setPassword(e.target.value)} onClick={(e) => e.stopPropagation()} />
                )}
                {encrypt === "keys" && (
                  <div className="menu-to" onClick={(e) => e.stopPropagation()}>
                    {ring.map((k) => (
                      <label className="menu-to-row" key={k.kid}>
                        <input type="checkbox" checked={to.has(k.kid)} style={{ width: "auto" }}
                          onChange={() => setTo((s2) => { const n = new Set(s2); n.has(k.kid) ? n.delete(k.kid) : n.add(k.kid); return n; })} />
                        <span>{k.name}</span><span className="mono menu-to-kid">{k.kid}</span>
                      </label>
                    ))}
                    <span className="menu-hint">{tr('ui.datamenu.each-of-them-opens', 'Each of them opens it with their own key. The list of recipients is readable in the file - that is what lets someone see whether it is for them.')}</span>
                  </div>
                )}
              </>
            )}
            <div className="menu-label">{tr("ui.datamenu.export", "Export")} {studyScope ? tr("ui.datamenu.this-study-paren", "(this study)") : tr("ui.datamenu.everything-paren", "(everything)")}</div>
            <button className="menu-item" onClick={() => doExport("bundle")}>
              <Icon.download /> {tr('ui.datamenu.portable-session', 'Portable session')} <span className="menu-hint">{tr("ui.datamenu.hint-portable", "taxonomy + data + docs + settings")}</span>
            </button>
            <button className="menu-item" onClick={() => doExport("data")}>
              <Icon.download /> {studyScope ? tr("ui.datamenu.this-study", "This study") : tr("ui.datamenu.studies", "Studies")} <span className="menu-hint">{tr("ui.datamenu.hint-data-only", "data only")}</span>
            </button>
            <button className="menu-item" onClick={() => doExport("taxonomy")}>
              <Icon.schema /> {tr('ui.datamenu.taxonomy', 'Taxonomy')} <span className="menu-hint">{tr("ui.datamenu.hint-schema-only", "schema only")}</span>
            </button>
            <div className="menu-sep" />
            <button className="menu-item" onClick={() => { setOpen(false); setImporting(true); }}>
              <Icon.upload /> {tr('ui.datamenu.import-data', 'Import data…')} <span className="menu-hint">{tr("ui.datamenu.hint-file-or-paste", "file or paste")}</span>
            </button>
          </div>
        </>
      )}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}
