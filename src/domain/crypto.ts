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
