// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// The key ring, in one place.
//
// It was written inside the seal panel, which lives in the change history — and that was
// the only place it could be reached. Addressing an export to a recipient needs their
// public key, so the reader had to leave the export they were half-way through setting up,
// cross three views, and build it again afterwards.
//
// The panel is this component now, and both callers show the same one. Not a copy: a second
// key dialog would be a second set of rules about what a key file is, and the two would
// answer differently the first time either was corrected.
//
// What it does NOT own is naming a key that arrived on a seal. That is a different act —
// the key comes out of a signature rather than out of a file, and the question is whether
// the person who signed is who they claim — so it stays where the seal is, in `SealPanel`.
import { useState } from "react";
import { Sentence } from "./Sentence";
import { t as tr } from "../domain/i18n";
import { Icon } from "./ui";
import { downloadText } from "../domain/clipboard";
import { decryptText, encryptText } from "../domain/crypto";
import {
  fingerprint, forgetKey, generateKeyPair, knownKeys, ownKey, publicKeyFile, publicOf,
  readPublicKeyFile, rememberKey, setOwnKey,
} from "../domain/keys";

/** @param onChange runs whenever the ring or this installation's own key changes, so a
 *  caller that read `knownKeys()` or `ownKey()` for its own display can read them again. */
export function KeyManager({ onChange }: { onChange?: () => void }) {
  const [tick, bump] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [pw, setPw] = useState("");
  const [named, setNamed] = useState("");
  const [pending, setPending] = useState<{ kid: string; jwk: JsonWebKey } | null>(null);
  const [kid, setKid] = useState("");
  const keyFile = useState<{ el: HTMLInputElement | null }>({ el: null })[0];
  const pubFile = useState<{ el: HTMLInputElement | null }>({ el: null })[0];
  const mine = ownKey();
  const changed = () => { bump((n) => n + 1); onChange?.(); };

  // The fingerprint of the key this installation holds. Recomputed after every change,
  // because creating, loading and forgetting all move it.
  if (mine && !kid) void fingerprint(publicOf(mine)).then(setKid).catch(() => setKid(""));

  const makeKey = async () => {
    setBusy(true);
    const kp = await generateKeyPair().catch(() => null);
    if (kp) {
      setOwnKey(kp.privateJwk);
      rememberKey(kp.kid, "you", kp.publicJwk, new Date().toISOString());
      setKid(kp.kid);
      setMsg(tr("ui.keys.created", "Key created."));
    }
    setBusy(false); changed();
  };
  const saveKey = async () => {
    if (!mine || pw.length < 4) {
      setMsg(tr("ui.keys.needs-password", "The key file needs a password of at least 4 characters."));
      return;
    }
    setBusy(true);
    downloadText("aurelian-signing-key.json", await encryptText(JSON.stringify(mine), pw), "application/json");
    setMsg(tr("ui.keys.private-saved", "Private key saved, encrypted with that password."));
    setPw(""); setBusy(false);
  };
  const savePublic = () => {
    if (!mine) return;
    downloadText(`aurelian-public-key-${kid}.json`, publicKeyFile(kid, "", publicOf(mine)), "application/json");
    setMsg(tr("ui.keys.public-saved", "Public key saved. It is not a secret — send it any way you like, then have the other side check the fingerprint."));
  };
  const loadKey = async (file: File) => {
    setBusy(true);
    try {
      const jwk = JSON.parse(await decryptText(await file.text(), pw)) as JsonWebKey;
      setOwnKey(jwk);
      const fp = await fingerprint(publicOf(jwk));
      rememberKey(fp, "you", publicOf(jwk), new Date().toISOString());
      setKid(fp); setMsg(tr("ui.keys.loaded", "Key loaded.")); setPw("");
    } catch { setMsg(tr("ui.keys.not-a-key", "Not a key file, or the wrong password.")); }
    setBusy(false); changed();
  };
  const loadPublic = async (file: File) => {
    const k = await readPublicKeyFile(await file.text());
    if (!k) {
      setMsg(tr("ui.keys.not-public", "Not a public-key file — or it claims a fingerprint it does not have."));
      return;
    }
    setPending({ kid: k.kid, jwk: k.jwk }); setNamed(k.name); setMsg("");
  };
  const keepPublic = () => {
    if (!pending) return;
    rememberKey(pending.kid, named.trim() || pending.kid, pending.jwk, new Date().toISOString());
    setPending(null); setNamed(""); changed();
  };

  const ring = knownKeys();

  return (
    <>
      <div className="sp-sec">
        <div className="sp-sec-t">{tr("ui.seal.this-installation", "This installation")}</div>
        {/* The two halves are separate rows, and they have to be: a password field between
            "save public" and "save private" reads as belonging to whichever button the eye
            reaches first, and the public half needs no password at all. One row per key,
            the password inside the row it protects. */}
        {mine ? (
          <>
            <div className="sp-fp mono">{kid}</div>
            <div className="sp-half">
              <div className="sp-half-t">{tr("ui.seal.public-key", "Public key")} <span>{tr("ui.keys.not-a-secret", "not a secret — hand it to whoever checks your seals")}</span></div>
              <div className="sp-acts">
                <button className="btn sm" onClick={savePublic}><Icon.download /> {tr("ui.seal.save-public-key", "Save public key…")}</button>
              </div>
            </div>
            <div className="sp-half">
              <div className="sp-half-t">{tr("ui.seal.private-key", "Private key")} <span>{tr("ui.keys.keep-it-encrypted", "keep it; the file is encrypted with the password you give here")}</span></div>
              <div className="sp-acts">
                <input type="password" placeholder={tr("ui.keys.password-for-this-file", "password for this file")}
                  value={pw} onChange={(e) => setPw(e.target.value)} style={{ maxWidth: 210 }} />
                <button className="btn sm" disabled={busy} onClick={saveKey}><Icon.download /> {tr("ui.seal.save-private-key", "Save private key…")}</button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="sp-acts">
              <button className="btn sm primary" disabled={busy} onClick={makeKey}><Icon.plus /> {tr("ui.seal.create-a-key", "Create a key")}</button>
            </div>
            <div className="sp-half">
              <div className="sp-half-t"><Sentence k="ui.seal.or-load-one" parts={[<span>{tr("ui.seal.the-password-its-file", "the password its file was saved with")}</span>]} en={"Or load one you already have {0}"} /></div>
              <div className="sp-acts">
                <input type="password" placeholder={tr("ui.keys.password-of-that-file", "password of that file")}
                  value={pw} onChange={(e) => setPw(e.target.value)} style={{ maxWidth: 210 }} />
                <button className="btn sm" disabled={busy} onClick={() => keyFile.el?.click()}><Icon.upload /> {tr("ui.seal.load-private-key", "Load private key…")}</button>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="sp-sec">
        <div className="sp-sec-t">{tr("ui.seal.keys-you-have-named", "Keys you have named")}</div>
        {ring.length === 0 && <p className="meta">{tr("ui.seal.none-yet-name-a", "None yet. Name a key from a seal, or load someone's public-key file.")}</p>}
        {ring.map((k) => (
          <div className="sp-ring-row" key={k.kid}>
            <span className="mono">{k.kid}</span><span>{k.name}</span>
            <button className="btn ghost sm danger" title={tr("ui.seal.forget-this-key", "Forget this key")}
              onClick={() => { forgetKey(k.kid); changed(); }}><Icon.trash /></button>
          </div>
        ))}
        <div className="sp-acts">
          <button className="btn sm" onClick={() => pubFile.el?.click()}><Icon.upload /> {tr("ui.seal.add-someone-s-public", "Add someone's public key…")}</button>
        </div>
      </div>

      {/* A public key arrives carrying a name its sender chose. Naming it is the reader's
          own act, and that name is what the ring is read by afterwards. */}
      {pending && (
        <div className="sp-sec">
          <div className="sp-sec-t">{tr("ui.seal.name-this-key", "Name this key")}</div>
          <div className="sp-fp mono">{pending.kid}</div>
          <div className="sp-acts">
            <input value={named} onChange={(e) => setNamed(e.target.value)}
              placeholder={tr("ui.keys.who-it-belongs-to", "who it belongs to")} style={{ maxWidth: 260 }} />
            <button className="btn sm primary" onClick={keepPublic}>{tr("ui.keys.keep", "Keep")}</button>
            <button className="btn ghost sm" onClick={() => { setPending(null); setNamed(""); }}>{tr("ui.keys.discard", "Discard")}</button>
          </div>
        </div>
      )}

      {msg && <p className="hint">{msg}</p>}
      <input ref={(el) => { keyFile.el = el; }} type="file" accept=".json" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadKey(f); e.target.value = ""; }} />
      <input ref={(el) => { pubFile.el = el; }} type="file" accept=".json" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadPublic(f); e.target.value = ""; }} />
      <span hidden>{tick}</span>
    </>
  );
}
