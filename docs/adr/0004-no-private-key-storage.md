# Never store private keys in the app

Amended by ADR 0006.

Encryptee never keeps a private key in browser storage (D9). Generated keys are handed to the user as a key file, passphrase-protected by default (an age-encrypted identity file that `age -d -i key.age` understands), with a plain export as an option. To decrypt, the user provides the key file again.

Storing keys (even as non-extractable WebCrypto keys in IndexedDB) would be more convenient, but browser storage can be evicted (Safari in particular), cleared by the user, or read by anything that runs in the origin. A key file the user owns survives all of that and works without Encryptee.

## Consequences

- Contacts store public keys only.
- Passkey recipients, when they come, will always be paired with a recovery key file, for the same reason.
