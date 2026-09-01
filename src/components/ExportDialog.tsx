// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// One place where an export is decided.
//
// It used to be two: a drop-down that asked for format, password and recipients, and a
// dialog beside it that asked several of the same things again — and two entries,
// "Portable session" and "Archive", that differed only in whether the document bodies came
// along. Asking twice is how the two answers drift apart.
//
// The shape of the decision is three questions, in the order somebody actually has them:
// what goes in, how it is written, and who may open it. Every option states its SIZE,
// because that is what is being decided: a corpus is the difference between a 9 kB file
// and a 60 MB one, and hiding that asks the reader to choose blind.
import { useEffect, useState } from "react";
import { t as tr, tn } from "../domain/i18n";
import { Overlay } from "./ui";
import { knownKeys } from "../domain/keys";
import { slug, type Format } from "../domain/persistence";

export interface ExportChoice {
  /** Just the study that is open, or every study on this installation. Asked here rather
   *  than inferred from which screen the dialog was opened on: the same button gave two
   *  different results depending on where it was pressed, and nothing said so. */
  scope: "active" | "all";
  /** The file name, without extension. Suggested from the subject and the date; the
   *  reader may say otherwise. */
  filename: string;
  /** The studies WITH the model they are built on, or the model alone.
   *
   *  Studies without the model used to be offered as well, and it is not offered any more:
   *  it saves 3 kB compressed - the model is constant, so on a real study it is a couple of
   *  per cent, and in a deterministic export an unchanged model produces identical lines
   *  and no diff at all. What it costs is measured and much worse: a record built on a
   *  model the recipient does not have is imported and then never drawn, because every
   *  register is derived from the taxonomy. Neither lost nor visible.
   *
   *  Files of that shape are still READ - older exports and other tools produce them - and
   *  the import says what will not show. It is the writing of new ones that stopped. */
  what: "bundle" | "taxonomy";
  /** A text file for the workflow and for git, or an archive that carries the documents. */
  as: Format | "archive";
  documents: boolean;
  keys: boolean;
  encrypt: "none" | "password" | "keys";
  password: string;
  recipients: Set<string>;
}

/** What there is to export, measured before the dialog opens so the options can say it. */
export interface ExportFacts {
  /** Every study on this installation. */
  studyCount: number;
  /** The name of the study that is open, when one is. */
  activeName?: string;
  docCount: number;
  docBytes: number;
  withFiles: number;
}

const size = (n: number): string =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} kB` : `${n} B`;

export function ExportDialog({ facts, onClose, onExport }: {
  facts: ExportFacts;
  onClose: () => void;
  onExport: (choice: ExportChoice) => Promise<void> | void;
}) {
  const ring = knownKeys();
  const [what, setWhat] = useState<ExportChoice["what"]>("bundle");
  const [scope, setScope] = useState<ExportChoice["scope"]>(
    facts.studyCount <= 1 || !facts.activeName ? "all" : "active");
  // Two questions, not one: FILE-OR-ARCHIVE is the real decision, JSON-or-YAML is the same
  // file written two ways. Offering all three side by side made a nine-way choice out of a
  // six-way one and hid which of them matters.
  const [packed, setPacked] = useState(false);
  const [textFormat, setTextFormat] = useState<Format>("json");
  const as: ExportChoice["as"] = packed ? "archive" : textFormat;
  const [documents, setDocuments] = useState(true);
  const [keys, setKeys] = useState(ring.length > 0);
  const [encrypt, setEncrypt] = useState<ExportChoice["encrypt"]>("none");
  const [password, setPassword] = useState("");
  const [to, setTo] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  /** What the file will be called if nobody says otherwise: the subject and the day.
   *  Recomputed as the choices change, but only while the reader has not typed their own -
   *  a suggestion that overwrites what somebody entered is not a suggestion. */
  const suggested = (): string => {
    const subject = what === "taxonomy" ? tr("ui.exportdlg.fn-model", "data-model")
      : (scope === "active" || facts.studyCount === 1) && facts.activeName ? facts.activeName
      : tn("ui.exportdlg.fn-studies", facts.studyCount, "{0}-study", "{0}-studies");
    return `${slug(subject)}-${new Date().toISOString().slice(0, 10)}`;
  };
  const [filename, setFilename] = useState(suggested);
  const [renamed, setRenamed] = useState(false);
  useEffect(() => { if (!renamed) setFilename(suggested()); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [what, scope, renamed]);

  const canCarryFiles = packed && facts.withFiles > 0 && what !== "taxonomy";
  // A data model has no documents to pack, so an archive of it would be a zip holding one
  // json file. The choice is taken away rather than offered and then explained.
  const canPack = what !== "taxonomy";
  useEffect(() => { if (!canPack && packed) setPacked(false); }, [canPack, packed]);
  // A schema has no documents and no keys to carry; saying so by disabling is clearer than
  // letting somebody tick a box that then does nothing.
  useEffect(() => { if (!ring.length && encrypt === "keys") setEncrypt("none"); }, [ring.length, encrypt]);

  const blocked = (encrypt === "password" && password.length < 4) || (encrypt === "keys" && to.size === 0);

  const go = async () => {
    if (blocked || busy) return;
    setBusy(true);
    try {
      await onExport({ what, scope, filename: (filename.trim() || suggested()), as,
        documents: canCarryFiles && documents, keys: keys && what !== "taxonomy",
        encrypt, password, recipients: to });
      onClose();
    } finally { setBusy(false); }
  };

  const seg = <T extends string>(value: T, set: (v: T) => void, options: { v: T; label: string; off?: boolean; title?: string }[]) => (
    <div className="seg-wide">
      {options.map((o) => (
        <button key={o.v} className={"seg-btn" + (value === o.v ? " on" : "")} disabled={o.off} title={o.title}
          onClick={() => set(o.v)}>{o.label}</button>
      ))}
    </div>
  );

  const check = (on: boolean, set: (v: boolean) => void, title: string, note: string, off = false) => (
    <label className={"field-row check-row" + (off ? " off" : "")}>
      <input type="checkbox" checked={on && !off} disabled={off} onChange={(e) => set(e.target.checked)} />
      <span style={{ minWidth: 0 }}>
        <span className="ck-t">{title}</span>
        <span className="ck-s hint">{note}</span>
      </span>
    </label>
  );

  /** One sentence saying what the button will produce. Written from the choices rather than
   *  from a fixed list, so it cannot fall out of step with them. */
  const outcome = (): string => {
    if (what === "taxonomy") return tr("ui.exportdlg.out-taxonomy", "The data model on its own, without any study.");
    // What is being exported depends on the FIRST row as well as on the scope: read only
    // the scope and "Everything" came out as "This study", which is half the answer.
    const studies = (scope === "active" || facts.studyCount === 1) && facts.activeName
      ? tr("ui.exportdlg.out-one", "this study")
      : tn("ui.exportdlg.out-n", facts.studyCount, "{0} study", "{0} studies");
    const subject = tr("ui.exportdlg.out-with-model", "The data model and {0}").replace("{0}", studies);
    if (!packed) {
      return tr("ui.exportdlg.out-json", "{0} as one text file. The documents are named in it; their contents stay here.")
        .replace("{0}", subject);
    }
    return documents && canCarryFiles
      ? tr("ui.exportdlg.out-archive-with", "{0} plus {1} — one archive that opens anywhere.")
          .replace("{0}", subject)
          .replace("{1}", `${tn("ui.exportdlg.n-files", facts.withFiles, "{0} document file", "{0} document files")} (${size(facts.docBytes)})`)
      : tr("ui.exportdlg.out-archive-without", "{0} as an archive, without the document files.").replace("{0}", subject);
  };

  return (
    <Overlay onClose={onClose}>
      <div className="modal-lg scope-dlg export-dlg" style={{ maxWidth: 580 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-lg-head">
          <h3>{tr("ui.exportdlg.title", "Export")}</h3>
        </div>
        <div className="modal-lg-body">
          {/* Only where there is something to choose. With one study on the installation
              the two buttons produce the same file, and a choice between two identical
              outcomes is not a choice - it is a question the reader has to rule out. */}
          {what !== "taxonomy" && facts.studyCount > 1 && (
            <>
              <p className="scope-h">{tr("ui.exportdlg.scope", "Which studies")}</p>
              {seg(scope, setScope, [
                { v: "active", label: facts.activeName ?? tr("ui.exportdlg.s-active", "The open study"), off: !facts.activeName,
                  title: facts.activeName ? undefined : tr("ui.exportdlg.s-none-open", "No study is open.") },
                { v: "all", label: tn("ui.exportdlg.s-all", facts.studyCount, "All {0} study", "All {0} studies") },
              ])}
            </>
          )}

          <p className="scope-h">{tr("ui.exportdlg.what", "What")}</p>
          {seg(what, setWhat, [
            { v: "bundle", label: scope === "active" || facts.studyCount === 1
                ? tr("ui.exportdlg.w-study-and-model", "Study and data model")
                : tr("ui.exportdlg.w-studies-and-model", "Studies and data model") },
            { v: "taxonomy", label: tr("ui.exportdlg.w-taxonomy", "Data model only") },
          ])}
          <p className="hint seg-note">
            {what === "bundle"
              ? tr("ui.exportdlg.w-all-note", "The studies, their change logs, the model they are built on and this installation's settings — a session that continues elsewhere. The model travels because records built on one the recipient does not have would be imported and then never shown.")
              : tr("ui.exportdlg.w-taxonomy-note", "The data model on its own: types, fields and scales, with no study behind them.")}
          </p>

          <p className="scope-h">{tr("ui.exportdlg.as", "As")}</p>
          {seg(packed ? "archive" : "file", (v: string) => setPacked(v === "archive"), [
            { v: "file", label: tr("ui.exportdlg.a-file", "Single file") },
            { v: "archive", label: tr("ui.exportdlg.a-archive", "Archive"), off: !canPack,
              title: canPack ? undefined : tr("ui.exportdlg.a-archive-off", "A data model has no documents to pack.") },
          ])}
          <p className="hint seg-note">
            {packed
              ? tr("ui.exportdlg.as-archive-note", "A zip: the study as readable JSON, the document files beside it.")
              : tr("ui.exportdlg.as-text-note", "One text file — small, readable, and diffable in version control.")}
          </p>
          {!packed && (
            <div className="seg-wide seg-minor">
              {(["json", "yaml"] as Format[]).map((f) => (
                <button key={f} className={"seg-btn" + (textFormat === f ? " on" : "")}
                  onClick={() => setTextFormat(f)}>{f.toUpperCase()}</button>
              ))}
            </div>
          )}

          {packed && check(documents, setDocuments,
            tr("ui.exportdlg.documents", "Include the document files"),
            facts.withFiles === 0
              ? tr("ui.exportdlg.no-files", "No reference here has its source file — only documents added since the app began keeping them can travel.")
              : `${tn("ui.exportdlg.n-files", facts.withFiles, "{0} file", "{0} files")} · ${size(facts.docBytes)}`,
            !canCarryFiles)}

          {check(keys, setKeys,
            tr("ui.exportdlg.keys", "Include the public keys"),
            ring.length === 0
              ? tr("ui.exportdlg.no-keys", "No keys are named on this installation.")
              : tn("ui.exportdlg.n-keys", ring.length,
                  "{0} key, so whoever receives this can check its seals",
                  "{0} keys, so whoever receives this can check its seals"),
            ring.length === 0 || what === "taxonomy")}

          <p className="scope-h">{tr("ui.exportdlg.filename", "File name")}</p>
          <div className="field" style={{ marginBottom: 14 }}>
            <div className="fn-row">
              <input value={filename} spellCheck={false}
                onChange={(e) => { setFilename(e.target.value); setRenamed(true); }} />
              <span className="fn-ext mono">{packed ? (encrypt === "none" ? ".zip" : ".zip.enc") : `.${textFormat}${encrypt === "none" ? "" : ".enc"}`}</span>
            </div>
          </div>

          <p className="scope-h">{tr("ui.exportdlg.protection", "Who may open it")}</p>
          {seg(encrypt, setEncrypt, [
            { v: "none", label: tr("ui.exportdlg.plain", "Anyone") },
            { v: "password", label: tr("ui.exportdlg.password", "Password") },
            { v: "keys", label: tr("ui.exportdlg.to-keys", "Named keys"), off: ring.length === 0,
              title: ring.length ? undefined : tr("ui.exportdlg.no-keys", "No keys are named on this installation.") },
          ])}

          {encrypt === "password" && (
            <div className="field" style={{ marginTop: 10 }}>
              <input type="password" value={password} autoFocus autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)}
                placeholder={tr("ui.exportdlg.password-hint", "Password — at least 4 characters")} />
              <span className="hint">
                {tr("ui.exportdlg.password-note", "The password travels the same way the file does. Addressing it to a key avoids that step.")}
              </span>
            </div>
          )}

          {encrypt === "keys" && (
            <div className="field" style={{ marginTop: 10 }}>
              {ring.map((k) => (
                <label key={k.kid} className="field-row check-row" style={{ alignItems: "center" }}>
                  <input type="checkbox" checked={to.has(k.kid)} onChange={(e) => {
                    const next = new Set(to);
                    if (e.target.checked) next.add(k.kid); else next.delete(k.kid);
                    setTo(next);
                  }} />
                  <span style={{ minWidth: 0 }}>
                    <span className="ck-t">{k.name || k.kid}</span>
                    <span className="ck-s hint mono">{k.kid}</span>
                  </span>
                </label>
              ))}
              <span className="hint">
                {tr("ui.exportdlg.recipients-note", "Each recipient costs one wrapped key, not a second copy of the data.")}
              </span>
            </div>
          )}
        </div>
        <div className="modal-lg-foot">
          <span className="hint export-out">{outcome()}</span>
          <span className="spacer" />
          <button className="btn ghost sm" onClick={onClose}>{tr("ui.exportdlg.cancel", "Cancel")}</button>
          <button className="btn sm primary" disabled={blocked || busy} onClick={go}>
            {busy ? tr("ui.exportdlg.working", "Writing …") : tr("ui.exportdlg.export", "Export")}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
