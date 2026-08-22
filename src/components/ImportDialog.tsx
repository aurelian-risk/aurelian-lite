// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Data import dialog with a review step: parse a bundle (file / paste / a demo
// revision), preview the diff against the current data (added / changed / removed
// entities, per field), then apply it additively or destructively.
import { useState } from "react";
import { createPortal } from "react-dom";
import { useActiveStudy, useStore } from "../domain/store";
import { pickTextFile, parseBundle } from "../domain/persistence";
import { isEncrypted, decryptText, decryptForKey, envelopeRecipients } from "../domain/crypto";
import { fingerprint, knownKey, ownKey, publicOf, readPublicKeyFile, rememberKey, verifyAllSeals } from "../domain/keys";
import { getType, recordTitle } from "../domain/taxonomy";
import { sealState } from "./SealPanel";
import { importDocs } from "../domain/documents";
import { setModelId } from "../domain/embeddings";
import { gen } from "../domain/gen";
import { diffBundle, diffTotals, demoRevision, type StudyDiff, type FieldDelta } from "../domain/importdiff";
import { verifyLog, verdictText, type LogVerdict } from "../domain/audit";
import type { Bundle, FieldValue } from "../domain/types";
import { Icon } from "./ui";

type Mode = "merge" | "replace";

const short = (v: FieldValue): string => {
  if (v == null || v === "") return "—";
  if (Array.isArray(v)) return `${v.length} link${v.length === 1 ? "" : "s"}`;
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
    try { const f = await pickTextFile(); await preview(parseBundle(await resolveText(f.text)), undefined, f.name); }
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
    if (b.documents?.length) await importDocs(b.documents);
    if (b.settings) {
      if (b.settings.modelId) setModelId(b.settings.modelId);
      if (b.settings.genModelId) (await gen())?.setGenModelId(b.settings.genModelId);
      if (b.settings.theme) { const el = document.documentElement; el.classList.toggle("light", b.settings.theme === "light"); el.classList.toggle("dark", b.settings.theme !== "light"); }
    }
    onClose();
  };

  const totals = pending ? diffTotals(pending.diff) : null;

  return createPortal(
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal-lg" style={{ maxWidth: 620 }} onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-lg-head">
          <div style={{ flex: 1 }}>
            <div className="dialog-sub" style={{ margin: 0 }}>Data · JSON / YAML (auto-detected)</div>
            <h2 style={{ fontSize: 19 }}>{pending ? "Review changes" : "Import data"}</h2>
          </div>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close"><Icon.close /></button>
        {/* One picker for the key a seal is checked against, outside both branches: the
            offer appears on the review side, where the seal is shown. */}
        <input ref={(el) => { matchRef.el = el; }} type="file" accept=".json" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) checkKeyFile(f); e.target.value = ""; }} />
        </header>

        {!pending ? (
          <div className="modal-lg-body">
            <div className="menu-label" style={{ padding: "16px 0 8px" }}>Source</div>
            <div className="field" style={{ marginBottom: 8 }}>
              <label>Paste JSON / YAML</label>
              <textarea style={{ minHeight: 130, fontFamily: "var(--font-mono)", fontSize: 12 }} value={text}
                onChange={(e) => setText(e.target.value)} placeholder="Paste a bundle, study data, or a taxonomy here…" />
            </div>
            <div className="idiff-actions">
              <button className="btn" disabled={busy} onClick={fromFile}><Icon.upload /> Choose file…</button>
              {active && <button className="btn ghost" onClick={previewDemo} title="See the diff without editing a file">Preview a demo revision</button>}
              <span style={{ flex: 1 }} />
              <button className="btn primary" disabled={busy || !text.trim()} onClick={fromText}>Preview pasted →</button>
            </div>
            {status && <div className="hint" style={{ marginTop: 12 }}>{status}</div>}
          </div>
        ) : (
          <div className="modal-lg-body">
            {pending.note && <div className="guide" style={{ marginBottom: 12 }}>{pending.note}</div>}
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
                      {st === "broken" ? <><strong>Not verified</strong> — this file&apos;s seal does not check out</>
                        : st === "verified" ? <><strong>Verified</strong> — sealed by <strong>{known!.name}</strong>, a key you have vouched for</>
                        : <><strong>Signature valid, sender unconfirmed</strong> — the seal is intact, but this key is not one you have named</>}
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
                        <span className="meta">Hold the sender&apos;s public key? Check it against this seal.</span>
                        <button className="btn sm" onClick={() => { setMatchFor({ kid: top.seal.kid, jwk: top.seal.jwk }); matchRef.el?.click(); }}>
                          <Icon.upload /> Check against a key file…
                        </button>
                      </div>
                    )}
                    {matchMsg && <div className={"idiff-match-msg " + (matchOk ? "ok" : "bad")}>{matchMsg}</div>}
                  </div>
                );
              })() : (
                <div className="guide" style={{ marginBottom: 10 }}>
                  <strong>Not sealed.</strong> Nothing in this file says who produced it; its change
                  log can only be checked against itself.
                </div>
              )}
              {a.untracked.length > 0 && (
                // The count is the finding; the names are only wanted by whoever goes
                // looking. Spelling out eight of a hundred and fifty-five buries the one
                // number that matters in a paragraph nobody finishes reading.
                <details className="guide warn idiff-untracked" style={{ marginBottom: 10 }}>
                  <summary>
                    <strong>{a.untracked.length} of {a.records} record{a.records === 1 ? "" : "s"}</strong> are
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
            {pending.diff.length === 0 && <div className="hint">No study data in this file (taxonomy/settings only).</div>}
            {pending.diff.map((sd) => (
              <div className="idiff-study" key={sd.id}>
                <div className="idiff-study-h">{sd.name}{sd.isNew && <span className="idiff-new">new study</span>}</div>
                {[...sd.changed, ...sd.added, ...sd.removed].length === 0 && <div className="hint">No differences.</div>}
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
            <span className="hint">Choose a source to preview the changes first.</span>
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
    </div>,
    document.body,
  );
}
