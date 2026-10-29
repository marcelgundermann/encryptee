# Adopt the age v1 file format

v2 writes standard age v1 files (C2SP spec) instead of continuing v1's `.cre` format or designing a new one. age gives us a reviewed design that v1 lacked (per-file payload key, counter nonces with a final-chunk flag, header MAC), passphrase and public-key recipients including post-quantum hybrids, published test vectors, and files users can open without us via the `age` CLI.

## Considered Options

- **Custom STREAM over WebCrypto AES-256-GCM.** Hardware-accelerated in every browser (several GiB/s per core) where age's ChaCha20-Poly1305 is native only in Chrome 155+ and pure JavaScript elsewhere (~336 MiB/s per core). We give up that speed for interoperability and a format we don't have to get right ourselves; a worker pool and disk I/O limits narrow the gap.
- **Keep reading `.cre`.** Rejected (D1): v2 does not read legacy files; v1.encryptee.io stays up for them.

## Consequences

- ChaCha20-Poly1305, 64 KiB chunks and scrypt for passphrases are fixed by the spec.
- A passphrase cannot be combined with recipients in one file.
- The format has no filename field; the plaintext name comes from the encrypted file's name.
