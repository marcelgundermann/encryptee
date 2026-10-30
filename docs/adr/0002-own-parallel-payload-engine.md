# Own the payload engine; use typage only for the header

typage's payload runs on one thread through a `TransformStream`, which caps throughput at one core and gives no control over memory. Encryptee keeps typage for everything around the file key (recipients, identities, scrypt, header MAC) and owns the payload: batches of 64 age chunks go to a pool of crypto workers, each chunk sealed with `BE88(index) ‖ lastFlag`, using native WebCrypto ChaCha20-Poly1305 where it exists and `@noble/ciphers` otherwise. Its output must stay byte-identical to typage's, which the test suite checks.

## Consequences

- typage 0.3.1 does not export its recipient classes or header encoder, so the engine uses `Encrypter` as a header builder: a recipient that returns no stanzas captures the file key, an empty payload is encrypted, and its trailing 32 bytes are cut off. The scrypt recipient is reimplemented (a few lines, byte-compatible) because it cannot be combined with that capture recipient through `setPassphrase`. Decryption uses the public `Decrypter.decryptHeader`. If typage later exports `wrapFileKey`/header encoding, switch to that.
- The main thread creates the crypto workers and hands their MessagePorts to the coordinator worker. That avoids nested workers, gives one topology in every browser, and still keeps file bytes off the main thread.
