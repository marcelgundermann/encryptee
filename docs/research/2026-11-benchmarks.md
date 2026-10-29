# Engine benchmarks

First numbers from the engine spike (plan step 3), measured 2026-10-29 with `packages/engine/bench` driven headlessly by Playwright 1.64. They answer "is the crypto fast enough?" and leave open "does each save path survive 50 GB?". That second question needs headed browsers on real hardware (see [Still to measure](#still-to-measure)).

## Setup

- Apple M5 Pro, 18 cores, 64 GB RAM, internal SSD.
- Chromium: Chrome Headless Shell 156.0.8078.4. Native WebCrypto ChaCha20-Poly1305 is present.
- WebKit: Playwright WebKit 27.2. This is not Safari, but it is the same engine. It reports `hardwareConcurrency` as 8 and has no native ChaCha20-Poly1305, so only noble runs there.
- Firefox: not run. Playwright's Firefox can't create its profile inside the agent sandbox used for this session. Run `pnpm --filter @encryptee/engine bench` by hand.
- Passphrase jobs use scrypt logN 18, which is included in every timing. "Synthetic" input is zero-filled buffers with no disk reads. Times are wall-clock for a whole job, including worker startup.

## Results

### Crypto only (encrypt synthetic → discard)

| Browser | Backend | Workers | Batch (chunks) | GiB | MiB/s |
|---|---|---|---|---|---|
| Chromium | noble | 1 | 16 / 64 / 256 | 1 | 274 / 275 / 275 |
| Chromium | noble | 4 | 16 / 64 / 256 | 1 | 786 / 783 / 775 |
| Chromium | noble | 8 | 16 / 64 / 256 | 1 | 1049 / 1019 / 1098 |
| Chromium | webcrypto | 1 | 16 / 64 / 256 | 1 | 863 / 874 / 868 |
| Chromium | webcrypto | 4 | 16 / 64 / 256 | 1 | 1552 / 1620 / 1607 |
| Chromium | webcrypto | 8 | 16 / 64 / 256 | 1 | 1742 / 1804 / 1803 |
| Chromium | noble | 8 / 12 | 64 | 10 | 1878 / 2443 |
| Chromium | webcrypto | 8 / 12 | 64 | 10 | 6003 / 7327 |
| WebKit | noble | 1 | 16 / 64 | 1 | 238 / 244 |
| WebKit | noble | 4 | 16 / 64 | 1 | 680 / 691 |
| WebKit | noble | 8 | 16 / 64 | 1 | 911 / 947 |

### Through the disk (OPFS SyncAccessHandle)

| Browser | Scenario | Backend | Workers | GiB | MiB/s |
|---|---|---|---|---|---|
| Chromium | encrypt synthetic → OPFS | webcrypto | 8 | 10 | 3945 |
| Chromium | decrypt OPFS file → discard | webcrypto | 8 | 10 | 2797 |
| WebKit | encrypt synthetic → OPFS | noble | 7 | 10 | 1589 |
| WebKit | decrypt OPFS file → discard | noble | 7 | 10 | 1455 |

## Findings

- **The worker pool scales.** noble goes from 275 MiB/s on one worker to about 1.9 GiB/s on eight (10 GiB run), so ADR 0002's parallel engine does its job. Single-core noble throughput matches noble's published M4 figure (336 MiB/s).
- **Native ChaCha20-Poly1305 (Chrome 155+) is about 3× faster than noble per worker,** and reaches about 6 GiB/s with eight workers.
- **Batch size barely matters** between 16 and 256 chunks (1–16 MiB). Keep 64 (4 MiB) on desktop and 16 (1 MiB) on mobile, as planned, since memory is what grows with batch size.
- **At 1 GiB, fixed costs dominate.** scrypt and worker startup take a few hundred milliseconds, so 1 GiB runs understate steady-state throughput. Compare the 10 GiB rows.
- **Crypto is not the bottleneck.** At 50 GB, the save path and the disk set the pace. The OPFS rows show the engine can feed an SSD at multiple GiB/s on Chromium and about 1.5 GiB/s on WebKit.
- **Ephemeral (incognito-style) contexts have a small OPFS quota.** The first headless run failed at a few GiB with `storage-full`, which the engine reported correctly. Persistent profiles had no trouble with 10 GiB. A user in a private window will hit the same limit.

## Still to measure

These decide the Firefox/Safari size limits (D23). Until they are measured, `SIZE_LIMITS` stays at 4 GiB for Firefox and Safari:

1. **50 GB end to end on Chrome desktop** with the save picker: throughput, memory in Chrome's Task Manager (target under 300 MB), and how long `close()` takes for Safe Browsing.
2. **Service-worker download** on Firefox and Safari macOS: does a multi-GB download finish, does Safari evict the SW past ~45 min, and what throughput does it reach?
3. **OPFS → blob URL download** on Firefox and Safari: does a disk-backed `File` download without buffering in memory?
4. **iPhone** with a 2–5 GB file (D22).
5. **Firefox** crypto numbers (noble only).
