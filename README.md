# Encryptee

Encrypt and decrypt files in the browser, entirely on your device. Encrypted files are standard
[age](https://age-encryption.org) files: the `age` command-line tool opens what Encryptee writes,
and Encryptee opens what `age` writes.

Use it at <https://encryptee.io>. Legacy files (`.cre`, from Encryptee v1) open at
<https://v1.encryptee.io>, which stays online.

## Features

- **A passphrase or public keys.** Encrypt with a passphrase, generated for you or your own, or to
  one or more public keys, so that only the matching private keys can decrypt.
- **Post-quantum by default.** New key pairs combine ML-KEM-768 with X25519; classic X25519 key
  pairs are there too. You save a key pair as a key file, protected with a passphrase (`key.age`)
  or plain (`key.txt`). Encryptee never stores it.
- **Many files, large files.** Encrypt or decrypt many files in one job. Each file is processed in
  64 KiB chunks by parallel workers, so it never has to fit in memory.
- **Offline.** After the first visit Encryptee works without a connection, and it installs as an
  app. Installed in Chrome or Edge, it opens `.age` files from your file manager. A new version
  takes over once every Encryptee tab has closed.
- **Jobs that finish.** The screen stays on while a job runs, and closing the tab asks first.

## Browser support

Encryptee supports current browser releases only. Each minimum below is the first release
with every API the engine uses, the latest being `Uint8Array.prototype.toBase64`. Older releases
get no fallbacks.

| Browser                      | Minimum          | Save location                                                               | Size warning above       | Tested in CI   |
| ---------------------------- | ---------------- | --------------------------------------------------------------------------- | ------------------------ | -------------- |
| Chrome, Edge on a computer   | 140              | One file: a file you choose. Several: a folder you choose.                  | none                     | yes (Chromium) |
| Chrome on Android            | 140              | A file you choose, where Chrome offers the save picker; otherwise downloads | none with the picker     | no             |
| Firefox                      | 133              | Downloads                                                                   | 4 GiB                    | yes            |
| Safari on a Mac              | 18.2             | Downloads                                                                   | 4 GiB                    | yes (WebKit)   |
| iPhone, iPad (every browser) | iOS, iPadOS 18.2 | Downloads                                                                   | 4 GiB; a note from 1 GiB | no             |

- Chrome and Edge write straight to the file or folder you choose. Firefox and Safari have no save
  pickers, so the output streams through Encryptee's service worker into an ordinary download.
- Every browser on iPhone and iPad uses Safari's engine and has Safari's limits. iPhones stuck on
  iOS 16 or 17 (iPhone 8 and X) can't run Encryptee.
- When no service worker controls the page, the output is staged in the browser's private storage
  (OPFS) and downloaded from there. That needs room for two copies of the result, and a private
  window may refuse it, in which case Encryptee says the browser can't save this way.
- Chrome 155+ encrypts with its native ChaCha20-Poly1305. Other browsers use
  [noble-ciphers](https://github.com/paulmillr/noble-ciphers), about three times slower per worker.
- Other Chromium browsers (Brave, Opera, Vivaldi, …) aren't tested. They should work as far as they
  ship the same APIs.
- CI runs the engine's tests and the end-to-end tests in Playwright 1.65.1's Chromium, Firefox and
  WebKit on Linux. That WebKit is Safari's engine, not Safari. The end-to-end tests hide the save
  pickers, so only the engine's tests cover that path. Phones aren't tested.

## File sizes

Encryptee has no size limit of its own: files are processed as a stream of 64 KiB chunks, so memory
use doesn't grow with the file. What limits a file is where it's saved.

- **Chrome and Edge's save pickers:** no limit. The output goes straight to disk.
- **Downloads** (Firefox, Safari, iPhone, iPad): Encryptee warns above 4 GiB, and above 2 GiB in a
  browser it doesn't recognise. The warning suggests Chrome or Edge on a computer; it doesn't stop
  the job. Both limits are provisional until the download paths are measured.
- **iPhone and iPad:** from 1 GiB, Encryptee asks you to keep it open and in front, and to check
  there's enough free space.
- **OPFS staging:** Encryptee says the result needs room twice, and warns when the browser's storage
  estimate says it may not fit.

Tested so far:

- Files over 60 GB, by hand, through the save picker in Chrome on a computer.
- 10 GiB encrypted and decrypted end to end through OPFS in Chromium and WebKit, by the
  benchmark.
- In CI, jobs of up to 64 MiB in Chromium, Firefox and WebKit.
- Not yet tested: multi-GB downloads in Firefox and Safari, and an iPhone.

## Performance

From the benchmark (`pnpm --filter @encryptee/engine bench`): 10 GiB through OPFS on an Apple M5 Pro,
headless, with synthetic input and scrypt included in the timing.

| Browser                                                              | Workers | Encrypt    | Decrypt    |
| -------------------------------------------------------------------- | ------- | ---------- | ---------- |
| Chromium (native ChaCha20-Poly1305)                                  | 8       | 3945 MiB/s | 2797 MiB/s |
| WebKit ([noble-ciphers](https://github.com/paulmillr/noble-ciphers)) | 7       | 1589 MiB/s | 1455 MiB/s |

Encryption isn't the bottleneck: with real files, the disk and the save location set the pace.
Firefox hasn't been measured yet.

## age compatibility

Encryptee reads and writes [age v1](https://age-encryption.org/v1) files.

Supported:

- Passphrases (scrypt), X25519 public keys (`age1…`) and post-quantum ML-KEM-768 + X25519 public
  keys (`age1pq1…`). As in age, a passphrase can't be combined with public keys.
- Private keys (`AGE-SECRET-KEY-1…`, `AGE-SECRET-KEY-PQ-1…`) in key files in `age-keygen`'s format,
  plain or protected with a passphrase.
- CI checks each of these both ways against the `age` CLI v1.3.2 and runs the
  [CCTV](https://github.com/C2SP/CCTV) age test vectors. The payload is byte-identical to typage's.

Not supported:

- Armored (PEM) files.
- Plugins and SSH keys.
- Tag public keys (`age1tag1…`, `age1tagpq1…`), which aren't tested.
- Legacy files (`.cre`): open them at [v1.encryptee.io](https://v1.encryptee.io).

To decrypt without Encryptee, install [age](https://github.com/FiloSottile/age) 1.3 or newer (older
releases lack post-quantum keys):

```sh
# a file encrypted with a passphrase
age -d -o photo.jpg photo.jpg.age

# a file encrypted to your public key (key file from Encryptee)
age -d -i key.age -o photo.jpg photo.jpg.age
```

A protected key file asks for its passphrase first.

## Security

- **Nothing leaves your device.** Files, passphrases and keys are processed in the browser and never
  sent anywhere. Encryptee is static files with no server code, so nothing on a server could see them.
- **Only Encryptee's own code runs.** It loads no third-party scripts and has no analytics. A strict
  Content Security Policy with Trusted Types allows scripts only from Encryptee's own origin
  ([`_headers`](apps/web/public/_headers)).
- **Private keys are never stored.** You keep them in a key file. Encryptee keeps no records in the browser
  either (no saved public keys, no settings) and never reads or writes a key in a URL. Only a page's scroll offset is kept, in
  session storage, until the tab closes.
- **Each file gets its own random key.** Every 64 KiB chunk is sealed with ChaCha20-Poly1305 and
  numbered, and the last chunk is marked as last, so any change, reordering or truncation is
  detected and the job fails. A decrypt into a download checks the whole file before the download
  starts, so nothing unverified is saved.
- **What an encrypted file doesn't hide:** its approximate size, and its name if you keep the default
  (`photo.jpg.age`). Rename encrypted files if the name itself is sensitive.
- **Passphrases** are stretched with scrypt, which makes guessing slow, but a short passphrase can
  still be guessed. Use the generated passphrase, or at least five random words.

## Self-hosting

`pnpm build` writes the whole app as static files to `apps/web/dist`. encryptee.io serves them from
Cloudflare Workers Static Assets with no Worker script ([`wrangler.example.jsonc`](wrangler.example.jsonc)),
which applies the headers in `_headers` (copied from `apps/web/public/` into the build). On another
host, send the same headers yourself: the Content Security Policy is part of the security model.

Serve it over HTTPS. The service worker, which makes Encryptee work offline and streams downloads in
Firefox and Safari, needs it.

## Development

Requires Node 24.11+ or 26+ and pnpm 12. The toolchain is [Vite+](https://viteplus.dev) (`vp`),
installed with the workspace: `pnpm vp …` runs it without a global install.

```sh
pnpm install
cp wrangler.example.jsonc wrangler.jsonc   # once; git-ignored, add your account_id here
pnpm dev                 # tool at http://localhost:5173
pnpm test                # engine tests in Chromium, Firefox and WebKit; the app's in Node
pnpm check               # format check, lint, typecheck, Knip and tests
pnpm build && pnpm e2e   # end-to-end against the production build (wrangler dev)
pnpm vp run @encryptee/engine#bench   # throughput bench at http://localhost:5174
```

Lint, format check, typecheck, Knip, and the app's unit tests and build are cached Vite+ tasks: they
replay when nothing they read changed (`--no-cache` forces a run). The engine's tests and e2e always
run.

Set `BROWSERS=chromium,webkit` to narrow test runs, and `AGE_BIN` to the directory of an `age` ≥ 1.3
release to run the CLI interop tests.

The workspace:

- `packages/engine`: the age engine (header via typage, parallel payload in workers, save locations,
  keys). The app talks only to its public interface, `src/index.ts`.
- `apps/web`: the Vite + React app, the content pages, the service worker and `_headers`.
- `deploy/v1`: the Worker serving the frozen v1 (the `v1` branch).

## Built on

- [age](https://age-encryption.org) by Filippo Valsorda: the format, and the CLI the tests check
  against.
- [typage](https://github.com/FiloSottile/typage) (`age-encryption`): the age header.
- [noble-ciphers](https://github.com/paulmillr/noble-ciphers) and
  [noble-hashes](https://github.com/paulmillr/noble-hashes): ChaCha20-Poly1305 where the browser
  has none, scrypt and HKDF.
- [CCTV](https://github.com/C2SP/CCTV): the age test vectors.

## License

[MIT](LICENSE)
