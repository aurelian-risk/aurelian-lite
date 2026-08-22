# Seals, keys and encrypted exports

Status: **built and measured**, 2026-08-22 · Scope: main repo and mirror · Audience: whoever
maintains this, and whoever has to defend an analysis produced with it

This paper says what the signing work proves, what it does not, and why each choice was
made the way it was. The limits are the important part: a seal that is believed to say more
than it does is worse than no seal, because it invites trust it has not earned.

---

## 1. The gap this closes

`audit.ts` keeps one hash-chained log per study. Each entry covers the previous entry's
hash, and each carries a fingerprint of the record's values, so:

- altering a past entry breaks the chain from that point on, and verification says where;
- editing a record outside the application leaves the chain intact but no longer matching,
  and verification says which records drifted.

That is real and it is useful. But **there is no secret in it.** Anyone holding the file can
recompute the whole chain. It therefore detects carelessness, accident and a naive edit —
not someone who means it. A determined editor rewrites the history and re-chains it, and
verification reports "integrity verified".

And `editor` is a name somebody typed. `MATURITY.md` has always said so: *any "author"
attribution is a self-declared name, not a verified identity.*

**A seal changes both.** It is a signature over the head of the chain. Rewriting anything
recorded before it now requires the private key, and "who" becomes "the holder of this key"
rather than a claim in a text field.

---

## 2. What a seal does not prove

Stated here, in the interface, and in `MATURITY.md`, because each of these has been
mistaken for something a signature provides.

**It does not prove when.** A signature carries no time. Whoever holds the key can date a
seal as they like. Fixing that needs a timestamp authority, which needs a network this
product deliberately does not use. The `at` field in a seal is a claim by its author, no
better than the `ts` on any other entry.

**It does not bind a key to a person.** "Signed by `3f9a…`" helps only once you know whose
key that is. There is no certificate authority to ask, and inventing one offline is not
possible. The honest model is the one SSH uses: compare the fingerprint by some route other
than the file itself, then name the key locally. A key nobody has named shows as *unknown* —
which is information, not an error.

**It does not make the content true.** It makes its author accountable for it. The question
shifts from "was this file altered" to "who stands behind it", which in a risk assessment is
the more useful sentence — but it is a different sentence.

**It does not protect the private key from whoever has the machine.** The signing key is
held in local storage in the clear, because this is a single-user desktop tool with no login:
an attacker with the browser profile already has the study. The exported key *file* is what
gets a password.

---

## 3. Why JWS/ES256, and why not OpenPGP

The obvious choice is PGP: everybody has `gpg`, there are key servers, it has been there for
decades. It was rejected for one measured reason and one design reason.

**Web Crypto cannot do OpenPGP.** It would mean bundling an implementation — several hundred
kilobytes into a file that is 2.5 MB — for a feature most readers will never use. That
contradicts the premise of the product. Beyond the size: armored keys, subkeys, expiry,
revocation certificates and the web of trust are an apparatus built for mail between
strangers, not for "this study is mine".

**JWS with ES256** (RFC 7515 / 7518) is ECDSA P-256 over SHA-256, with the signature as raw
`r||s`. Measured facts behind the choice (`harness/pubkey-probe.mjs`, both engines,
`file://`):

| | Chromium | Firefox |
|---|---|---|
| secure context on `file://` | yes | yes |
| ECDSA P-256 sign + verify | 1 ms, 64 B | 2 ms, 64 B |
| private key export/import (JWK) | 206 B | 220 B |
| public key (SPKI) + fingerprint | 91 B | 91 B |
| ECDH agree + HKDF | yes | yes |
| Ed25519 / X25519 | available | available |

Web Crypto produces exactly the `r||s` form JWS wants, so **no library is bundled at all**.
Ed25519 would be shorter and is present in both engines tested, but it is not reliably
present everywhere; P-256 is the one that is never missing.

**The point of a standard is the outside opinion.** `harness/sig-interop.mjs` signs in the
browser and then verifies with `openssl dgst`, which knows nothing about this application:

```
✓ Web Crypto signs in the raw r||s form JWS wants  (64 B)
✓ the public key comes out as a JWK the same as any other implementation
✓ openssl verifies the seal, knowing nothing about this app  (Verified OK)
✓ ...and rejects it once a character changes
```

A recipient can therefore check a seal with tools they already trust — which is the whole
reason to sign anything.

---

## 4. How a seal is built

```
header   { "alg": "ES256", "typ": "JOSE", "kid": <fingerprint> }
payload  { study, head, seq, state, at, by }
```

- **`head`** — the hash of the last log entry at the moment of sealing. Through the chain,
  that covers every entry before it.
- **`seq`** — how many entries that was. A log truncated at the end is detectable by this
  alone, which a bare chain cannot do.
- **`state`** — SHA-256 over every record's id and values, sorted. So a seal covers the
  **data**, not only the log's account of it. Order-independent, so re-exporting cannot
  change it.

**Granularity: seal points, not entries.** Signing every change would be a signature per
keystroke — expensive, noisy, and no more informative. A seal is written when someone asks
for one, and covers everything before it.

**A seal is a log entry** (`kind: "seal"`). The next change chains onto it, and a later seal
covers the earlier ones. Its own hash covers the signature it carries, so swapping one
signature for another breaks the chain — asserted in `harness/crypto-test.mjs`.

One migration detail worth keeping: `payloadOf` adds the seal to the hashed payload **only
when one is present**. Adding the key unconditionally — even as `null` — would have changed
the hash of every entry ever written. `npm run test:audit` (50/50) is what proves it did not.

**Three verdicts, not one.** A seal can be genuine and still not describe the study any more,
and the two must read differently:

| verdict | means |
|---|---|
| sealed and unchanged | signature valid, log head matches, records match |
| sealed, then changed | signature valid, but work continued or a record drifted |
| does not check out | the signature does not verify, or the key does not match the name |

---

## 5. Encrypting to a key instead of a password

The existing password mode (PBKDF2-SHA-256, 250 000 iterations, AES-256-GCM) is
cryptographically fine. Its weakness is **key distribution**: a password has to reach the
recipient somehow, and in practice it travels the same way the file does.

Addressing a file to a public key removes that step. One random content key encrypts the
study once; it is then wrapped for each recipient with a key agreed by ECDH (P-256,
ephemeral per recipient) and stretched through HKDF-SHA-256.

**The recipient list is not secret.** An envelope names the fingerprints that can open it.
That is a deliberate trade: it lets someone see whether a file is for them before trying,
and hiding it would mean trial decryption against every key held. Where that matters, the
password mode is still there.

Measured costs (`harness/crypto-test.mjs`, both engines):

- a 72 kB study becomes a 97 kB envelope — **×1.34**, which is base64 inside JSON and applies
  to the password mode equally;
- a **second recipient costs 413 bytes**, not a second copy of the study.

Refusals asserted, because a cipher that accepts everything protects nothing: a stranger not
on the list is told so rather than given a failure; the wrong private key for an addressed
slot is refused; a single flipped byte in the ciphertext is refused.

---

## 6. Losing a key

**A lost signing key does not make anything unreadable.** Verifying needs only the public
half, which travels with each seal. What is lost is the ability to seal as that identity
again.

**A lost recipient key does make an envelope unreadable** — permanently, by anyone. That is
worse than a forgotten password, because a password can come back to you. The interface says
so before a key is created, and the key file is offered with a password precisely so it can
be kept somewhere a browser profile is not.

---

## 7. What was measured

Every number in this paper comes from a run that can be repeated. `npm run test:audit`
covers the chain, including the proof that adding seals did not renumber the past. The
signing, envelope and performance runs live in the development harness, which is not part
of the published tree.

Performance on the sample study, median of repeated runs:

| | Chromium | Firefox | budget |
|---|---|---|---|
| seal the study | 126 ms | 296 ms | 1500 ms |
| verify every seal (on entering the timeline) | 110 ms | 218 ms | 800 ms |
| encrypt 230 kB to a key | 0.8 ms | 3.0 ms | 2500 ms |

Sealing hashes every record and signs once; it is well inside what a deliberate action can
cost. Verification runs on entering the Timeline, which is why it has the tighter budget.

---

## 8. Deliberately not done

**A timestamp authority.** It is the only thing that would make a seal prove *when*, and it
needs a network. Recording the limitation is more honest than a local clock pretending to be
evidence.

**A key server or web of trust.** Both are answers to "whose key is this" for strangers at
scale. For a tool where the parties know each other and can compare a fingerprint by phone,
trust on first use is the smaller and more honest mechanism.

**Signing every log entry.** A signature per change would make the log several times larger
and say nothing a seal point does not.

**Encrypting the recipient list.** See §5.
