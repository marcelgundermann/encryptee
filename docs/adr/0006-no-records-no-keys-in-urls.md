# Keep no records in the browser and no key in a URL

Encryptee keeps no records in browser storage (no saved public keys, no settings) and never reads or writes a key in a URL. There are no contacts and no share links: to encrypt for someone, the user pastes their public key each time.

- A stored public key is a target: anything that runs in the origin or tampers with storage could swap a saved key, and every later file would go to someone else without a sign.
- Browser storage is evicted (Safari) or cleared, so a saved list is unreliable anyway, as ADR 0004 says for private keys.
- A key in a URL ends up in history, sync and bookmarks, and a link that preselects a recipient lets whoever sent it choose who can open the files, with Encryptee's address as cover.

The cost is pasting post-quantum public keys (about 2,000 characters) by hand; people keep their own list of keys outside Encryptee.

## Consequences

- Amends ADR 0003 (share links and contacts no longer exist to carry long keys), ADR 0004 (there are no contacts to store public keys) and ADR 0005 (there are no share links to keep in the fragment).
- The paste field takes several keys at once, separated by whitespace, so a list kept elsewhere can be pasted whole.
- OPFS staging and the service worker cache are not records: staging is a transient save path that the next job sweeps, and the cache holds only the app.
- A feature that would keep anything between visits, or read a key from a URL, reopens this decision.
