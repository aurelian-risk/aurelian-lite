// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Seals: who vouched for this study, and up to which point.
//
// The panel says the verdict and nothing else. Everything that is explanation rather than
// state - what a signature does and does not prove, what happens if a key is lost - lives
// behind "What does a seal prove?" and in docs/seals-and-keys.md. A wall of caveats on the
// page is not read, and pushes the one line that matters off the screen.
import { useEffect, useState } from "react";
import { Sentence } from "./Sentence";
import { t as tr, tn } from "../domain/i18n";
import { createPortal } from "react-dom";
import { useActiveStudy, useStore } from "../domain/store";
import { verifyLog } from "../domain/audit";
import {
  fingerprint, forgetKey, generateKeyPair, knownKey, knownKeys, ownKey, publicKeyFile, publicOf,
  readPublicKeyFile, rememberKey, setOwnKey, signingAvailable, verifyAllSeals, type Seal, type SealVerdict,
} from "../domain/keys";
import { downloadText } from "../domain/clipboard";
import { encryptText, decryptText } from "../domain/crypto";
import { Icon, Overlay } from "./ui";

type Row = { seq: number; ts: string; editor: string; seal: Seal; verdict: SealVerdict };

/** One seal's state in one word, which is what the colour and the heading both come from. */
export function sealState(v: SealVerdict, trusted: boolean): "verified" | "intact" | "broken" {
  if (!v.signed || !v.bindsHistory || v.coversCurrentState === false) return "broken";
  return trusted ? "verified" : "intact";
}

export function SealPanel() {
  const study = useActiveStudy();
  const sealActive = useStore((s) => s.sealActive);
  const [tick, bump] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [mine, setMine] = useState<JsonWebKey | null>(null);
  const [kid, setKid] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [dialog, setDialog] = useState<"none" | "keys" | "seal" | "explain" | "trust">("none");
  const [pending, setPending] = useState<{ kid: string; jwk: JsonWebKey } | null>(null);
  const [field, setField] = useState("");
  const [pw, setPw] = useState("");
  const keyFile = useState<{ el: HTMLInputElement | null }>({ el: null })[0];
  const pubFile = useState<{ el: HTMLInputElement | null }>({ el: null })[0];

  useEffect(() => {
    const k = ownKey();
    setMine(k);
    if (k) fingerprint(publicOf(k)).then(setKid).catch(() => setKid("")); else setKid("");
  }, [busy, tick]);

  useEffect(() => {
    if (!study) return;
    let live = true;
    verifyAllSeals(study).then((r) => { if (live) setRows(r); });
    return () => { live = false; };
  }, [study, tick]);

  if (!study) return null;
  if (!signingAvailable()) return <div className="guide warn">{tr('ui.seal.this-browser-exposes-no', 'This browser exposes no Web Crypto, so studies cannot be sealed here.')}</div>;

  const close = () => { setDialog("none"); setPw(""); setField(""); setPending(null); };

  const makeKey = async () => {
    setBusy(true);
    const kp = await generateKeyPair().catch(() => null);
    if (kp) { setOwnKey(kp.privateJwk); rememberKey(kp.kid, "you", kp.publicJwk, new Date().toISOString()); setMsg(`Key ${kp.kid} created.`); }
    setBusy(false); bump((n) => n + 1);
  };
  const saveKey = async () => {
    if (!mine || pw.length < 4) { setMsg("The key file needs a password of at least 4 characters."); return; }
    setBusy(true);
    downloadText("aurelian-signing-key.json", await encryptText(JSON.stringify(mine), pw), "application/json");
    setMsg("Private key saved, encrypted with that password."); setPw(""); setBusy(false);
  };
  const savePublic = async () => {
    if (!mine) return;
    downloadText(`aurelian-public-key-${kid}.json`, publicKeyFile(kid, "", publicOf(mine)), "application/json");
    setMsg("Public key saved. It is not a secret — send it any way you like, then have the other side check the fingerprint.");
  };
  const loadKey = async (file: File) => {
    setBusy(true);
    try {
      const jwk = JSON.parse(await decryptText(await file.text(), pw)) as JsonWebKey;
      setOwnKey(jwk);
      const fp = await fingerprint(publicOf(jwk));
      rememberKey(fp, "you", publicOf(jwk), new Date().toISOString());
      setMsg(`Key ${fp} loaded.`); setPw("");
    } catch { setMsg("Not a key file, or the wrong password."); }
    setBusy(false); bump((n) => n + 1);
  };
  const loadPublic = async (file: File) => {
    const k = await readPublicKeyFile(await file.text());
    if (!k) { setMsg("Not a public-key file — or it claims a fingerprint it does not have."); return; }
    setPending({ kid: k.kid, jwk: k.jwk }); setField(k.name); setDialog("trust");
  };
  const doSeal = async () => {
    if (!field.trim()) return;
    setBusy(true);
    const k = await sealActive(field.trim());
    setMsg(k ? `Sealed with ${k}.` : "Nothing to seal.");
    setBusy(false); close(); bump((n) => n + 1);
  };

  const chain = verifyLog(study.log, study.entities);
  const newest = rows[0];
  const newestTrusted = newest ? !!knownKey(newest.seal.kid) : false;
  const state = newest ? sealState(newest.verdict, newestTrusted) : null;

  return (
    <div className="panel sp" style={{ marginBottom: 20 }}>
      <div className="panel-head">
        <h3>{tr('ui.seal.seals', 'Seals')}</h3>
        {newest && <span className={"sp-badge sp-" + state}>
          {state === "verified" ? "verified" : state === "intact" ? "signature valid · key not named" : "does not check out"}
        </span>}
        <span className="spacer" />
        <button className="btn ghost sm" onClick={() => setDialog("explain")}>{tr('ui.seal.what-does-a-seal', 'What does a seal prove?')}</button>
        <button className="btn ghost sm" onClick={() => setDialog("keys")}>{tr('ui.seal.keys', 'Keys')}</button>
        <button className="btn sm primary" disabled={busy || !mine || !(study.log ?? []).length}
          title={mine ? "" : "Create or load a signing key first"}
          onClick={() => { setField((study.log ?? []).slice(-1)[0]?.editor || ""); setDialog("seal"); }}>
          <Icon.check /> {tr('ui.seal.seal', 'Seal')}
        </button>
      </div>
      <div className="panel-body" style={{ padding: "10px 14px 14px" }}>
        {rows.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>
            {tr('ui.seal.not-sealed-a-seal', 'Not sealed. A seal signs the change log so far, so that altering anything recorded\n            before it needs the private key.')}
          </p>
        ) : (
          <div className="sp-list">
            {rows.map((r) => {
              const known = knownKey(r.seal.kid);
              const st = sealState(r.verdict, !!known);
              return (
                <div className={"sp-seal sp-" + st} key={r.seq}>
                  <span className="sp-dot" />
                  <div className="sp-seal-main">
                    <div className="sp-seal-t">
                      {known ? <>{tr('ui.seal.sealed-by', 'Sealed by')} <strong>{known.name}</strong></> : <>Sealed by an unnamed key</>}
                      <span className="mono sp-kid">{r.seal.kid}</span>
                      {!known && <button className="btn ghost sm" onClick={() => { setPending({ kid: r.seal.kid, jwk: r.seal.jwk }); setField(""); setDialog("trust"); }}>{tr('ui.seal.name-it', 'Name it…')}</button>}
                    </div>
                    <div className="meta">
                      {new Date(r.ts).toLocaleString()} · as “{r.editor || "—"}”
                      {r.verdict.payload ? ` · covers entries 1–${r.verdict.payload.seq}` : ""}
                      {r.verdict.changesSince > 0 ? ` · ${tn("ui.seal.changes", r.verdict.changesSince, "{0} change", "{0} changes")} after it` : ""}
                      {r.verdict.coversCurrentState === true ? " · records unchanged since" : ""}
                    </div>
                    {r.verdict.problem && <div className="sp-problem">{r.verdict.problem}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!chain.ok && rows.length > 0 && (
          <p className="hint">{tr('ui.seal.the-log-itself-does', 'The log itself does not verify, so a seal can only speak for what came before the break.')}</p>
        )}
        {msg && <p className="hint">{msg}</p>}
      </div>

      {/* ── dialogs ─────────────────────────────────────────────────────── */}
      {dialog === "seal" && (
        <Modal title={tr('ui.seal.seal-this-study', 'Seal this study')} onClose={close}>
          <p className="meta">Signs the change log as it stands ({(study.log ?? []).length} entries) with key <span className="mono">{kid}</span>.</p>
          <label className="field"><span>{tr('ui.seal.seal-as', 'Seal as')}</span>
            <input autoFocus value={field} onChange={(e) => setField(e.target.value)} placeholder="your name, as it should appear" /></label>
          <div className="modal-acts">
            <button className="btn ghost" onClick={close}>{tr('ui.seal.cancel', 'Cancel')}</button>
            <button className="btn primary" disabled={busy || !field.trim()} onClick={doSeal}>{tr('ui.seal.seal', 'Seal')}</button>
          </div>
        </Modal>
      )}

      {dialog === "trust" && pending && (
        <Modal title={tr('ui.seal.name-this-key', 'Name this key')} onClose={close}>
          <p className="meta">
            {tr('ui.seal.compare-this-fingerprint-with', 'Compare this fingerprint with the one its owner gave you — by phone, in person, any\n            route other than the file itself. Naming it here says you did.')}
          </p>
          <div className="sp-fp mono">{pending.kid}</div>
          <label className="field"><span>{tr('ui.seal.whose-key-is-it', 'Whose key is it?')}</span>
            <input autoFocus value={field} onChange={(e) => setField(e.target.value)} placeholder="e.g. Dr. Weber, external auditor" /></label>
          <div className="modal-acts">
            <button className="btn ghost" onClick={close}>{tr('ui.seal.cancel', 'Cancel')}</button>
            <button className="btn primary" disabled={!field.trim()}
              onClick={() => { rememberKey(pending.kid, field, pending.jwk, new Date().toISOString()); close(); bump((n) => n + 1); }}>
              {tr('ui.seal.it-is-theirs', 'It is theirs')}
            </button>
          </div>
        </Modal>
      )}

      {dialog === "keys" && (
        <Modal title={tr('ui.seal.keys', 'Keys')} onClose={close} wide>
          <div className="sp-sec">
            <div className="sp-sec-t">{tr('ui.seal.this-installation', 'This installation')}</div>
            {/* The two halves are separate rows, and they have to be: a password field
                between "save public" and "save private" reads as belonging to whichever
                button the eye reaches first, and the public half needs no password at
                all. One row per key, the password inside the row it protects. */}
            {mine ? (
              <>
                <div className="sp-fp mono">{kid}</div>
                <div className="sp-half">
                  <div className="sp-half-t">{tr('ui.seal.public-key', 'Public key')} <span>not a secret — hand it to whoever checks your seals</span></div>
                  <div className="sp-acts">
                    <button className="btn sm" onClick={savePublic}><Icon.download /> {tr('ui.seal.save-public-key', 'Save public key…')}</button>
                  </div>
                </div>
                <div className="sp-half">
                  <div className="sp-half-t">{tr('ui.seal.private-key', 'Private key')} <span>keep it; the file is encrypted with the password you give here</span></div>
                  <div className="sp-acts">
                    <input type="password" placeholder="password for this file" value={pw} onChange={(e) => setPw(e.target.value)} style={{ maxWidth: 210 }} />
                    <button className="btn sm" disabled={busy} onClick={saveKey}><Icon.download /> {tr('ui.seal.save-private-key', 'Save private key…')}</button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="sp-acts">
                  <button className="btn sm primary" disabled={busy} onClick={makeKey}><Icon.plus /> {tr('ui.seal.create-a-key', 'Create a key')}</button>
                </div>
                <div className="sp-half">
                  <div className="sp-half-t"><Sentence k="ui.seal.or-load-one" parts={[<span>{tr('ui.seal.the-password-its-file', 'the password its file was saved with')}</span>]} en={"Or load one you already have {0}"} /></div>
                  <div className="sp-acts">
                    <input type="password" placeholder="password of that file" value={pw} onChange={(e) => setPw(e.target.value)} style={{ maxWidth: 210 }} />
                    <button className="btn sm" disabled={busy} onClick={() => keyFile.el?.click()}><Icon.upload /> {tr('ui.seal.load-private-key', 'Load private key…')}</button>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="sp-sec">
            <div className="sp-sec-t">{tr('ui.seal.keys-you-have-named', 'Keys you have named')}</div>
            {knownKeys().length === 0 && <p className="meta">{tr('ui.seal.none-yet-name-a', "None yet. Name a key from a seal, or load someone's public-key file.")}</p>}
            {knownKeys().map((k) => (
              <div className="sp-ring-row" key={k.kid}>
                <span className="mono">{k.kid}</span><span>{k.name}</span>
                <button className="btn ghost sm danger" title={tr('ui.seal.forget-this-key', 'Forget this key')} onClick={() => { forgetKey(k.kid); bump((n) => n + 1); }}><Icon.trash /></button>
              </div>
            ))}
            <div className="sp-acts"><button className="btn sm" onClick={() => pubFile.el?.click()}><Icon.upload /> {tr('ui.seal.add-someone-s-public', "Add someone's public key…")}</button></div>
          </div>
          {msg && <p className="hint">{msg}</p>}
        </Modal>
      )}

      {dialog === "explain" && (
        <Modal title={tr('ui.seal.what-a-seal-proves', 'What a seal proves')} onClose={close} wide>
          <p><strong>{tr('ui.seal.it-proves-the-history', 'It proves the history.')}</strong> {tr('ui.seal.the-signature-covers-the', 'The signature covers the head of the change\n            log, so every entry recorded before the seal is exactly what was signed. Altering any\n            of it needs the private key.')}</p>
          <p><strong>{tr('ui.seal.it-does-not-prove', 'It does not prove when.')}</strong> {tr('ui.seal.a-signature-carries-no', 'A signature carries no time; whoever holds\n            the key can date a seal as they like.')}</p>
          <p><strong>{tr('ui.seal.it-does-not-prove-2', 'It does not prove who, on its own.')}</strong> {tr('ui.seal.it-proves-the-holder', 'It proves “the holder of this\n            key”. Compare the fingerprint by another route, then name the key — after that, seals\n            by it read as verified.')}</p>
          <p><strong>{tr('ui.seal.it-does-not-make', 'It does not make the content true.')}</strong> {tr('ui.seal.it-makes-its-author', 'It makes its author accountable\n            for it.')}</p>
          <p className="meta">{tr('ui.seal.anyone-can-check-a', 'Anyone can check a seal without this application: it is a JWS\n            (ES256), and the public key travels with it.')}</p>
          <div className="modal-acts"><button className="btn primary" onClick={close}>{tr('ui.seal.close', 'Close')}</button></div>
        </Modal>
      )}

      <input ref={(el) => { keyFile.el = el; }} type="file" accept=".json" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) loadKey(f); e.target.value = ""; }} />
      <input ref={(el) => { pubFile.el = el; }} type="file" accept=".json" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) loadPublic(f); e.target.value = ""; }} />
    </div>
  );
}

/** A small dialog, built from the classes the rest of the app already styles - `modal-lg`
 *  with `sp-modal` narrowing it. Inventing `.modal` was how the first version rendered
 *  unstyled: the class existed in the markup and nowhere in the stylesheet. */
function Modal({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  return createPortal(
    <Overlay onClose={onClose}>
      <div className={"modal-lg sp-modal" + (wide ? " sp-modal-w" : "")} onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-lg-head">
          <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
          <span style={{ flex: 1 }} />
          <button className="btn ghost sm" onClick={onClose} aria-label={tr('ui.seal.close', 'Close')}><Icon.close /></button>
        </header>
        <div className="modal-lg-body">{children}</div>
      </div>
    </Overlay>, document.body);
}
