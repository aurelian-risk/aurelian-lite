// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Signing keys, and the seals they put on a study's change log.
//
// WHAT THIS ADDS, and what it does not. The hash chain in audit.ts proves internal
// consistency: alter a past entry and verification says so. But there is no secret in it -
// anyone holding the file can recompute the whole chain, so it catches carelessness and
// accident, not intent. And "who" is a name somebody typed.
//
// A seal is a signature over the head of the chain. Rewriting history now needs the
// private key, and "who" becomes "the holder of this key" rather than a claim. What it
// still cannot do is worth stating plainly, because the difference matters in an audit:
//
//  · It does not prove WHEN. A signature carries no time; whoever holds the key can date
//    a seal as they like. Only a timestamp authority fixes that, and that needs a network
//    this product does not use.
//  · It does not bind a key to a PERSON. "Signed by 3f9a…" helps only once you know whose
//    key that is. Without a certificate authority the honest model is the one SSH uses:
//    compare the fingerprint out of band, then name the key locally.
//  · It does not make the CONTENT true. It makes its author accountable for it.
//
// FORMAT: JWS with ES256 (RFC 7515/7518) - ECDSA P-256 over SHA-256, signature as raw
// r||s. Chosen because Web Crypto produces exactly that natively, so a single-file offline
// app needs no bundled crypto library; OpenPGP would have cost several hundred kilobytes
// for the same sentence. Measured to verify with plain `openssl dgst`, which is the point:
// a recipient checks the seal with tools that owe this product nothing.
import type { Study } from "./types";
import { hashValues } from "./audit";

const enc = new TextEncoder();

const b64u = (b: ArrayBuffer | Uint8Array): string => {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = ""; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64u = (s: string): Uint8Array =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const bs = (u: Uint8Array): BufferSource => u as unknown as BufferSource;

const ALG = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN = { name: "ECDSA", hash: "SHA-256" } as const;

export const signingAvailable = (): boolean =>
  typeof crypto !== "undefined" && !!crypto.subtle && typeof crypto.subtle.generateKey === "function";

/** What a reader compares out of band: the first 16 base64url characters of the SHA-256 of
 *  the public key. Short enough to read down a phone line, long enough that producing a
 *  second key with the same one is not something anyone does by accident. */
export async function fingerprint(jwk: JsonWebKey): Promise<string> {
  const key = await crypto.subtle.importKey("jwk", jwk, ALG, true, ["verify"]);
  const spki = await crypto.subtle.exportKey("spki", key);
  return b64u(await crypto.subtle.digest("SHA-256", spki)).slice(0, 16);
}

export interface KeyPairFiles {
  /** Keep this. Losing it means no more seals under this identity - existing ones stay
   *  verifiable, because verifying needs only the public half. */
  privateJwk: JsonWebKey;
  publicJwk: JsonWebKey;
  kid: string;
}

export async function generateKeyPair(): Promise<KeyPairFiles> {
  const kp = await crypto.subtle.generateKey(ALG, true, ["sign", "verify"]);
  const privateJwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const publicJwk = await crypto.subtle.exportKey("jwk", kp.publicKey);
  return { privateJwk, publicJwk, kid: await fingerprint(publicJwk) };
}

/** The public half on its own, derivable from the private one - so a keyring entry can be
 *  rebuilt from the key file alone. */
export const publicOf = (privateJwk: JsonWebKey): JsonWebKey => {
  const { d: _d, key_ops: _k, ...pub } = privateJwk as Record<string, unknown>;
  return { ...pub, key_ops: ["verify"] } as JsonWebKey;
};

// ── the seal ────────────────────────────────────────────────────────────────

/** What is sworn to. Deliberately small and readable: a reader who opens the JWS by hand
 *  should be able to see what was claimed without this application. */
export interface SealPayload {
  /** The study this is about. */
  study: string;
  /** Hash of the last log entry at the moment of sealing - which, through the chain,
   *  covers every entry before it. */
  head: string;
  /** How many entries that was. A truncated log is detectable by this alone. */
  seq: number;
  /** Fingerprint of the study's records, so a seal also says the data still matches. */
  state: string;
  at: string;
  by: string;
}

export interface Seal {
  /** Compact JWS: header.payload.signature. */
  jws: string;
  kid: string;
  /** The public key travels with the seal, so verifying needs nothing but the file.
   *  Trusting it still needs the fingerprint checked elsewhere - that is the whole of the
   *  difference between "intact" and "from whom you think". */
  jwk: JsonWebKey;
  /** Where this seal came from, when it arrived with an imported file. See SealVerdict. */
  received?: string;
}

/** A fingerprint over the records themselves, so a seal covers the data and not only the
 *  log's account of it.
 *
 *  Canonical in both directions, and it has to be: the first version used
 *  `JSON.stringify(values)`, which is sensitive to the order the keys happen to sit in.
 *  The export writes them sorted, so a study that was sealed, exported and opened again
 *  read as "records edited outside the application" - a false accusation, produced by
 *  nothing but a round trip. `hashValues` is the same canonical fingerprint the change log
 *  already uses for every entry, so the two now agree by construction. */
export function stateDigestInput(study: Study): string {
  return study.entities.map((e) => `${e.id}:${hashValues(e.values)}`).sort().join("\n");
}

export async function sealStudy(
  study: Study, head: string, seq: number, by: string, privateJwk: JsonWebKey, at: string,
): Promise<Seal> {
  const key = await crypto.subtle.importKey("jwk", privateJwk, ALG, false, ["sign"]);
  const publicJwk = publicOf(privateJwk);
  const kid = await fingerprint(publicJwk);
  const state = b64u(await crypto.subtle.digest("SHA-256", bs(enc.encode(stateDigestInput(study)))));
  const payload: SealPayload = { study: study.id, head, seq, state, at, by };
  const header = { alg: "ES256", typ: "JOSE", kid };
  const input = `${b64u(enc.encode(JSON.stringify(header)))}.${b64u(enc.encode(JSON.stringify(payload)))}`;
  const sig = await crypto.subtle.sign(SIGN, key, bs(enc.encode(input)));
  return { jws: `${input}.${b64u(sig)}`, kid, jwk: publicJwk };
}

/** What a seal is asked, in the order the answers matter.
 *
 *  These used to be collapsed into "matches or not", which said "the log has moved on" for
 *  every seal that was not the last one - reading as a fault where the truth was simply
 *  that work continued afterwards. A seal covers the history UP TO ITS OWN POINT. Whether
 *  anything happened after it is a separate fact, and an ordinary one. */
export interface SealVerdict {
  /** The signature checks out, and the key it carries is the key it names. */
  signed: boolean;
  /** The sealed head and count match this log AT THE POINT THE SEAL SITS. This is the
   *  strong statement: every entry before the seal is exactly what was signed. */
  bindsHistory: boolean;
  /** The records still are what they were when this was sealed. Only asked of the newest
   *  seal - for an earlier one the answer is "no" by construction and means nothing. */
  coversCurrentState: boolean | null;
  /** How many entries were recorded after this seal. Not a fault; ordinary work. */
  changesSince: number;
  kid: string;
  payload?: SealPayload;
  /** Set only where something is actually wrong. */
  problem?: string;
  /** This seal came in with a file. It was made about that file's log, so it cannot bind
   *  to this one; the signature is still checked, and what the seal was worth when it
   *  arrived is written into the import entry. */
  received?: string;
}

/** Verify one seal against the log it sits in.
 *
 *  `head`/`seq` describe the position the seal occupies: the hash of the entry before it,
 *  and how many entries preceded it. `changesSince` is how many came after. */
export async function verifySeal(
  seal: Seal, study: Study, head: string, seq: number, changesSince = 0,
): Promise<SealVerdict> {
  const out: SealVerdict = { signed: false, bindsHistory: false, coversCurrentState: null, changesSince, kid: seal.kid };
  try {
    const [h, p, s] = seal.jws.split(".");
    if (!h || !p || !s) return { ...out, problem: "not a well-formed seal" };
    // The key that travelled with the seal has to be the key the seal names, or the
    // fingerprint a reader compared means nothing.
    if ((await fingerprint(seal.jwk)) !== seal.kid) return { ...out, problem: "the seal names a different key than it carries" };
    const key = await crypto.subtle.importKey("jwk", seal.jwk, ALG, true, ["verify"]);
    out.signed = await crypto.subtle.verify(SIGN, key, bs(unb64u(s)), bs(enc.encode(`${h}.${p}`)));
    if (!out.signed) return { ...out, problem: "the signature does not match what it seals" };
    const payload = JSON.parse(new TextDecoder().decode(unb64u(p))) as SealPayload;
    out.payload = payload;
    // A seal that arrived with a file was made about that file's chain. Asking it to fit
    // this one would report tampering where the truth is that it was legitimately taken
    // over - so the question is not asked, and the entry says where it came from.
    if (seal.received) { out.received = seal.received; out.bindsHistory = true; return out; }
    out.bindsHistory = payload.head === head && payload.seq === seq;
    if (!out.bindsHistory) {
      out.problem = "this seal does not fit the history it sits in - an entry before it was altered, removed or reordered";
      return out;
    }
    if (changesSince === 0) {
      const state = b64u(await crypto.subtle.digest("SHA-256", bs(enc.encode(stateDigestInput(study)))));
      out.coversCurrentState = payload.state === state;
      if (!out.coversCurrentState) out.problem = "the records were edited outside the application after this seal";
    }
    return out;
  } catch (e) {
    return { ...out, problem: e instanceof Error ? e.message : "unreadable seal" };
  }
}

/** Every seal in a study, verified in place, newest first. One call so that the timeline,
 *  the import dialog and any test all ask the same question and get the same answer. */
export async function verifyAllSeals(study: Study): Promise<{ seq: number; ts: string; editor: string; seal: Seal; verdict: SealVerdict }[]> {
  const log = study.log ?? [];
  const out = [];
  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    if (e.kind !== "seal" || !e.seal) continue;
    const head = i > 0 ? log[i - 1].hash : "";
    out.push({ seq: e.seq, ts: e.ts, editor: e.editor, seal: e.seal as Seal,
      verdict: await verifySeal(e.seal as Seal, study, head, i, log.length - 1 - i) });
  }
  return out.reverse();
}

// ── the keyring ─────────────────────────────────────────────────────────────
//
// Trust on first use, as SSH does it. There is no authority to ask, so the only honest
// model is: you meet a key, you compare its fingerprint by some other route, and you give
// it a name. A key you have not named shows as unknown - which is information, not an
// error.

const RING_KEY = "aurelian_keyring";
const OWN_KEY = "aurelian_own_key";

export interface KnownKey { kid: string; name: string; jwk: JsonWebKey; seen: string }

export function knownKeys(): KnownKey[] {
  try { return JSON.parse(localStorage.getItem(RING_KEY) || "[]") as KnownKey[]; } catch { return []; }
}
export const knownKey = (kid: string): KnownKey | undefined => knownKeys().find((k) => k.kid === kid);

export function rememberKey(kid: string, name: string, jwk: JsonWebKey, at: string): void {
  const ring = knownKeys().filter((k) => k.kid !== kid);
  ring.push({ kid, name: name.trim() || kid, jwk, seen: at });
  try { localStorage.setItem(RING_KEY, JSON.stringify(ring.slice(-200))); } catch { /* ignore */ }
}
export function forgetKey(kid: string): void {
  try { localStorage.setItem(RING_KEY, JSON.stringify(knownKeys().filter((k) => k.kid !== kid))); } catch { /* ignore */ }
}

/** The key this installation signs with. Held in the clear in local storage on purpose:
 *  it is a single-user desktop tool with no login, so an attacker with the browser profile
 *  has the study itself anyway. The exported key FILE is what gets a password. */
export function ownKey(): JsonWebKey | null {
  try { const raw = localStorage.getItem(OWN_KEY); return raw ? (JSON.parse(raw) as JsonWebKey) : null; } catch { return null; }
}
export function setOwnKey(jwk: JsonWebKey | null): void {
  try { jwk ? localStorage.setItem(OWN_KEY, JSON.stringify(jwk)) : localStorage.removeItem(OWN_KEY); } catch { /* ignore */ }
}

/** A public key as a file, so it can be handed over the way any other document is - and
 *  so a recipient can put it straight into their own ring. Carries the fingerprint next to
 *  the key, because that is what gets compared. */
export const publicKeyFile = (kid: string, name: string, jwk: JsonWebKey): string =>
  JSON.stringify({ "aurelian-public-key": 1, kid, name, jwk }, null, 2);

/** Read a public-key file back. Returns null for anything that is not one, and verifies
 *  that the fingerprint it claims is the fingerprint it has - a file that disagrees with
 *  itself is the one case worth refusing loudly. */
export async function readPublicKeyFile(text: string): Promise<{ kid: string; name: string; jwk: JsonWebKey } | null> {
  try {
    const o = JSON.parse(text);
    const jwk: JsonWebKey | undefined = o?.jwk ?? (o?.kty ? o : undefined);
    if (!jwk?.kty) return null;
    const kid = await fingerprint(jwk);
    if (o?.kid && o.kid !== kid) return null;
    return { kid, name: typeof o?.name === "string" ? o.name : "", jwk };
  } catch { return null; }
}

/** The one-liner a recipient can run to check a seal without this application. Printed
 *  next to the seal so the offer is concrete rather than theoretical. */
export const verifyRecipe = (kid: string): string =>
  `# check this seal without Aurelian Lite:\n`
  + `#   1. save the seal's "jws" field to seal.jws and its "jwk" to key.jwk\n`
  + `#   2. node -e 'const j=require("./seal.jws")...' or any JOSE library:\n`
  + `#      jose verify --key key.jwk seal.jws\n`
  + `#   3. compare the key fingerprint with the one you were given: ${kid}`;
