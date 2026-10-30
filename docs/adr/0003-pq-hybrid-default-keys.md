# Generate post-quantum hybrid key pairs by default

Amended by ADR 0006.

New key pairs are ML-KEM-768 + X25519 hybrids (`age1pq1…`), not classic X25519 (D20). Files encrypted today should resist "harvest now, decrypt later" attacks, and age 1.3 decrypts these keys natively. Classic X25519 stays available for people whose tools don't support PQ keys yet.

## Consequences

- PQ public keys are about 2,000 characters long, so share links and contacts matter more than copy-paste.
- Mixing PQ and classic recipients in one file loses the post-quantum protection; the app warns when that happens.
