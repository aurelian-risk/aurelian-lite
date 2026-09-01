// SPDX-License-Identifier: MPL-2.0 · Copyright (c) Aurelian-Risk
// Password-based export encryption, self-contained and offline (Web Crypto).
// Strong: PBKDF2-SHA-256 (250k iterations) derives a 256-bit key, AES-256-GCM
// encrypts (authenticated). The envelope carries the salt + iv so only the
// password is needed to open it - nothing is stored anywhere.
const enc = new TextEncoder();
const dec = new TextDecoder();
const ITER = 250_000;

const b64 = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ""; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};
const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
// TS 5.7's Uint8Array is generic over ArrayBufferLike; Web Crypto wants BufferSource.
const bs = (u: Uint8Array): BufferSource => u as unknown as BufferSource;

/** Web Crypto with a real subtle implementation (present on secure contexts,
 *  which includes file:// in Chrome/Firefox). Null when unavailable. */
export const cryptoAvailable = (): boolean =>
  typeof crypto !== "undefined" && !!crypto.subtle && typeof crypto.subtle.deriveKey === "function";

async function deriveKey(password: string, salt: Uint8Array, iter: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", bs(enc.encode(password)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: bs(salt), iterations: iter, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

/** Encrypt plaintext with a password → a self-describing JSON envelope string. */
export async function encryptText(plaintext: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITER);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: bs(iv) }, key, bs(enc.encode(plaintext)));
  return JSON.stringify({
    "ebios-encrypted": 1, cipher: "AES-256-GCM", kdf: "PBKDF2-SHA256", iter: ITER,
    salt: b64(salt), iv: b64(iv), ct: b64(ct),
  }, null, 2);
}

// ── Encrypting to a recipient's key ─────────────────────────────────────────
//
// A password has to reach the recipient somehow, and in practice it travels the same way
// the file does. Encrypting to a public key removes that step: no shared secret, and each
// recipient opens the file with the key they already hold.
//
// One random content key encrypts the study once; it is then wrapped for each recipient
// with a key agreed by ECDH (P-256, an ephemeral key per recipient) and stretched through
// HKDF. Adding a recipient costs one wrapped key, not a second copy of the data.
//
// The recipient list is NOT secret: an envelope says which fingerprints can open it. That
// is a deliberate trade - it lets someone see whether they are on it before trying, and
// hiding it would mean trial-decryption against every key.
const P256 = { name: "ECDH", namedCurve: "P-256" } as const;

async function wrapFor(recipientJwk: JsonWebKey, content: Uint8Array): Promise<{ kid: string; epk: JsonWebKey; iv: string; ct: string }> {
  const pub = await crypto.subtle.importKey("jwk", recipientJwk, P256, true, []);
  const eph = await crypto.subtle.generateKey(P256, true, ["deriveBits"]);
  const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: pub }, eph.privateKey, 256);
  const base = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  const kek = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(16), info: enc.encode("aurelian-recipient-v1") },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: bs(iv) }, kek, bs(content));
  const spki = await crypto.subtle.exportKey("spki", pub);
  const fp = await crypto.subtle.digest("SHA-256", spki);
  const kid = b64(fp).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, 16);
  return { kid, epk: await crypto.subtle.exportKey("jwk", eph.publicKey), iv: b64(iv), ct: b64(ct) };
}

export interface Recipient { kid: string; name?: string; jwk: JsonWebKey }

/** Encrypt once, wrapped for each recipient. */
export async function encryptToRecipients(plaintext: string, recipients: Recipient[]): Promise<string> {
  if (!recipients.length) throw new Error("No recipients: nobody could open this file.");
  const contentKeyRaw = crypto.getRandomValues(new Uint8Array(32));
  const contentKey = await crypto.subtle.importKey("raw", bs(contentKeyRaw), { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: bs(iv) }, contentKey, bs(enc.encode(plaintext)));
  const to = [];
  for (const r of recipients) to.push({ ...(await wrapFor(r.jwk, contentKeyRaw)), name: r.name ?? "" });
  return JSON.stringify({
    "ebios-encrypted": 1, cipher: "AES-256-GCM", kdf: "ECDH-P256+HKDF-SHA256",
    iv: b64(iv), ct: b64(ct), to,
  }, null, 2);
}

/** Open an envelope addressed to a key we hold. Returns null when it is not addressed to
 *  this key at all, which is a different thing from a wrong key and reads differently. */
export async function decryptForKey(envelope: string, privateJwk: JsonWebKey, kid: string): Promise<string | null> {
  const o = JSON.parse(envelope);
  if (!Array.isArray(o?.to)) throw new Error("Not an envelope addressed to a key.");
  const mine = o.to.find((t: { kid: string }) => t.kid === kid);
  if (!mine) return null;
  const priv = await crypto.subtle.importKey("jwk", privateJwk, P256, false, ["deriveBits"]);
  const epk = await crypto.subtle.importKey("jwk", mine.epk, P256, true, []);
  const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: epk }, priv, 256);
  const base = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  const kek = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(16), info: enc.encode("aurelian-recipient-v1") },
    base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bs(unb64(mine.iv)) }, kek, bs(unb64(mine.ct)));
  const contentKey = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bs(unb64(o.iv)) }, contentKey, bs(unb64(o.ct)));
  return dec.decode(pt);
}

/** Who can open this envelope, if it is addressed to keys rather than a password. */
export function envelopeRecipients(envelope: string): { kid: string; name: string }[] {
  try {
    const o = JSON.parse(envelope);
    return Array.isArray(o?.to) ? o.to.map((t: { kid: string; name?: string }) => ({ kid: t.kid, name: t.name ?? "" })) : [];
  } catch { return []; }
}

/** Detect our encrypted envelope (so import can prompt for a password). */
export function isEncrypted(text: string): boolean {
  try { const o = JSON.parse(text); return !!o && o["ebios-encrypted"] === 1 && typeof o.ct === "string"; }
  catch { return false; }
}

/** Decrypt an envelope with a password. Throws on a wrong password (GCM auth fails). */
export async function decryptText(envelope: string, password: string): Promise<string> {
  const o = JSON.parse(envelope);
  if (o?.["ebios-encrypted"] !== 1) throw new Error("Not an encrypted Aurelian export.");
  const key = await deriveKey(password, unb64(o.salt), Number(o.iter) || ITER);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bs(unb64(o.iv)) }, key, bs(unb64(o.ct)));
  return dec.decode(pt);
}


// ── The same two schemes, applied to BYTES ──────────────────────────────────
//
// An archive is not text, and the envelopes above are JSON: putting a 100 MB zip through
// them would mean base64 (a third more) held as one JavaScript string. So the payload
// stays binary and only the HEADER is JSON:
//
//   "AEB1" | uint32 header length | JSON header | ciphertext
//
// The header is the envelope above with `ct` left out, which means `envelopeRecipients`
// and the wrapping code are shared rather than written twice — the part that is easy to
// get subtly wrong exists once. The text envelopes are untouched: files already written
// keep opening exactly as before.
const MAGIC = "AEB1";

function frame(header: object, ct: ArrayBuffer): Uint8Array {
  const h = enc.encode(JSON.stringify(header));
  const out = new Uint8Array(4 + 4 + h.length + ct.byteLength);
  out.set(enc.encode(MAGIC), 0);
  new DataView(out.buffer).setUint32(4, h.length, true);
  out.set(h, 8);
  out.set(new Uint8Array(ct), 8 + h.length);
  return out;
}

function unframe(buf: Uint8Array): { header: Record<string, unknown>; ct: Uint8Array } {
  if (!isEncryptedBytes(buf)) throw new Error("Not an encrypted Aurelian archive.");
  const len = new DataView(buf.buffer, buf.byteOffset).getUint32(4, true);
  const header = JSON.parse(dec.decode(buf.subarray(8, 8 + len))) as Record<string, unknown>;
  return { header, ct: buf.subarray(8 + len) };
}

/** Is this a binary envelope? The first four bytes say so. */
export function isEncryptedBytes(buf: Uint8Array): boolean {
  return buf.length > 8 && dec.decode(buf.subarray(0, 4)) === MAGIC;
}

/** Encrypt bytes with a password. */
export async function encryptBytes(data: Uint8Array, password: string): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITER);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: bs(iv) }, key, bs(data));
  return frame({ "ebios-encrypted": 1, cipher: "AES-256-GCM", kdf: "PBKDF2-SHA256", iter: ITER,
    salt: b64(salt), iv: b64(iv) }, ct);
}

/** Decrypt bytes with a password. Throws on a wrong one (GCM authentication fails). */
export async function decryptBytes(buf: Uint8Array, password: string): Promise<Uint8Array> {
  const { header, ct } = unframe(buf);
  if (header["ebios-encrypted"] !== 1) throw new Error("Not an encrypted Aurelian archive.");
  if (!header.salt) throw new Error("This archive is addressed to a key, not a password.");
  const key = await deriveKey(password, unb64(String(header.salt)), Number(header.iter) || ITER);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bs(unb64(String(header.iv))) }, key, bs(ct));
  return new Uint8Array(pt);
}

/** Encrypt bytes once, wrapped for each recipient. */
export async function encryptBytesToRecipients(data: Uint8Array, recipients: Recipient[]): Promise<Uint8Array> {
  if (!recipients.length) throw new Error("No recipients: nobody could open this file.");
  const contentKeyRaw = crypto.getRandomValues(new Uint8Array(32));
  const contentKey = await crypto.subtle.importKey("raw", bs(contentKeyRaw), { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: bs(iv) }, contentKey, bs(data));
  const to = [];
  for (const r of recipients) to.push({ ...(await wrapFor(r.jwk, contentKeyRaw)), name: r.name ?? "" });
  return frame({ "ebios-encrypted": 1, cipher: "AES-256-GCM", kdf: "ECDH-P256+HKDF-SHA256", iv: b64(iv), to }, ct);
}

/** Open a binary envelope addressed to a key we hold. Null when it is not addressed to
 *  this key — a different thing from a wrong key, and it reads differently. */
export async function decryptBytesForKey(buf: Uint8Array, privateJwk: JsonWebKey, kid: string): Promise<Uint8Array | null> {
  const { header, ct } = unframe(buf);
  const list = header.to as { kid: string; epk: JsonWebKey; iv: string; ct: string }[] | undefined;
  if (!Array.isArray(list)) throw new Error("Not an archive addressed to a key.");
  const mine = list.find((t) => t.kid === kid);
  if (!mine) return null;
  const priv = await crypto.subtle.importKey("jwk", privateJwk, P256, false, ["deriveBits"]);
  const epk = await crypto.subtle.importKey("jwk", mine.epk, P256, true, []);
  const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: epk }, priv, 256);
  const base = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  const kek = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(16), info: enc.encode("aurelian-recipient-v1") },
    base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bs(unb64(mine.iv)) }, kek, bs(unb64(mine.ct)));
  const contentKey = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bs(unb64(String(header.iv))) }, contentKey, bs(ct));
  return new Uint8Array(pt);
}

/** Who can open a binary envelope. */
export function bytesEnvelopeRecipients(buf: Uint8Array): { kid: string; name: string }[] {
  try {
    const { header } = unframe(buf);
    const list = header.to as { kid: string; name?: string }[] | undefined;
    return Array.isArray(list) ? list.map((t) => ({ kid: t.kid, name: t.name ?? "" })) : [];
  } catch { return []; }
}
