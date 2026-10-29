# Encryptee v2: research report on streaming encryption, age interop, performance, KDFs, passkeys and metadata

Status as of 2026-10-29. I read source code directly where I could: Chromium/BoringSSL, Firefox/NSS and WebKit on HEAD/main, typage `main`, Gerrit commits, and MDN browser-compat-data (BCD) `main`. Anything I could not confirm from a primary source is marked **[unverified]**. Numbers I worked out myself are marked **[derived]**.

---

## TL;DR

- **The fix for v1's flaws is well established.** Derive one key per file, use a counter nonce for each chunk, and set a "last chunk" flag. age, Tink, STREAM and RFC 9580 all work this way, and it closes v1's reordering, dropping and truncation gaps.
- **Encryptee can adopt age v1 and stay CLI-compatible.** typage 0.3.1 (2026-08-28) supports Web Streams, scrypt, X25519, ML-KEM hybrid and WebAuthn PRF recipients.
  - Its payload cipher is pure-JS ChaCha20-Poly1305 from `@noble/ciphers`. It runs on one thread with chunks fixed at 64 KiB.
  - A scrypt (passphrase) recipient must be the *only* recipient in a file.
- **Chromium changed its WebCrypto threading.** Since Chrome 141, `encrypt`/`decrypt` run synchronously on the calling thread. They used to be sent to a single "WebCrypto" thread per renderer process. So in current Chrome, N workers scale, and calling from the main thread blocks the UI.
- **Native algorithm support changed in Chrome 155 (stable 2026-10-06).** It enabled ChaCha20-Poly1305, ML-KEM, ML-DSA and X-Wing in WebCrypto by default.
  - Firefox only has ML-KEM, behind a Nightly-only pref. WebKit has none of these.
  - No browser implements Argon2 in WebCrypto. It exists only in the WICG draft.
- **WebAuthn Level 3, which includes PRF, became a W3C Recommendation on 2026-08-25.** PRF works in Chrome 116+, Safari 18+, Firefox 139+ and Firefox Android 149+. Microsoft has not documented Windows Hello PRF support.

---

## 1. Streaming AEAD constructions

### 1.1 How the major formats compare

| Construction | Per-file key | Chunk nonce | End-of-stream signal | Chunk size | Source |
|---|---|---|---|---|---|
| **STREAM** (Hoang–Reyhanitabar–Rogaway–Vizár) | caller-supplied | `prefix ‖ counter ‖ last_block_flag` (BE32 variant: 32-bit BE counter + 1-byte flag) | flag byte in the nonce | caller | [ePrint 2015/189](https://eprint.iacr.org/2015/189), [RustCrypto aead-stream docs](https://docs.rs/aead-stream/latest/aead_stream/) |
| **age v1 payload** | `HKDF-SHA-256(ikm=file key, salt=16-byte random nonce, info="payload")` | 11-byte BE counter ‖ `0x01` (last) / `0x00` (other) | flag in the nonce; final chunk MUST NOT be empty unless the whole payload is empty | 64 KiB, fixed | [C2SP age spec](https://github.com/C2SP/C2SP/blob/main/age.md) |
| **libsodium secretstream** | caller key; HChaCha20 subkey from a random 192-bit header | `i ‖ n`; after each message `n ^= MAC[0..8]`, `i++` (chained, so sequential only) | encrypted `TAG_FINAL` | caller; 17 B overhead per message | [libsodium docs](https://doc.libsodium.org/secret-key_cryptography/secretstream), [header](https://github.com/jedisct1/libsodium/blob/master/src/libsodium/include/sodium/crypto_secretstream_xchacha20poly1305.h) |
| **Tink AES-GCM-HKDF Streaming** | HKDF(key, random salt, info=associated data) | 7-byte random prefix ‖ 4-byte BE segment index ‖ last-segment byte | flag in the nonce | 1 MB recommended (`AES128_GCM_HKDF_1MB`), or 4 KB | [Tink streaming AEAD](https://developers.google.com/tink/streaming-aead), [key format](https://developers.google.com/tink/streaming-aead/aes_gcm_hkdf_streaming) |
| **RFC 8188** (HTTP aes128gcm) | HKDF(salt, IKM) | base nonce XOR record sequence number | padding delimiter `0x02` on the last record, `0x01` on others | `rs` field in the header | [RFC 8188](https://www.rfc-editor.org/rfc/rfc8188.html) |
| **RFC 9580 SEIPDv2** (OpenPGP) | HKDF(session key, 32-byte salt) | HKDF IV ‖ 64-bit BE chunk index | final summary tag over the total plaintext octet count | `2^(c+6)`, max 4 MiB | [RFC 9580 §5.13.2](https://www.rfc-editor.org/rfc/rfc9580.html#section-5.13.2) |
| **Signal attachments** | n/a | n/a | incremental MAC over chunks of 64 KiB–2 MiB | 64 KiB–2 MiB | [libsignal incremental_mac.rs](https://github.com/signalapp/libsignal/blob/main/rust/protocol/src/incremental_mac.rs) |

### 1.2 Which properties stop reordering, dropping and truncation

1. **Position binding.** The chunk index sits in the nonce (age, Tink, STREAM, RFC 9580) or is chained (secretstream). A chunk moved to another position fails authentication.
   - Tink: segments "are bound to their location within a ciphertext and cannot be removed or reordered" ([Tink](https://developers.google.com/tink/streaming-aead)).
   - The aead-stream docs say STREAM "defends against reordering and truncation attacks" and is proven nOAE-secure in the paper ([docs.rs](https://docs.rs/aead-stream/latest/aead_stream/)).
2. **End-of-stream binding.** This is a last-chunk flag in the nonce (age, Tink, STREAM), a `FINAL` tag (secretstream), a final length-bound tag (RFC 9580), or a distinct last-record delimiter (RFC 8188).
   - age: "Streaming decryption MUST signal an error if the end of file is reached without successfully decrypting a final chunk" ([age spec](https://github.com/C2SP/C2SP/blob/main/age.md)).
   - Tink warns APIs must not "confuse end-of-file and decryption errors" ([Tink](https://developers.google.com/tink/streaming-aead/aes_gcm_hkdf_streaming)).
3. **Per-file key from a fresh random salt or nonce.** This stops chunks from one file being spliced into another, and makes counter nonces safe. Tink: segments from one ciphertext cannot be inserted into another ([Tink](https://developers.google.com/tink/streaming-aead)).
4. **Authenticated header.** age uses an HMAC-SHA-256 header MAC keyed by `HKDF(file key, "header")` ([age spec](https://github.com/C2SP/C2SP/blob/main/age.md)). RFC 9580 passes the version, algorithm and chunk-size octets as AD ([RFC 9580](https://www.rfc-editor.org/rfc/rfc9580.html#section-5.13.2)).
5. **Key commitment for multi-recipient files.** AES-GCM and ChaCha20-Poly1305 are attack targets for "partitioning oracles", which arise when "encryption schemes are not committing with respect to their keys" ([Len–Grubbs–Ristenpart, USENIX Sec '21](https://www.usenix.org/conference/usenixsecurity21/presentation/len)). An HMAC header MAC, as in age, commits the file to its key.

**Parallelism.** Counter-nonce designs let you encrypt or decrypt chunks independently and in parallel, and let you seek; age's Go library added seeking decryption (`DecryptReaderAt`) in v1.3.0 ([release](https://github.com/FiloSottile/age/releases/tag/v1.3.0)). secretstream chains its nonce through the previous MAC, so it is strictly sequential ([libsodium](https://doc.libsodium.org/secret-key_cryptography/secretstream)).

**How v1 maps onto this.** v1 had no index binding (1), no end marker (2) and no version byte. It also ran PBKDF2 once per 50 MiB chunk, which is about 1,000 PBKDF2-100k runs for a 50 GB file **[derived]**.

### 1.3 AES-GCM data limits at 50 GB

- **Per-call size cap.** P_MAX is 2^36 − 31 octets (about 64 GiB) per AEAD invocation ([RFC 5116 §5.1](https://www.rfc-editor.org/rfc/rfc5116.html#section-5.1)). WebCrypto throws if plaintext exceeds 2^39 − 256 ([WebCrypto L2](https://www.w3.org/TR/webcrypto-2/)). Chunking makes both caps irrelevant.
- **Invocation cap.** NIST SP 800-38D §8.3 limits a key to 2^32 invocations *when IVs are random* ([PDF](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf)).
  - **[unverified]** I could not extract the PDF text, so this rests on secondary quotes of §8.3 ([search evidence](https://mta.openssl.org/pipermail/openssl-users/2016-May/003793.html)).
  - With a fresh HKDF-derived key per file and counter nonces, the random-IV collision concern does not apply. A 50 GB file at 1 MiB chunks is about 51,200 invocations **[derived]**.
- **Revision in progress.** SP 800-38D Rev. 1 is still at pre-draft (comments closed 2026-07-31). It proposes removing tags shorter than 96 bits and adding a 256-bit-block wGCM ([NIST](https://csrc.nist.gov/pubs/sp/800/38/d/r1/2prd)).
- **Confidentiality bound.** The CFRG bound is `CA ≤ (s+q+1)²/2^129` ([draft-irtf-cfrg-aead-limits-13, 2026-09-03](https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-aead-limits)). 50 GiB is about 2^31.6 blocks, which gives CA ≈ 2^-65.7, negligible **[derived]**.
- **ChaCha20-Poly1305.** It has no meaningful confidentiality limit beyond ChaCha20's PRF security ([same draft](https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-aead-limits)). The per-nonce limit is about 256 GB ([RFC 8439](https://www.rfc-editor.org/rfc/rfc8439.html)).

---

## 2. age and typage

### 2.1 Versions and release history

| Item | Detail | Source |
|---|---|---|
| typage current version | **0.3.1**, published 2026-08-28 ("Minor compatibility and usability fixes") | [npm registry](https://www.npmjs.com/package/age-encryption), [releases](https://github.com/FiloSottile/typage/releases) |
| 0.3.0 (2025-12-29) | Native post-quantum hybrid recipients, plus tagged recipients compatible with hardware plugins | [typage releases](https://github.com/FiloSottile/typage/releases) |
| 0.2.4 (2025-07-06) | Encrypt/decrypt `ReadableStream`s; `Decrypter.decryptHeader` for detached headers | [typage releases](https://github.com/FiloSottile/typage/releases) |
| 0.2.3 (2025-04-26) | Passkey and security-key support, plus a CLI plugin | [typage releases](https://github.com/FiloSottile/typage/releases) |
| age CLI | v1.3.0 (2025-12-27) added PQ recipients (`age1pq1…`), tag recipients and `age-inspect`. v1.3.2 (2026-08-29) rejects headers over 2 MiB or over 1024 recipients. | [v1.3.0](https://github.com/FiloSottile/age/releases/tag/v1.3.0), [v1.3.2](https://github.com/FiloSottile/age/releases/tag/v1.3.2) |

### 2.2 Which primitives typage uses (verified in source)

- **Payload:** `chacha20poly1305` from `@noble/ciphers` (pure JS). The work happens synchronously inside a `TransformStream`, with 64 KiB chunks and a last-chunk flag in nonce byte 11 ([lib/stream.ts](https://github.com/FiloSottile/typage/blob/main/lib/stream.ts)). It does not use WebCrypto for the payload.
- **Header, HKDF, HMAC, scrypt, ML-KEM, P-256:** `@noble/hashes`, `@noble/curves` and `@noble/post-quantum` (`MLKEM768X25519`, `MLKEM768P256`) ([lib/recipients.ts](https://github.com/FiloSottile/typage/blob/main/lib/recipients.ts), [lib/index.ts](https://github.com/FiloSottile/typage/blob/main/lib/index.ts)).
- **X25519:** WebCrypto first, with a noble fallback on `NotSupportedError`. It accepts non-extractable `CryptoKey` identities ([lib/x25519.ts](https://github.com/FiloSottile/typage/blob/main/lib/x25519.ts), [README](https://github.com/FiloSottile/typage)).
- **Dependency versions:** `@noble/ciphers ^2.1.1`, `@noble/curves ^2.0.1`, `@noble/hashes ^2.0.1`, `@noble/post-quantum ^0.5.3` ([package.json](https://github.com/FiloSottile/typage/blob/main/package.json)).

### 2.3 Throughput

typage publishes no throughput figures ([README](https://github.com/FiloSottile/typage)). The closest proxy is noble's own benchmark on an Apple M4: `chacha20poly1305` runs at **336 MiB/s** on 1 MB inputs ([noble-ciphers README](https://github.com/paulmillr/noble-ciphers)).

That puts a single thread at about 2.5 minutes per 50 GiB on an M4, and slower on weaker CPUs **[derived]**. typage's payload loop is sequential. Because age chunks are position-indexed, a worker pool could run them in parallel, but typage doesn't do this.

### 2.4 Recipient types

- **Passphrase (scrypt).**
  - Parameters: `N=2^logN, r=8, p=1`, salt label `"age-encryption.org/v1/scrypt"`.
  - The scrypt stanza **must be the only stanza** in the header ([age spec](https://github.com/C2SP/C2SP/blob/main/age.md)).
  - Defaults: typage encrypts at logN **18** and rejects logN > **20** on decrypt ([index.ts](https://github.com/FiloSottile/typage/blob/main/lib/index.ts), [recipients.ts](https://github.com/FiloSottile/typage/blob/main/lib/recipients.ts)). Go age defaults to 18 ("1s on a modern machine") and accepts up to 22 ([scrypt.go](https://github.com/FiloSottile/age/blob/main/scrypt.go)).
- **X25519.** Ephemeral-static X25519 with an HKDF-derived wrap key and ChaCha20-Poly1305 ([age spec](https://github.com/C2SP/C2SP/blob/main/age.md)).
- **Post-quantum hybrid.** `mlkem768x25519` (X-Wing via HPKE, `age1pq…`), plus tagged `p256tag` and `mlkem768p256tag` for hardware keys. The spec advises against mixing PQ and non-PQ recipients in one file ([age spec](https://github.com/C2SP/C2SP/blob/main/age.md)).
- **WebAuthn / passkeys** (marked `@experimental`).
  - Stanza type: `age-encryption.org/fido2prf` with a 16-byte nonce. The two PRF inputs are `label‖0x01‖nonce` and `label‖0x02‖nonce`, and the key is `HKDF-Extract(SHA-256, first‖second, label)`.
  - Using two inputs is meant "to prevent an attacker from decrypting two files at once with a single user presence check".
  - It requires UV and a discoverable credential, and its error message reads "need macOS 15+, Chrome 132+" ([lib/webauthn.ts](https://github.com/FiloSottile/typage/blob/main/lib/webauthn.ts)).
  - Security-key credentials work with the CLI through `age-plugin-fido2prf`. For security keys, the identity string "CAN'T be regenerated if lost" ([webauthn.ts](https://github.com/FiloSottile/typage/blob/main/lib/webauthn.ts), [README](https://github.com/FiloSottile/typage)).

### 2.5 Can Encryptee adopt age so the `age` CLI can decrypt its files?

Yes, for scrypt, X25519 and hybrid PQ recipients. Passkey files can be decrypted from the CLI only for FIDO2 security keys whose RP ID matches. Constraints:

- ChaCha20-Poly1305 and 64 KiB chunks are fixed by the spec.
- A passphrase cannot be combined with any other recipient in the same file.
- The format has no filename field and no padding.
- `age-inspect` reports the payload size ([age README](https://github.com/FiloSottile/age)).
- Test vectors are available in [C2SP/CCTV](https://github.com/C2SP/CCTV/tree/main/age), linked from the [v1.3.0 notes](https://github.com/FiloSottile/age/releases/tag/v1.3.0).

---

## 3. Performance

### 3.1 How each engine runs WebCrypto (from source)

| Engine | Where `encrypt`/`decrypt` run | Backend and hardware acceleration |
|---|---|---|
| **Chromium ≥141** | **Synchronously on the calling thread.** Only RSA keygen and PBKDF2 go to a single "WebCrypto" thread ([webcrypto_impl.cc](https://chromium.googlesource.com/chromium/src/+/HEAD/components/webcrypto/webcrypto_impl.cc)). This came from commit [6767493](https://chromium-review.googlesource.com/c/chromium/src/+/6767493) (2025-08-14, position 1501639, which falls in M141). The feature flag was removed in [7735863](https://chromium-review.googlesource.com/c/chromium/src/+/7735863) (2026-04). The [README](https://chromium.googlesource.com/chromium/src/+/HEAD/components/webcrypto/README.md) still describes the old blanket dispatch, so it is stale. | BoringSSL `EVP_aead_aes_256_gcm`. Hardware paths include AES-NI/CLMUL, VAES+VPCLMULQDQ (AVX2/AVX-512) and ARMv8 AES/PMULL ([gcm.cc.inc](https://boringssl.googlesource.com/boringssl/+/HEAD/crypto/fipsmodule/aes/gcm.cc.inc), [asm dir](https://boringssl.googlesource.com/boringssl/+/HEAD/crypto/fipsmodule/aes/asm/)). |
| **Chromium ≤140** | Every operation went to one "WebCrypto" thread per process, shared with Web Workers ("single non-joinable thread") ([same file](https://chromium.googlesource.com/chromium/src/+/HEAD/components/webcrypto/webcrypto_impl.cc)). **N workers would have been serialized onto that thread [derived].** | as above |
| **Firefox** | `NS_DispatchBackgroundTask`: a background thread pool, with the result sent back to the calling thread ([WebCryptoTask.cpp](https://github.com/mozilla-firefox/firefox/blob/main/dom/crypto/WebCryptoTask.cpp)) | NSS freebl `aesni_support()`, `aes-armv8.c`, `intel-gcm-wrap.c` ([rijndael.c](https://github.com/nss-dev/nss/blob/master/lib/freebl/rijndael.c)) |
| **WebKit** | A serial `WorkQueue` named "com.apple.WebKit.CryptoQueue", **one per `SubtleCrypto` object** (so one per window or worker) ([SubtleCrypto.cpp](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/crypto/SubtleCrypto.cpp), [CryptoAlgorithmAESGCM.cpp](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/crypto/algorithms/CryptoAlgorithmAESGCM.cpp)) | CryptoKit for encrypt; CommonCrypto for decrypt ("FIXME: Add decrypt with CryptoKit") ([Cocoa impl](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/crypto/cocoa/CryptoAlgorithmAESGCMCocoa.cpp)). **[unverified]** whether Apple's backend uses ARMv8 AES; it is not visible in WebKit source. |

### 3.2 Per-call overhead and chunk size

The Chromium commit message is the best primary data point.

- Moving off the thread hop cut 100,000 SHA-256 calls from **1.3 s to 0.2 s**, against **0.003 s** for the raw implementation. That is about 13 µs per call before and about 2 µs after.
- The remaining overhead comes from promises, algorithm normalization and "the spec-mandated copy of all inputs" ([6767493](https://chromium-review.googlesource.com/c/chromium/src/+/6767493)). Blink copies input data per spec step 14.3.x ([subtle_crypto.cc](https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/modules/crypto/subtle_crypto.cc)).

What this means for chunk size **[derived]**, assuming about 5 GiB/s native AES-GCM:

| Chunk | Native crypto time | Overhead at ~2 µs/call (Chrome 141+) | Overhead at ~13 µs/call (thread-hop engines) | Calls for 50 GiB |
|---|---|---|---|---|
| 64 KiB | ~12 µs | roughly 15%, plus copies | roughly 50%+ | 819,200 |
| 1 MiB | ~195 µs | ~1% | ~6% | 51,200 |
| 16 MiB | ~3 ms | negligible | negligible | 3,200, but memory per worker × in-flight × 2 copies grows |

The 13 µs figure for Firefox and Safari is an extrapolation. Both engines do thread-hop per the source table, but I found no primary measurement for them.

### 3.3 Benchmark numbers from primary sources

All three noble rows below were measured on an Apple M4 ([noble-ciphers README](https://github.com/paulmillr/noble-ciphers)).

| Implementation | Algorithm | Throughput | Notes |
|---|---|---|---|
| noble (pure JS) | chacha20poly1305 | **336 MiB/s** | |
| noble (pure JS) | aes-gcm-256 | **94.8 MiB/s** | uses T-tables, which leak timing |
| noble's `webcrypto` wrapper | gcm-256 | **5.67 GiB/s** | Node's WebCrypto (OpenSSL), not a browser |
| libsodium in WASM, whole suite | geometric mean | ~8× slower than native in Node | not AEAD-specific; the author says the JITs were under-warmed ([00f.net, 2026-06](https://www.00f.net/2026/06/23/webassembly-runtimes-2026/)) |

Two more points on WASM:

- **WASM has no AES instructions.** Applications "have to reimplement AES themselves" ([00f.net, 2026-07](https://00f.net/2026/07/16/aes-with-simd-swizzles/)). WASM AES-GCM therefore cannot approach WebCrypto AES-GCM.
- **ChaCha20 in WASM SIMD** is competitive with pure JS or better. I found no primary browser number for it **[unverified]**.

I did **not** find primary per-browser AES-GCM throughput numbers for Chrome, Firefox or Safari. Encryptee should benchmark this itself on its target devices.

### 3.4 Do parallel workers scale?

Based on the engine code **[derived]**:

- **Chrome 141+:** yes. Each worker runs its own crypto.
- **Firefox:** yes, up to the size of its background pool.
- **WebKit:** yes, because each worker has its own queue.
- **Chrome ≤140:** no. Everything went through one thread.

In practice, disk I/O will often be the real ceiling. For 50 GB output, `FileSystemFileHandle.createWritable` is in Chrome 86, Firefox 111 and Safari 26. `showSaveFilePicker` is in Chromium only ([BCD Window](https://github.com/mdn/browser-compat-data/blob/main/api/Window.json), [BCD FileSystemFileHandle](https://github.com/mdn/browser-compat-data/blob/main/api/FileSystemFileHandle.json)).

---

## 4. Password KDF

### 4.1 Current recommendations

**OWASP Password Storage Cheat Sheet** ([link](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)):
- Argon2id minimums: `m=47104 (46 MiB), t=1, p=1` or `m=19456 (19 MiB), t=2, p=1`, down to 7 MiB with t=5.
- scrypt: `N=2^17, r=8, p=1` (128 MiB) and equivalent alternatives.
- PBKDF2-HMAC-SHA256: **600,000** iterations. v1 used 100k. PBKDF2 is the preferred choice when FIPS-140 is required.

**RFC 9106 §4** ([link](https://www.rfc-editor.org/rfc/rfc9106.html#section-4)):
- First recommended setting: Argon2id `t=1, p=4, m=2 GiB`.
- Second recommended setting: `t=3, p=4, m=64 MiB`.
- Salt 128 bits; a 128-bit tag is enough for key derivation.

**Real-world example:** Bitwarden defaults to PBKDF2 600k or Argon2id 32 MiB/t=6/p=4. Its iOS autofill warns above 64 MiB ([Bitwarden](https://bitwarden.com/help/kdf-algorithms/)).

### 4.2 Implementations that work in a browser

| Library | Status | Notes |
|---|---|---|
| hash-wasm | 4.12.0 (2024-11) | Argon2id and scrypt. No SIMD, no multithreading ("future plans"). Reports 438 ops/s for Argon2id at m=512 KiB, t=8 (Chrome 131, Ryzen 7900X) ([README](https://github.com/Daninet/hash-wasm), [npm](https://www.npmjs.com/package/hash-wasm)) |
| libsodium.js | 0.8.4 (2026-04) | `crypto_pwhash` is **sumo build only**. 1.0.21 added WASM SIMD Argon2 ([ChangeLog](https://github.com/jedisct1/libsodium/blob/master/ChangeLog)). Parallelism is **hard-coded to p=1** ([pwhash_argon2id.c](https://github.com/jedisct1/libsodium/blob/master/src/libsodium/crypto_pwhash/argon2/pwhash_argon2id.c)). Presets: interactive 64 MiB/t=2, moderate 256 MiB/t=3 ([header](https://github.com/jedisct1/libsodium/blob/master/src/libsodium/include/sodium/crypto_pwhash_argon2id.h)) |
| argon2-browser | 1.18.0 (2021-06), stale | `parallelism` is "won't be computed in parallel". 119 ms with Chrome SIMD for argon2d at 1 MiB/100 iterations on a 2020 MacBook Pro ([README](https://github.com/antelle/argon2-browser), [npm](https://www.npmjs.com/package/argon2-browser)) |
| @noble/hashes | 2.4.0 | Pure JS, M4 timings: scrypt `N=2^19` 751 ms; `N=2^16` ≈ 0.1 s and 64 MB; argon2id `t=1, m=128MB` 276 ms. The README warns "Argon2 can't be fast in JS" and recommends scrypt ([README](https://github.com/paulmillr/noble-hashes)) |

I found no primary in-browser timings at the OWASP or RFC 9106 parameters. Encryptee should measure them. age's default scrypt logN=18 uses 128·r·N = 256 MiB **[derived]**, which is above OWASP's N=2^17 minimum.

### 4.3 WebCrypto native algorithm status

The WICG draft "Modern Algorithms in the Web Cryptography API" is a Draft CG Report dated 23 Oct 2026. It defines:
- ML-KEM, hybrid KEMs, ML-DSA, SLH-DSA, AES-OCB, ChaCha20-Poly1305 (12-byte IV, 128-bit tag), SHA-3, cSHAKE, KMAC, TurboSHAKE and KT.
- **Argon2d/i/id** through `deriveBits`, with parameters `nonce`, `parallelism` (≤2^24−1), `memory` (KiB, ≥8·p), `passes`, `version=19`, `secretValue` and `associatedData`. Argon2 keys must be imported as `raw-secret` and non-extractable.
- New methods `encapsulateKey/Bits`, `decapsulateKey/Bits`, `getPublicKey` and `supports` ([spec](https://wicg.github.io/webcrypto-modern-algos/)).

Shipped support:

| Algorithm | Chrome | Firefox | Safari |
|---|---|---|---|
| X25519 | 133 | 130 | 17 |
| Ed25519 | 137 | 129 | 17 |
| ChaCha20-Poly1305 | **155** | no | no |
| ML-KEM-768/1024 | **155** | Nightly pref only (`dom.webcrypto.encapsulation.enabled`) | no |
| MLKEM768-X25519 (X-Wing) | **155** | no | no |
| ML-DSA | **155** | no | no |
| `supports()`, `getPublicKey()` | 155 | no | no |
| **Argon2** | **not implemented** | **no** | **no** |

Sources for the table:
- X25519 and Ed25519 versions: [BCD SubtleCrypto](https://github.com/mdn/browser-compat-data/blob/main/api/SubtleCrypto.json).
- Chrome 155 enablement: Gerrit [8378847](https://chromium-review.googlesource.com/c/chromium/src/+/8378847), "Enable WebCrypto additional algorithms by default", landed 2026-09-11 at position 1695870, before the M155 branch point of 1697595 ([chromiumdash](https://chromiumdash.appspot.com/schedule)). Chromestatus lists shipping in 155 ([feature](https://chromestatus.com/feature/5198951632470016)). Chromium's [algorithms dir](https://chromium.googlesource.com/chromium/src/+/HEAD/components/webcrypto/algorithms/) has no argon2 file.
- Firefox: [WebCryptoCommon.h](https://github.com/mozilla-firefox/firefox/blob/main/dom/crypto/WebCryptoCommon.h), [StaticPrefList.yaml](https://github.com/mozilla-firefox/firefox/blob/main/modules/libpref/init/StaticPrefList.yaml).
- WebKit: [algorithms dir](https://github.com/WebKit/WebKit/tree/main/Source/WebCore/crypto/algorithms).
- Positions: Mozilla and WebKit are both "neutral" ([Mozilla #1282](https://github.com/mozilla/standards-positions/issues/1282), [WebKit #641](https://github.com/WebKit/standards-positions/issues/641)).

---

## 5. Passkeys for encryption (WebAuthn PRF)

### 5.1 Spec status

WebAuthn Level 3 became a **W3C Recommendation on 25 Aug 2026** ([TR](https://www.w3.org/TR/webauthn-3/#prf-extension)).
- PRF maps inputs to 32-byte outputs, with the salt computed as `SHA-256("WebAuthn PRF" ‖ 0x00 ‖ input)`.
- It is built on CTAP `hmac-secret` and must use the UV PRF ("overrides the UserVerificationRequirement if necessary").
- Outputs at creation time are optional, so an assertion may be needed.
- The spec's motivating example is encrypting user data, which "would be inaccessible without the ability to get assertions from the associated credential" ([TR](https://www.w3.org/TR/webauthn-3/#prf-extension)).

### 5.2 Support

| Platform | Status | Source |
|---|---|---|
| Chrome / Edge (desktop) | Chrome 116+ | [BCD](https://github.com/mdn/browser-compat-data/blob/main/api/CredentialsContainer.json) |
| Firefox | 139+ (135–138 partial, not on macOS); Firefox Android 149 | [BCD](https://github.com/mdn/browser-compat-data/blob/main/api/CredentialsContainer.json) |
| Safari | Safari 18 (release note: "Added support for the WebAuthn PRF extension") | [Safari 18 notes](https://developer.apple.com/documentation/safari-release-notes/safari-18-release-notes) |
| iCloud Keychain | Supported as of macOS 15 / iOS 18. Chromium wired it up in a 2024-09 commit at position 1358482 (about M131); typage says Chrome 132+. | [Chromium commit](https://chromium.googlesource.com/chromium/src/+/7fe5155fed538b1d2317c516ddc633ee7fa206ef) |
| Google Password Manager | "webauthn: PRF support via the enclave" landed 2024-04 (about M126). Google's own docs don't document PRF **[unverified rollout]** | [Gerrit 5484371](https://chromium-review.googlesource.com/c/chromium/src/+/5484371) |
| Windows Hello | The Windows WebAuthn API exposes hmac-secret/PRF ([webauthn.h](https://github.com/microsoft/webauthn/blob/master/webauthn.h)). Yubico's mid-2025 guide says Windows Hello "lacks hmac-secret". Community reports say it works after the Feb 2026 update (build 26200.7840). **[unverified: no Microsoft source]** | [Yubico guide](https://developers.yubico.com/WebAuthn/Concepts/PRF_Extension/Developers_Guide_to_PRF.html), [Bitwarden forum](https://community.bitwarden.com/t/encryption-prf-via-windows-hello-passkey/94236) |
| YubiKey | `hmac-secret` from firmware 5.2; `hmac-secret-mc` (PRF at registration) from 5.8. Mid-2025: Safari with YubiKeys did not work on macOS or iOS **[may be stale]** | [Yubico PRF](https://developers.yubico.com/Passkeys/Passkey_concepts/Security_key_capabilities/Pseudo-Random_Function_PRF_Support.html), [Yubico guide](https://developers.yubico.com/WebAuthn/Concepts/PRF_Extension/Developers_Guide_to_PRF.html) |

### 5.3 How apps derive a file key from PRF

The common pattern is to treat the PRF output as input keying material, not as a key:
1. Run the PRF output through HKDF-SHA-256 with a purpose-specific `info` string to get a KEK.
2. Use the KEK to wrap a random DEK or file key.
3. Store one wrapped DEK per authenticator, so any registered key can unlock.
4. Rotate by evaluating `first` (old salt) and `second` (new salt) in a single assertion.

Source: [Yubico developer guide](https://developers.yubico.com/WebAuthn/Concepts/PRF_Extension/Developers_Guide_to_PRF.html). typage's construction follows the same pattern (§2.4).

### 5.4 Pitfalls

- **Losing the passkey means losing the data.** WebAuthn editor Tim Cappalli (2026-02-27) asks the industry to "stop promoting and using passkeys to encrypt user data" because users delete credentials they don't recognise ([post](https://blog-timcappalli-me.pages.dev/p/passkeys-prf-warning)).
- **Domain lock-in.** Credentials are bound to the RP ID: they are available to subdomains but not to parent domains ([webauthn.ts](https://github.com/FiloSottile/typage/blob/main/lib/webauthn.ts)). Moving Encryptee to another domain would orphan passkey-wrapped files **[derived]**.
- **Security-key identity strings are unrecoverable.** For non-discoverable credentials, losing the identity string is fatal ([webauthn.ts](https://github.com/FiloSottile/typage/blob/main/lib/webauthn.ts)).
- **Not every authenticator or browser path supports PRF.** Treat PRF failure as an expected outcome and handle it gracefully ([Yubico](https://developers.yubico.com/WebAuthn/Concepts/PRF_Extension/Developers_Guide_to_PRF.html)).

---

## 6. Metadata: filename and size

- **What age exposes.** age has no filename field, and `age-inspect` shows the payload size ([age README](https://github.com/FiloSottile/age)). Extra header stanzas aren't confidential, and they are forbidden alongside scrypt ([age spec](https://github.com/C2SP/C2SP/blob/main/age.md)). Metadata therefore has to go **inside the encrypted payload**. The options are:
  - an inner length-prefixed metadata record followed by the content (CLI users would get this framing too), or
  - an inner standard container, for example a pax/tar stream ([POSIX pax](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/pax.html)), so `age -d f.age | tar x` restores the name. **[unverified]** whether tar tools tolerate trailing padding.
  - Alternatively, a separate encrypted sidecar.
- **Size padding options.**
  - **Padmé (PURBs, PoPETs 2019):** at most 12% overhead, about 3% on average, and leakage of O(log log M) bits ([paper](https://www.petsymposium.org/popets/2019/popets-2019-0056.php)). For a 50 GB file, Padmé rounds up to a multiple of 2^29 (512 MiB), roughly 1% at most **[derived from the algorithm]**.
  - **Signal:** pads attachments to `max(541, ⌊1.05^⌈log_1.05(size)⌉⌋)`, at most about 5% ([PaddingInputStream.java](https://github.com/signalapp/Signal-Android/blob/main/lib/libsignal-service/src/main/java/org/whispersystems/signalservice/internal/crypto/PaddingInputStream.java)).
  - **RFC 8188:** zero padding after a delimiter inside each record, and it advises spreading padding across records ([RFC 8188](https://www.rfc-editor.org/rfc/rfc8188.html)).
  - In every case the true length must be stored inside the encrypted metadata.

---

## Implications for Encryptee v2

### The format choice and its trade-off

| | **Option A: adopt age v1** | **Option B: custom STREAM over WebCrypto AES-256-GCM** |
|---|---|---|
| Interop | Files decrypt with `age`, `rage`, Go and typage. Test vectors exist. | None; you own the spec and the vectors. |
| Security design | Already reviewed: truncation/reorder protection, header MAC (key commitment), PQ and passkey recipients. | Must copy age/Tink correctly: per-file HKDF key, `counter ‖ last` nonce, header MAC, version byte. |
| Payload speed | ChaCha20-Poly1305 in 64 KiB chunks. Native WebCrypto only in Chrome 155+. Elsewhere pure JS at about 336 MiB/s per core on M4, which needs a worker pool to scale. | Native, hardware-accelerated AES-GCM in every browser, multi-GiB/s class per core. 1 MiB chunks amortize per-call overhead. |
| Passphrase KDF | scrypt only. It cannot be combined with other recipients in one file. | Free choice (Argon2id via WASM, or PBKDF2-600k natively). |

**Recommendation: adopt age v1, unless benchmarks on Firefox and Safari show the ChaCha20 payload is the bottleneck rather than disk I/O.** Rough single-core estimates for 50 GiB on an M4 **[derived]**:
- Pure-JS ChaCha20-Poly1305: about 150 s.
- WebCrypto AES-GCM: about 10 s.

With 4–8 workers and a typical SSD, the age path may well be I/O-bound. Measure before deciding.

If you adopt age:
- Use typage for the header and recipients.
- Write a **parallel payload engine**. Workers encrypt chunk *i* with nonce `BE88(i) ‖ flag`. Use WebCrypto ChaCha20-Poly1305 when `crypto.subtle.supports` reports it (Chrome 155+) and fall back to `@noble/ciphers` otherwise. Batch about 64 chunks (4 MiB) per worker message.
- Never call crypto from the main thread. Chrome 141+ runs it synchronously there.

If you choose Option B, use this layout:
- `magic "encryptee" ‖ version byte ‖ recipient stanzas ‖ HMAC header MAC`
- Random 32-byte file key, then `payloadKey = HKDF-SHA-256(fileKey, 32-byte salt, "encryptee/v2 payload")`
- Nonce `BE88(chunkIndex) ‖ lastFlag`, AES-256-GCM with a 128-bit tag
- Chunk size stored in the authenticated header
- Final chunk non-empty unless the file is empty

### Chunk size

- **age:** 64 KiB, fixed by the spec. Amortize overhead by batching chunks per worker message.
- **Custom AES-GCM:** **1 MiB** plaintext chunks. This is Tink's recommended segment size, keeps per-call overhead around 1% in Chrome 141+, and comes to 51,200 calls for 50 GiB. Allow up to 4 MiB, the RFC 9580 maximum.
- **Avoid 16 MiB.** It adds no throughput and multiplies memory across workers, copies and in-flight chunks.

### KDF and parameters

- Derive the KDF key **once per file** to wrap a random file key. Never run it once per chunk.
- **age:** scrypt logN=**18** (256 MiB). It is the age default, above OWASP's 2^17 minimum, and below typage's decrypt cap of 20.
- **Custom format:** Argon2id via hash-wasm or libsodium.js-sumo with `p=1`. Browser WASM is single-threaded, and libsodium forces p=1 anyway. Use `m=64 MiB, t=3` (RFC 9106's second setting with p=1) or at least OWASP's `46 MiB/t=1`.
- **Fallback:** PBKDF2-SHA256 with 600,000 iterations via WebCrypto. Chromium runs PBKDF2 off-thread.
- Store the parameters in the header, and feature-detect native Argon2 later. It is not shipped anywhere yet.

### Where asymmetric and passkey encryption fit

age's model fits directly: a random file key is wrapped once per recipient in a stanza.

1. **X25519.** WebCrypto support in Chrome 133, Firefox 130 and Safari 17. Store a non-extractable `CryptoKey` identity in IndexedDB; typage accepts these.
2. **Post-quantum.** `mlkem768x25519` (`age1pq`) via noble. Chrome 155's native X-Wing could take over later.
3. **Passkeys.** typage's `WebAuthnRecipient` (experimental). **Always pair it with a recovery recipient**, such as an X25519 or PQ identity exported as a passphrase-encrypted age identity file, which the age CLI supports ([age README](https://github.com/FiloSottile/age)). scrypt can't share a file with other recipients, and losing the passkey or its domain makes the data unrecoverable.

### Items to verify yourself

- Per-browser AES-GCM and ChaCha20 throughput, and worker scaling on target hardware.
- Windows Hello PRF (no Microsoft documentation).
- Google Password Manager PRF rollout.
- Safari PRF with external security keys.
- SP 800-38D §8.3 exact wording (PDF text not extractable here).
- Whether Safari tolerates a 256 MiB scrypt allocation on iOS.
