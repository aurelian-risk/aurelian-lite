// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Data import dialog with a review step: parse a bundle (file / paste / a demo
// revision), preview the diff against the current data (added / changed / removed
// entities, per field), then apply it additively or destructively.
import { useState, useRef } from "react";
import { t as tr, tn } from "../domain/i18n";
import { createPortal } from "react-dom";
import { useActiveStudy, useStore } from "../domain/store";
import { pickImportFile, parseBundle, parseArchive, type ArchiveDoc } from "../domain/persistence";
import { isEncrypted, decryptText, decryptForKey, envelopeRecipients,
  isEncryptedBytes, decryptBytes, decryptBytesForKey, bytesEnvelopeRecipients } from "../domain/crypto";
import { fingerprint, knownKey, ownKey, publicOf, readPublicKeyFile, rememberKey, verifyAllSeals } from "../domain/keys";
import { taxonomyGap } from "../domain/taxonomy";
import { getType, recordTitle } from "../domain/taxonomy";
import { sealState } from "./SealPanel";
import { importDocs } from "../domain/documents";
import { setModelId } from "../domain/embeddings";
import { gen } from "../domain/gen";
import { diffBundle, diffTotals, demoRevision, type StudyDiff, type FieldDelta } from "../domain/importdiff";
import { verifyLog, verdictText, type LogVerdict } from "../domain/audit";
import type { Bundle, FieldValue } from "../domain/types";
import { Icon, Overlay } from "./ui";

type Mode = "merge" | "replace";

const short = (v: FieldValue): string => {
  if (v == null || v === "") return "—";
  if (Array.isArray(v)) return `${tn("ui.import.links", v.length, "{0} link", "{0} links")}`;
  const s = String(v);
  return s.length > 30 ? s.slice(0, 30) + "…" : s;
};
const deltaText = (f: FieldDelta) => `${f.label}: ${short(f.from)} → ${short(f.to)}`;

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const tax = useStore((s) => s.taxonomy);
  const active = useActiveStudy();
  const [mode, setMode] = useState<Mode>("merge");
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{
    bundle: Bundle; diff: StudyDiff[]; note?: string; source?: string;
    audit?: Array<{ name: string; verdict: LogVerdict;
      id: string; seals: Awaited<ReturnType<typeof verifyAllSeals>>; untracked: string[]; records: number }>;
  } | null>(null);

  // Comparing a seal against a public key the recipient already holds. This is the whole
  // of "verification" that is available offline: the signature says the file was sealed by
  // SOME key; matching that key against one obtained by another route says WHOSE.
  const [matchFor, setMatchFor] = useState<{ kid: string; jwk: JsonWebKey } | null>(null);
  const [matchMsg, setMatchMsg] = useState("");
  const [matchOk, setMatchOk] = useState(false);
  const matchRef = useState<{ el: HTMLInputElement | null }>({ el: null })[0];

  const checkKeyFile = async (file: File) => {
    if (!matchFor) return;
    const k = await readPublicKeyFile(await file.text());
    if (!k) { setMatchOk(false); setMatchMsg("That is not a public-key file, or it claims a fingerprint it does not have."); return; }
    if (k.kid !== matchFor.kid) {
      setMatchOk(false);
      setMatchMsg(`That key does NOT match: the file was sealed by ${matchFor.kid}, the key you loaded is ${k.kid}. Either it is a different person's key, or this file is not from whom you think.`);
      return;
    }
    rememberKey(k.kid, k.name || "the sender", k.jwk, new Date().toISOString());
    setMatchOk(true);
    setMatchMsg(`Match. The seal was made by this key${k.name ? ` (${k.name})` : ""}, and it is now named here — the seal reads as verified.`);
  };

  /** What an archive brought with it, held until the import is confirmed. Null for a
   *  plain JSON bundle, which carries references only. */
  const pendingDocs = useRef<ArchiveDoc[] | null>(null);

  const preview = async (bundle: Bundle, note?: string, source?: string) => {
    const diff = diffBundle(tax, store.studies, bundle.studies ?? []);
    // Verify the incoming file BEFORE it is confirmed. Confirming an import re-establishes
    // the chain, so without this the analyst would vouch for the content blind - and a
    // file somebody had edited would end up looking as sound as one that never was.
    // Who vouched for this file, and up to where. Asked here rather than after importing:
    // a signature that only becomes visible once the data is in is a signature nobody
    // acted on. The named records are the ones the log accounts for nothing about.
    const audit = [];
    for (const s of bundle.studies ?? []) {
      const verdict = verifyLog(s.log, s.entities);
      const byId = new Map(s.entities.map((e) => [e.id, e]));
      audit.push({
        id: s.id, name: s.name, verdict, records: s.entities.length,
        seals: await verifyAllSeals(s),
        untracked: verdict.untracked.map((id) => {
          const rec = byId.get(id); const t = rec && getType(tax, rec.type);
          return rec && t ? recordTitle(t, rec) : id.slice(0, 8);
        }),
      });
    }
    setPending({ bundle, diff, note, source, audit });
    setStatus("");
  };

  /** The same two questions as `resolveText`, asked of an archive's bytes.
   *
   *  Written beside it rather than folded into it, because the answers differ in kind: a
   *  binary envelope is recognised by its first four bytes, not by parsing JSON, and what
   *  comes out is a zip rather than a string. */
  const resolveBytes = async (raw: Uint8Array): Promise<Uint8Array> => {
    if (!isEncryptedBytes(raw)) return raw;
    const to = bytesEnvelopeRecipients(raw);
    if (to.length) {
      const mine = ownKey();
      if (!mine) throw new Error(`addressed to ${to.map((t) => t.name || t.kid).join(", ")} - this installation holds no key`);
      const kid = await fingerprint(publicOf(mine));
      const opened = await decryptBytesForKey(raw, mine, kid).catch(() => { throw new Error("addressed to this key, but it does not open the file"); });
      if (opened === null) throw new Error(`not addressed to this key (${kid}) - it is for ${to.map((t) => t.name || t.kid).join(", ")}`);
      return opened;
    }
    const pw = prompt(tr("ui.import.archive-encrypted", "This archive is encrypted. Enter the password:"));
    if (pw === null) throw new Error("cancelled");
    try { return await decryptBytes(raw, pw); }
    catch { throw new Error("wrong password or corrupt archive"); }
  };

  const resolveText = async (raw: string): Promise<string> => {
    // Addressed to a key? Then no password is involved: either this installation holds one
    // of the keys it names, or it does not - and "not addressed to you" is a different
    // sentence from "wrong password", so it is said differently.
    const to = envelopeRecipients(raw);
    if (to.length) {
      const mine = ownKey();
      if (!mine) throw new Error(`addressed to ${to.map((t) => t.name || t.kid).join(", ")} - this installation holds no key`);
      const kid = await fingerprint(publicOf(mine));
      const opened = await decryptForKey(raw, mine, kid).catch(() => { throw new Error("addressed to this key, but it does not open the file"); });
      if (opened === null) throw new Error(`not addressed to this key (${kid}) - it is for ${to.map((t) => t.name || t.kid).join(", ")}`);
      return opened;
    }
    if (!isEncrypted(raw)) return raw;
    const pw = prompt("This export is encrypted. Enter the password:");
    if (pw == null) throw new Error("cancelled");
    try { return await decryptText(raw, pw); }
    catch { throw new Error("wrong password or corrupt file"); }
  };

  const fromFile = async () => {
    setBusy(true); setStatus("");
    try {
      const f = await pickImportFile();
      if (f.buf) {
        const opened = await resolveBytes(new Uint8Array(f.buf));
        // An archive: the bundle is read out of it, and the documents are held until the
        // import is confirmed. They are not written on preview - a preview that has
        // already changed something is not a preview.
        const { bundle, docs } = await parseArchive(opened.buffer.slice(opened.byteOffset, opened.byteOffset + opened.byteLength) as ArrayBuffer);
        pendingDocs.current = docs;
        await preview(bundle, undefined, f.name);
      } else {
        pendingDocs.current = null;
        await preview(parseBundle(await resolveText(f.text ?? "")), undefined, f.name);
      }
    }
    catch (e) { if (e instanceof Error && e.message !== "No file selected" && e.message !== "cancelled") setStatus("Import failed: " + e.message); }
    setBusy(false);
  };
  const fromText = () => {
    if (!text.trim()) { setStatus("Paste JSON or YAML text first, or choose a file."); return; }
    try { void preview(parseBundle(text)); }
    catch (e) { setStatus("Could not parse: " + (e instanceof Error ? e.message : String(e))); }
  };
  const previewDemo = () => {
    if (!active) return;
    void preview({ kind: "ebios-data", version: 2, studies: [demoRevision(active)] },
      "Demo: a colleague's revision of this study — a couple of entities changed, one added, one removed. Nothing is applied until you confirm.");
  };

  const apply = async () => {
    if (!pending) return;
    const b = pending.bundle;
    if (b.taxonomy && store.studies.length > 0 && mode === "replace"
      && !confirm("This file replaces the taxonomy (data model). Existing entities may no longer match. Continue?")) return;
    // What the seals were worth, checked before this click, carried into the chain.
    const sealNotes: Record<string, string> = {};
    for (const a of pending.audit ?? []) {
      const top = a.seals[0];
      if (!top) continue;
      const known = knownKey(top.seal.kid);
      sealNotes[a.id] = top.verdict.problem
        ? `Carried a seal by ${top.seal.kid} that did NOT check out: ${top.verdict.problem}.`
        : `Carried a seal by ${top.seal.kid}${known ? ` (${known.name})` : " (a key not named here)"}, `
          + `signature verified, covering ${top.verdict.payload?.seq ?? 0} entries as "${top.editor}".`;
    }
    store.applyBundle(b, { studiesMode: mode, source: pending.source, sealNotes });
    // From an archive the documents carry their text and their source file; from a JSON
    // bundle only the references. Whichever came in is what is written.
    if (pendingDocs.current?.length) await importDocs(pendingDocs.current);
    else if (b.documents?.length) await importDocs(b.documents);
    // The public keys the sender knew, so their seals can be checked here. Added, never
    // replacing: a key already on this ring keeps the name it was given locally, and an
    // import cannot rename somebody else's key under the reader's nose.
    for (const k of b.keys ?? []) {
      if (!knownKey(k.kid)) rememberKey(k.kid, k.name, k.jwk as JsonWebKey, k.seen ?? new Date().toISOString());
    }
    if (b.settings) {
      if (b.settings.modelId) setModelId(b.settings.modelId);
      if (b.settings.genModelId) (await gen())?.setGenModelId(b.settings.genModelId);
      if (b.settings.theme) { const el = document.documentElement; el.classList.toggle("light", b.settings.theme === "light"); el.classList.toggle("dark", b.settings.theme !== "light"); }
    }
    onClose();
  };

  const totals = pending ? diffTotals(pending.diff) : null;

  return createPortal(
    <Overlay onClose={onClose}>
      <div className="modal-lg" style={{ maxWidth: 620 }} onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-lg-head">
          <div style={{ flex: 1 }}>
            <div className="dialog-sub" style={{ margin: 0 }}>{tr('ui.import.data-json-yaml-auto', 'Data · JSON / YAML (auto-detected)')}</div>
            <h2 style={{ fontSize: 19 }}>{pending ? "Review changes" : "Import data"}</h2>
          </div>
          <button className="btn ghost sm" onClick={onClose} aria-label={tr('ui.import.close', 'Close')}><Icon.close /></button>
        {/* One picker for the key a seal is checked against, outside both branches: the
            offer appears on the review side, where the seal is shown. */}
        <input ref={(el) => { matchRef.el = el; }} type="file" accept=".json" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) checkKeyFile(f); e.target.value = ""; }} />
        </header>

        {!pending ? (
          <div className="modal-lg-body">
            <div className="menu-label" style={{ padding: "16px 0 8px" }}>{tr('ui.import.source', 'Source')}</div>
            <div className="field" style={{ marginBottom: 8 }}>
              <label>{tr('ui.import.paste-json-yaml', 'Paste JSON / YAML')}</label>
              <textarea style={{ minHeight: 130, fontFamily: "var(--font-mono)", fontSize: 12 }} value={text}
                onChange={(e) => setText(e.target.value)} placeholder={tr('ui.import.paste-a-bundle-study', 'Paste a bundle, study data, or a taxonomy here…')} />
            </div>
            <div className="idiff-actions">
              <button className="btn" disabled={busy} onClick={fromFile}><Icon.upload /> {tr('ui.import.choose-file', 'Choose file…')}</button>
              {active && <button className="btn ghost" onClick={previewDemo} title={tr('ui.import.see-the-diff-without', 'See the diff without editing a file')}>{tr('ui.import.preview-a-demo-revision', 'Preview a demo revision')}</button>}
              <span style={{ flex: 1 }} />
              <button className="btn primary" disabled={busy || !text.trim()} onClick={fromText}>{tr('ui.import.preview-pasted', 'Preview pasted →')}</button>
            </div>
            {status && <div className="hint" style={{ marginTop: 12 }}>{status}</div>}
          </div>
        ) : (
          <div className="modal-lg-body">
            {pending.note && <div className="guide" style={{ marginBottom: 12 }}>{pending.note}</div>}
            {/* A file without a data model, from an installation that uses a different one.
                Measured: such records are stored and then never drawn - every register is
                derived from the taxonomy, so there is no table for them to appear in. The
                data is neither lost nor visible, which is the worst of the two, and the
                only moment to say so is before the import. */}
            {(() => {
              const gap = pending.bundle.taxonomy ? null : taxonomyGap(tax, pending.bundle.studies ?? []);
              if (!gap || (!gap.types.length && !gap.fields.length)) return null;
              return (
                <div className="guide warn" style={{ marginBottom: 12 }}>
                  <strong>{tr("ui.import.gap-title", "This file carries no data model, and it does not fit this one.")}</strong>
                  <div style={{ marginTop: 6 }}>
                    {tn("ui.import.gap-records", gap.records,
                      "{0} record uses something this installation does not have. It would be imported and then never shown - no table exists for it.",
                      "{0} records use something this installation does not have. They would be imported and then never shown - no table exists for them.")}
                  </div>
                  {gap.types.length > 0 && (
                    <div className="hint" style={{ marginTop: 5 }}>
                      {tr("ui.import.gap-types", "Unknown types:")} <span className="mono">{gap.types.join(", ")}</span>
                    </div>
                  )}
                  {gap.fields.length > 0 && (
                    <div className="hint" style={{ marginTop: 3 }}>
                      {tr("ui.import.gap-fields", "Unknown fields:")}{" "}
                      <span className="mono">{gap.fields.slice(0, 8).map((f) => `${f.type}.${f.field}`).join(", ")}</span>
                      {gap.fields.length > 8 && ` +${gap.fields.length - 8}`}
                    </div>
                  )}
                  <div className="hint" style={{ marginTop: 6 }}>
                    {tr("ui.import.gap-fix", "Ask the sender for an export that includes the data model.")}
                  </div>
                </div>
              );
            })()}
            {pending.audit?.map((a, i) => (
              <div key={i}>
              {/* Who signed this file, before anything is imported. The one question a
                  recipient actually has - and the point at which the answer can still
                  change what they do. */}
              {a.seals.length > 0 ? (() => {
                const top = a.seals[0], known = knownKey(top.seal.kid), st = sealState(top.verdict, !!known);
                return (
                  <div className={"guide idiff-seal sp-" + st} style={{ marginBottom: 10 }}>
                    <div className="sp-seal-t">
                      <span className="sp-dot" />
                      {/* Three states, named. Which one this is decides what the reader
                          should do next, so it is said rather than implied by a colour. */}
                      {st === "broken" ? <><strong>{tr('ui.import.not-verified', 'Not verified')}</strong> — this file&apos;s seal does not check out</>
                        : st === "verified" ? <><strong>{tr('ui.import.verified', 'Verified')}</strong> — sealed by <strong>{known!.name}</strong>, a key you have vouched for</>
                        : <><strong>{tr('ui.import.signature-valid-sender-unconfirmed', 'Signature valid, sender unconfirmed')}</strong> — the seal is intact, but this key is not one you have named</>}
                      <span className="mono sp-kid">{top.seal.kid}</span>
                    </div>
                    <div className="meta">
                      as “{top.editor || "—"}” on {new Date(top.ts).toLocaleString()}
                      {top.verdict.payload ? ` · covers ${top.verdict.payload.seq} of ${(a.verdict.chainBroken ? "?" : (a.seals[0]?.verdict.payload?.seq ?? 0) + top.verdict.changesSince)} log entries` : ""}
                      {top.verdict.changesSince > 0 ? ` · ${top.verdict.changesSince} recorded after it` : ""}
                      {top.verdict.coversCurrentState === true ? " · records unchanged since" : ""}
                    </div>
                    {top.verdict.problem && <div className="sp-problem">{top.verdict.problem}</div>}
                    {st === "intact" && (
                      <div className="idiff-match">
                        <span className="meta">{tr('ui.import.hold-the-sender-apos', 'Hold the sender&apos;s public key? Check it against this seal.')}</span>
                        <button className="btn sm" onClick={() => { setMatchFor({ kid: top.seal.kid, jwk: top.seal.jwk }); matchRef.el?.click(); }}>
                          <Icon.upload /> {tr('ui.import.check-against-a-key', 'Check against a key file…')}
                        </button>
                      </div>
                    )}
                    {matchMsg && <div className={"idiff-match-msg " + (matchOk ? "ok" : "bad")}>{matchMsg}</div>}
                  </div>
                );
              })() : (
                <div className="guide" style={{ marginBottom: 10 }}>
                  <strong>{tr('ui.import.not-sealed', 'Not sealed.')}</strong> {tr('ui.import.nothing-in-this-file', 'Nothing in this file says who produced it; its change\n                  log can only be checked against itself.')}
                </div>
              )}
              {a.untracked.length > 0 && (
                // The count is the finding; the names are only wanted by whoever goes
                // looking. Spelling out eight of a hundred and fifty-five buries the one
                // number that matters in a paragraph nobody finishes reading.
                <details className="guide warn idiff-untracked" style={{ marginBottom: 10 }}>
                  <summary>
                    <strong>{a.untracked.length} of {tn("ui.import.records", a.records, "{0} record", "{0} records")}</strong> are
                    not accounted for by the log — no seal covers {a.untracked.length === 1 ? "it" : "them"}
                  </summary>
                  <div className="idiff-untracked-list">{a.untracked.join(" · ")}</div>
                </details>
              )}
              <div className={"guide " + (a.verdict.ok ? "" : "warn")} style={{ marginBottom: 12 }}>
                <strong>{a.name}</strong> — {a.verdict.ok
                  ? <>the file's own change log is <strong>complete and matches its data</strong>.</>
                  : <>this file's change log <strong>does not hold up: {verdictText(a.verdict)}</strong>. Its history is
                    taken over as it stands, and whatever it leaves unaccounted for is recorded as such.</>}
                {" "}
                {mode === "replace"
                  ? <>Destructive: the file decides this study's contents, and records it does not contain are recorded
                    as deletions. This study's own chain is kept and continues{a.verdict.ok ? "" : " - the import, and what the file's log was worth, are written into it"}.</>
                  : <>Additive: the file's records and entries are folded into this study's chain{a.verdict.ok ? "" : ", and the import notes what the file's log was worth"}.</>}
              </div>
              </div>
            ))}
            <div className="idiff-summary">
              <span className="idiff-c add">+{totals!.added} added</span>
              <span className="idiff-c chg">~{totals!.changed} changed</span>
              <span className="idiff-c rem">−{totals!.removed} {mode === "replace" ? "removed" : "kept"}</span>
            </div>
            {pending.diff.length === 0 && <div className="hint">{tr('ui.import.no-study-data-in', 'No study data in this file (taxonomy/settings only).')}</div>}
            {pending.diff.map((sd) => (
              <div className="idiff-study" key={sd.id}>
                <div className="idiff-study-h">{sd.name}{sd.isNew && <span className="idiff-new">new study</span>}</div>
                {[...sd.changed, ...sd.added, ...sd.removed].length === 0 && <div className="hint">{tr('ui.import.no-differences', 'No differences.')}</div>}
                {[...sd.changed, ...sd.added, ...sd.removed].map((ed) => (
                  <div className={"idiff-ent " + ed.kind} key={ed.kind + ed.id}>
                    <span className={"idiff-badge " + ed.kind}>{ed.kind === "added" ? "+" : ed.kind === "removed" ? "−" : "~"}</span>
                    <span className="idiff-lbl">{ed.label}</span>
                    <span className="idiff-type">{ed.typeLabel}</span>
                    {ed.kind === "removed" && <span className="idiff-hint">{mode === "replace" ? "will be removed" : "kept (additive)"}</span>}
                    {ed.fields && <span className="idiff-fields">{ed.fields.slice(0, 3).map(deltaText).join(" · ")}{ed.fields.length > 3 ? ` · +${ed.fields.length - 3} more` : ""}</span>}
                    {ed.last && ed.kind !== "removed" && (
                      <span className="idiff-meta">{ed.last.editor} · {new Date(ed.last.ts).toLocaleString()}{ed.last.comment ? ` · “${ed.last.comment}”` : ""}</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        <footer className="modal-lg-foot">
          {!pending ? (
            <span className="hint">{tr('ui.import.choose-a-source-to', 'Choose a source to preview the changes first.')}</span>
          ) : (
            <>
              <div className="import-modes-inline">
                {(["merge", "replace"] as Mode[]).map((m) => (
                  <label key={m} className={"seg-btn" + (mode === m ? " on" : "")}>
                    <input type="radio" name="imode" checked={mode === m} onChange={() => setMode(m)} style={{ display: "none" }} />
                    {m === "merge" ? "Additive" : "Destructive"}
                  </label>
                ))}
              </div>
              <span style={{ flex: 1 }} />
              <button className="btn ghost" onClick={() => setPending(null)}>‹ Back</button>
              <button className={"btn " + (mode === "replace" ? "danger" : "primary")} onClick={apply}>
                {mode === "replace" ? "Replace all" : "Apply changes"}
              </button>
            </>
          )}
        </footer>
      </div>
    </Overlay>,
    document.body,
  );
}
