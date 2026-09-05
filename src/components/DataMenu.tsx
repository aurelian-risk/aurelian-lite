// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// The two ways data leaves and enters: a popover with one entry each.
//
// It used to carry the format, the password and the recipient list as well, while a dialog
// beside it asked several of the same things again - two places to answer one question,
// which is how two answers drift apart. The asking now happens once, in ExportDialog; this
// file measures what there is to export and carries out what was chosen.
import { useState } from "react";
import { t as tr } from "../domain/i18n";
import { knownKeys } from "../domain/keys";
import type { Study } from "../domain/types";
import { useStore } from "../domain/store";
import { exportToFile, exportArchive, downloadBytes } from "../domain/persistence";
import { encryptBytes, encryptBytesToRecipients } from "../domain/crypto";
import { getUserModels } from "../domain/modelRegistry";
import { ExportDialog, type ExportChoice, type ExportFacts } from "./ExportDialog";
import { exportDocMeta, exportDocFull } from "../domain/documents";
import { getModelId } from "../domain/embeddings";
import { gen } from "../domain/gen";
import { ImportDialog } from "./ImportDialog";
import { Icon, useDismissOnEscape } from "./ui";

export function DataMenu({ studyScope, label }: { studyScope?: Study; label?: string }) {
  const [open, setOpen] = useState(false);
  /** Non-null while the export dialog is up: what it found to offer. */
  const [facts, setFacts] = useState<ExportFacts | null>(null);
  useDismissOnEscape(open, () => setOpen(false));
  const [importing, setImporting] = useState(false);
  // Read at the moment of use, not once per render of this menu: the export dialog can add
  // and forget keys while it is open, and this component does not re-render for that. A ring
  // captured up here would resolve a freshly added recipient to nothing.
  const store = useStore();


  /** The settings and public keys a portable export carries.
   *
   *  Keys travel because a seal names a fingerprint and is unverifiable without the key
   *  behind it - a study handed over with unverifiable seals has handed over nothing.
   *  These are PUBLIC keys; the sender's private key never leaves. What else is left out,
   *  and why, is written at PortableSettings. */
  const portable = async () => ({
    settings: {
      modelId: getModelId(),
      genModelId: (await gen())?.getGenModelId(),
      theme: document.documentElement.classList.contains("light") ? "light" as const : "dark" as const,
      endpoint: (await gen())?.getEndpoint?.(),
      userModels: getUserModels(),
    },
    keys: knownKeys().map((k) => ({ kid: k.kid, name: k.name, jwk: k.jwk as unknown, seen: k.seen })),
  });

  /** Measure first, then ask: every option in the dialog states its size, and a size that
   *  is guessed is worse than none. */
  const askExport = async () => {
    setOpen(false);
    const docs = await exportDocFull(studyScope ? [studyScope.id] : undefined);
    let bytes = 0, withFiles = 0;
    for (const d of docs) { if (d.file) { bytes += d.file.size; withFiles++; } if (d.text) bytes += d.text.length; }
    // With exactly one study there is nothing to pick between, so its name is the subject
    // whether or not it is open - that is what the suggested file name is built from.
    const all = store.exportState().studies;
    setFacts({ studyCount: all.length, activeName: studyScope?.name ?? (all.length === 1 ? all[0].name : undefined),
      docCount: docs.length, docBytes: bytes, withFiles });
  };

  const runExport = async (c: ExportChoice) => {
    // The scope is the dialog's answer now, not this component's position: the same button
    // used to mean "this study" or "every study" depending on which screen it sat on.
    const chosen = c.scope === "active" && studyScope ? [studyScope] : undefined;
    const ids = c.scope === "active" && studyScope ? [studyScope.id] : undefined;
    const carried = await portable();
    const keys = c.keys ? carried.keys : undefined;

    if (c.as !== "archive") {
      // A text file names its documents; their bodies travel in an archive instead.
      const documents = c.what === "taxonomy" ? undefined : await exportDocMeta(ids);
      await exportToFile(store.exportState(), c.what, c.as, {
        studies: chosen, filename: c.filename, documents, settings: c.what === "taxonomy" ? undefined : carried.settings, keys,
        password: c.encrypt === "password" ? c.password : undefined,
        recipients: c.encrypt === "keys" ? knownKeys().filter((k) => c.recipients.has(k.kid)).map((k) => ({ kid: k.kid, name: k.name, jwk: k.jwk })) : undefined,
      });
      return;
    }

    const all = await exportDocFull(ids);
    // "Without the files" still carries the references: WHICH documents a study argues
    // from is part of the study. What stays behind is their contents.
    const docs = c.documents ? all : all.map(({ text, file, ...m }) => m);
    const state = store.exportState();
    const bundle = {
      kind: (c.what === "taxonomy" ? "ebios-taxonomy" : "ebios-bundle") as "ebios-bundle" | "ebios-taxonomy",
      version: 2 as const,
      taxonomy: state.taxonomy,
      ...(c.what === "taxonomy" ? {} : { studies: chosen ?? state.studies }),
      ...(c.what === "taxonomy" ? {} : {
        documents: all.map(({ text, file, ...m }) => ({ ...m, hasText: !!text && c.documents, hasFile: !!file && c.documents })),
        settings: carried.settings,
      }),
      ...(keys ? { keys } : {}),
    };
    const { bytes } = await exportArchive(bundle, c.what === "taxonomy" ? [] : docs, c.filename);
    const name = `${c.filename}.zip`;
    // Encrypted on the BYTES: a zip put through the text envelope would be base64, a third
    // larger and held as one string.
    if (c.encrypt === "password") {
      downloadBytes(name.replace(/\.zip$/, ".zip.enc"), await encryptBytes(bytes, c.password), "application/octet-stream");
    } else if (c.encrypt === "keys") {
      const picked = knownKeys().filter((k) => c.recipients.has(k.kid)).map((k) => ({ kid: k.kid, name: k.name, jwk: k.jwk }));
      downloadBytes(name.replace(/\.zip$/, ".zip.enc"), await encryptBytesToRecipients(bytes, picked), "application/octet-stream");
    } else {
      downloadBytes(name, bytes, "application/zip");
    }
  };

  return (
    <div style={{ position: "relative" }}>
      {facts && (
        <ExportDialog facts={facts} onClose={() => setFacts(null)} onExport={runExport} />
      )}
      <button className="btn sm" onClick={() => setOpen((o) => !o)}>
        <Icon.download /> {label}
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div className="menu-pop">
            <button className="menu-item stacked" onClick={askExport}>
              <Icon.download />
              <span className="mi-text">
                {tr("ui.datamenu.export-dots", "Export…")}
                <span className="menu-hint">{tr("ui.datamenu.hint-export", "choose what goes in and who may open it")}</span>
              </span>
            </button>
            <button className="menu-item stacked" onClick={() => { setOpen(false); setImporting(true); }}>
              <Icon.upload />
              <span className="mi-text">
                {tr('ui.datamenu.import-data', 'Import data…')}
                <span className="menu-hint">{tr("ui.datamenu.hint-file-or-paste", "file, archive or paste")}</span>
              </span>
            </button>
          </div>
        </>
      )}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}
