// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Signing keys and the seals they put on a study.
//
// The hash chain says a log is internally consistent. It cannot say who wrote it, because
// there is no secret in it - anyone with the file can recompute the whole thing. A seal
// signs the head of the chain, so rewriting the past needs the private key, and "who"
// stops being a name somebody typed.
//
// The limits are said here, in the interface, not only in the documentation: a reader who
// sees "sealed" has to know what that does and does not buy.
import { useEffect, useState } from "react";
import { useActiveStudy, useStore } from "../domain/store";
import { verifyLog } from "../domain/audit";
import {
  fingerprint, forgetKey, generateKeyPair, knownKey, knownKeys, ownKey, publicOf,
  rememberKey, setOwnKey, signingAvailable, verifySeal, type Seal, type SealVerdict,
} from "../domain/keys";
import { downloadText } from "../domain/clipboard";
import { encryptText, decryptText } from "../domain/crypto";
import { Icon } from "./ui";

export function SealPanel() {
  const study = useActiveStudy();
  const sealActive = useStore((s) => s.sealActive);
  const [, bump] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [mine, setMine] = useState<JsonWebKey | null>(null);
  const [kid, setKid] = useState("");
  const [verdicts, setVerdicts] = useState<Record<number, SealVerdict>>({});
  const [naming, setNaming] = useState<{ kid: string; jwk: JsonWebKey } | null>(null);
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const fileRef = useState<{ el: HTMLInputElement | null }>({ el: null })[0];

  useEffect(() => {
    const k = ownKey();
    setMine(k);
    if (k) fingerprint(publicOf(k)).then(setKid).catch(() => setKid(""));
  }, [busy]);

  // Every seal in the log, checked against the study as it stands now. A seal that was
  // genuine when made can still be stale, and the two read differently.
  const seals = (study?.log ?? []).map((e, i) => ({ e, i })).filter((x) => x.e.kind === "seal" && x.e.seal);
  useEffect(() => {
    if (!study) return;
    let live = true;
    const log = study.log ?? [];
    (async () => {
      const out: Record<number, SealVerdict> = {};
      for (const { e, i } of seals) {
        // A seal covers the log AS IT STOOD when it was written: everything before it.
        const head = i > 0 ? log[i - 1].hash : "";
        out[e.seq] = await verifySeal(e.seal as Seal, study, head, i);
      }
      if (live) setVerdicts(out);
    })();
    return () => { live = false; };
  }, [study, seals.length]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!study) return null;
  if (!signingAvailable()) {
    return <div className="guide warn">This browser exposes no Web Crypto, so studies cannot be sealed here.</div>;
  }

  const makeKey = async () => {
    setBusy(true);
    try {
      const kp = await generateKeyPair();
      setOwnKey(kp.privateJwk);
      rememberKey(kp.kid, "this installation", kp.publicJwk, new Date().toISOString());
      setMsg(`New signing key ${kp.kid}. Save it to a file — if it is lost, nothing you sealed becomes unreadable, but you cannot seal as this identity again.`);
    } catch (e) { setMsg("Could not create a key: " + (e instanceof Error ? e.message : String(e))); }
    setBusy(false);
  };

  const saveKey = async () => {
    if (!mine) return;
    if (!pw) { setMsg("Give the key file a password first — an unprotected private key in a downloads folder is not a key."); return; }
    setBusy(true);
    try {
      downloadText("aurelian-signing-key.json", await encryptText(JSON.stringify(mine), pw), "application/json");
      setMsg("Key saved, encrypted with that password. Keep both, and keep them apart.");
      setPw("");
    } catch (e) { setMsg("Could not save: " + (e instanceof Error ? e.message : String(e))); }
    setBusy(false);
  };

  const loadKey = async (file: File) => {
    setBusy(true);
    try {
      const jwk = JSON.parse(await decryptText(await file.text(), pw)) as JsonWebKey;
      setOwnKey(jwk);
      const fp = await fingerprint(publicOf(jwk));
      rememberKey(fp, "this installation", publicOf(jwk), new Date().toISOString());
      setMsg(`Key ${fp} loaded.`);
      setPw("");
    } catch { setMsg("Not a key file, or the wrong password."); }
    setBusy(false);
  };

  const seal = async () => {
    setBusy(true);
    const editor = (study.log ?? []).slice(-1)[0]?.editor || "";
    const who = window.prompt("Seal this study as:", editor || "") ?? "";
    if (!who.trim()) { setBusy(false); return; }
    const k = await sealActive(who.trim());
    setMsg(k ? `Sealed with ${k}. Anything changed after this shows the seal as stale, not as broken.` : "Nothing to seal.");
    setBusy(false);
  };

  const copyPublic = async () => {
    if (!mine) return;
    await navigator.clipboard?.writeText(JSON.stringify({ kid, jwk: publicOf(mine) }, null, 2)).catch(() => {});
    setMsg("Public key copied. Send it however you like — it is not a secret. What matters is that the other side compares the fingerprint by some route other than this file.");
  };

  const logLen = (study.log ?? []).length;
  const chain = verifyLog(study.log, study.entities);

  return (
    <div className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-head">
        <h3>Seals</h3>
        {kid ? <span className="badge mono">{kid}</span> : <span className="badge">no key</span>}
        <span className="spacer" />
        <button className="btn sm primary" disabled={busy || !mine || !logLen} onClick={seal}>
          <Icon.check /> Seal this study
        </button>
      </div>
      <div className="panel-body" style={{ padding: "10px 14px 14px" }}>
        <div className="guide" style={{ marginTop: 0 }}>
          A seal signs the head of the change log, so altering anything recorded before it
          needs the private key. It does <strong>not</strong> prove when it was made — a
          signature carries no time — and it does not prove <em>who</em> beyond “the holder
          of this key”. Compare a fingerprint by another route before you believe a name.
        </div>

        <div className="sp-keys">
          {mine ? (
            <>
              <span className="meta">Signing as <span className="mono">{kid}</span></span>
              <input type="password" placeholder="password for the key file" value={pw} onChange={(e) => setPw(e.target.value)} style={{ maxWidth: 220 }} />
              <button className="btn sm" disabled={busy} onClick={saveKey}><Icon.download /> Save key…</button>
              <button className="btn sm ghost" disabled={busy} onClick={copyPublic}>Copy public key</button>
            </>
          ) : (
            <>
              <span className="meta">No signing key on this installation.</span>
              <button className="btn sm primary" disabled={busy} onClick={makeKey}><Icon.plus /> Create one</button>
              <input type="password" placeholder="password of an existing key file" value={pw} onChange={(e) => setPw(e.target.value)} style={{ maxWidth: 240 }} />
              <button className="btn sm" disabled={busy} onClick={() => fileRef.el?.click()}><Icon.upload /> Load key…</button>
            </>
          )}
          <input ref={(el) => { fileRef.el = el; }} type="file" accept=".json" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) loadKey(f); e.target.value = ""; }} />
        </div>
        {msg && <p className="hint" style={{ marginTop: 8 }}>{msg}</p>}

        {seals.length > 0 && (
          <div className="sp-list">
            {seals.slice().reverse().map(({ e }) => {
              const v = verdicts[e.seq];
              const who = knownKey(e.seal!.kid);
              const state = !v ? "checking" : !v.signed ? "bad" : v.matchesLog && v.matchesData ? "ok" : "stale";
              return (
                <div className={"sp-seal sp-" + state} key={e.seq}>
                  <span className="sp-dot" />
                  <div className="sp-seal-main">
                    <div className="sp-seal-t">
                      {state === "ok" ? "Sealed and unchanged since"
                        : state === "stale" ? "Sealed, then changed"
                        : state === "bad" ? "This seal does not check out" : "Checking…"}
                      <span className="mono sp-kid">{e.seal!.kid}</span>
                      {who ? <span className="badge">{who.name}</span>
                        : <button className="btn ghost sm" onClick={() => { setNaming({ kid: e.seal!.kid, jwk: e.seal!.jwk }); setName(""); }}>unknown key — name it</button>}
                    </div>
                    <div className="meta">
                      {new Date(e.ts).toLocaleString()} · by {e.editor || "—"}
                      {v?.reason ? ` · ${v.reason}` : ""}
                      {v?.payload ? ` · covers ${v.payload.seq} entries` : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!chain.ok && seals.length > 0 && (
          <p className="hint">The log itself does not verify, so a seal on it can only tell you what was true before the break.</p>
        )}

        {naming && (
          <div className="sp-name">
            <span className="meta">Name the key <span className="mono">{naming.kid}</span> — only after you have compared that fingerprint by some other route.</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dr. Weber, external auditor" style={{ maxWidth: 260 }} />
            <button className="btn sm primary" disabled={!name.trim()} onClick={() => { rememberKey(naming.kid, name, naming.jwk, new Date().toISOString()); setNaming(null); bump((n) => n + 1); }}>Trust it</button>
            <button className="btn sm ghost" onClick={() => setNaming(null)}>Cancel</button>
          </div>
        )}

        {knownKeys().length > 0 && (
          <details className="sp-ring">
            <summary>Keys you have named ({knownKeys().length})</summary>
            {knownKeys().map((k) => (
              <div className="sp-ring-row" key={k.kid}>
                <span className="mono">{k.kid}</span><span>{k.name}</span>
                <button className="btn ghost sm danger" onClick={() => { forgetKey(k.kid); bump((n) => n + 1); }}><Icon.trash /></button>
              </div>
            ))}
          </details>
        )}
      </div>
    </div>
  );
}
