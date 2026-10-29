# Encryptee v2: browser I/O research for encrypting 50 GB on the client (as of 2026-10-29)

**Answer in brief:** No single API covers every browser. Chromium (desktop, and Android since Chrome 132) can stream straight to a user-chosen file with `showSaveFilePicker` + `createWritable()`. Firefox and Safari have refused those pickers and still do. On those browsers a 50 GB file needs either a service-worker streaming download or staging in the origin private file system (OPFS) and then downloading a `File` that lives on disk. Both work in principle, and both have caveats. Crypto belongs in a dedicated worker. The service worker should only pass bytes through. On iPhone, 50 GB is not realistic.

Confidence tags: **[P]** checked against a primary source in this session. **[S]** secondary source (GitHub issue, forum post, aggregator). **[U]** could not verify as current for late 2026.

---

## 1. Output sink for huge files

### 1a. `showSaveFilePicker` / `showDirectoryPicker` / `FileSystemWritableFileStream`

| | Pickers (`show*Picker`) | `createWritable()` / `FileSystemWritableFileStream` |
|---|---|---|
| Chrome / Edge desktop | 86 [P] | 86 [P] |
| Chrome Android | 132 [P] (caniuse still says unsupported; see below) | 109 [P] |
| Firefox (desktop and Android) | No [P] | 111, OPFS only [P] |
| Safari macOS | No [P] | **26**, OPFS only [P] |
| Safari iOS | No [P] | 26, OPFS only [P] |

Sources: BCD [Window.json](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Window.json), [FileSystemWritableFileStream.json](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/FileSystemWritableFileStream.json), [FileSystemFileHandle.json](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/FileSystemFileHandle.json), [caniuse](https://caniuse.com/native-filesystem-api).

- **Chrome Android 132.** Chrome's [132 release notes](https://developer.chrome.com/release-notes/132) and [New in Chrome 132](https://developer.chrome.com/blog/new-in-chrome-132) say the API is now on Android and in WebView, and name `showOpenFilePicker()`/`showSaveFilePicker()`. In the [Intent to Ship thread](https://groups.google.com/a/chromium.org/g/blink-dev/c/x3IcFv2jY6c) the feature was enabled in M132. The same thread warns that "Android files (content-URIs) do not support atomic writes, or atomic renames." [P]
  - WebView apps must implement `onShowFileChooser`. Cordova reports `showSaveFilePicker` failing in WebView 132+ ([cordova-android#1776](https://github.com/apache/cordova-android/issues/1776)) [S].
  - caniuse still lists Chrome Android as unsupported, so **feature-detect** rather than trusting either table.
- **Safari 26.** Apple's [Safari 26 release notes](https://developer.apple.com/tutorials/data/documentation/safari-release-notes/safari-26-release-notes.json) say: "Added support for the File System WritableStream API. (145875384)" [P]. Without pickers this only applies to OPFS handles. In [WebKit bug 231706](https://bugs.webkit.org/show_bug.cgi?id=231706) the only working example uses `navigator.storage.getDirectory()`.
- **How `createWritable()` behaves** ([WHATWG File System](https://fs.spec.whatwg.org/)) [P]:
  - Changes are not visible in the file until `close()`.
  - With `keepExistingData` false, the temporary file starts empty.
  - `close()` runs "implementation-defined malware scans and safe browsing checks". Expect `close()` on a 50 GB file to take a while.
  - `FileSystemFileHandle` and `FileSystemWritableFileStream` are exposed to `(Window,Worker)`, so a picker handle can be posted to a worker and written there.
- **Standards positions:**
  - **Mozilla:** `position: negative`, label added 2024-09-13. The thread has been locked since 2021, and nothing has changed since ([mozilla/standards-positions#154](https://github.com/mozilla/standards-positions/issues/154)) [P].
  - **WebKit:** "oppose", decided 2023-02-23 and closed 2023-03-23. Anne van Kesteren's reason: no way to "grant write access to the end user's local file system" safely. The only later activity is a user comment on 2026-10-06; the position has not changed ([WebKit/standards-positions#28](https://github.com/WebKit/standards-positions/issues/28)) [P].
  - Nobody has committed to an alternative "download a stream" API. [whatwg/html#4148](https://github.com/whatwg/html/issues/4148) is open, labelled "needs implementer interest", and its last design comment is from 2023 [P].

### 1b. OPFS + `FileSystemSyncAccessHandle`

- **Support** [P]:
  - `getDirectory`: Chrome 86, Chrome Android 109, Firefox 111, Safari 15.2 ([StorageManager.json](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/StorageManager.json)).
  - SyncAccessHandle: Chrome 102 (Android 109), Firefox 111, Safari 15.2. Fully synchronous `truncate`/`flush`/`getSize`/`close` arrived in Chrome 108 and Safari 16.4 ([FileSystemSyncAccessHandle.json](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/FileSystemSyncAccessHandle.json)).
  - It is available in dedicated workers only, and `read`/`write` accept `AllowSharedBufferSource` ([fs spec](https://fs.spec.whatwg.org/), [MDN](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemSyncAccessHandle)).
- **Throughput:** I found no primary cross-browser benchmarks. web.dev only calls SyncAccessHandle "the fastest possible file operations" with in-place writes ([web.dev OPFS](https://web.dev/articles/origin-private-file-system), last updated 2023) [U]. You will need to benchmark this yourself.
- **Quota per origin** ([MDN quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)) [P]:

| Browser | Best-effort quota | Persistent quota | `persist()` |
|---|---|---|---|
| Chrome / Edge | 60% of disk | 60% of disk | Granted silently, based on engagement |
| Firefox | min(10% of disk, **10 GiB per site group**) | 50% of disk, max 8 TiB | **Shows a permission prompt** |
| Safari 17+ (browser app or Home Screen app) | about 60% of disk (80% across all origins) | Same | Heuristics, e.g. installed to Home Screen ([WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/)) |
| WKWebView apps | about 15% of disk | | |

- **What this means for 50 GB:**
  - **Firefox cannot stage 50 GB unless `persist()` is granted** through its prompt.
  - Chrome and Safari can, if the disk is big enough.
  - Quota is only an upper bound. Real free disk space and `QuotaExceededError` still apply.
- **Chrome's `estimate()` is no longer an exact number.** Chrome planned to report `usage + 10 GiB` instead of the real quota, while enforcement stays the same ([PSA, Dec 2024](https://groups.google.com/a/chromium.org/g/blink-dev/c/7q0YGQNVkjs)). A May 2026 thread says regular mode now reports roughly `max(10 GiB, ceil(actual quota)) + usage` ([IncognitoStaticStorageQuota](https://groups.google.com/a/chromium.org/g/blink-dev/c/00aHBCiUGzo)) [P for the intent, U for the exact shipped formula]. Use `estimate()` only as a hint and handle `QuotaExceededError`.
- **Private modes:**
  - Firefox private windows have no OPFS (`getDirectory()` throws `SecurityError`). [Bug 1975760](https://bugzilla.mozilla.org/show_bug.cgi?id=1975760) is still open, with patches landing [P].
  - Safari Private Browsing had no OPFS as of the [2022 WebKit post](https://webkit.org/blog/12257/the-file-system-access-api-with-origin-private-file-system/) [U for 2026].
  - Chrome Incognito quota is based on RAM, not disk ([PSA](https://groups.google.com/a/chromium.org/g/blink-dev/c/00aHBCiUGzo)) [P].
- **Getting the file out of OPFS:**
  - Files can't be moved out, only copied. web.dev's recommended route is `showSaveFilePicker()`, which Firefox and Safari don't have ([web.dev](https://web.dev/articles/origin-private-file-system)) [P].
  - The fallback is `fileHandle.getFile()` → `URL.createObjectURL(file)` → `<a download>`. The returned `File` points at the OPFS file on disk, so in principle nothing is copied into memory. A [StreamSaver#348](https://github.com/jimmywarting/StreamSaver.js/issues/348) user reports this pattern works, notes it needs about 2× the disk space, and hit a race when deleting the OPFS file right after the download started. Safari was not tested [S].
  - **I found no primary confirmation that Firefox or Safari stream a multi-GB disk-backed blob URL download without buffering it [U].** Test this first.

### 1c. Service-worker streaming download (StreamSaver / native-file-system-adapter pattern)

- **How it works:** a hidden iframe navigates to a URL the service worker owns. The service worker answers with `new Response(readableStream, {headers: {'Content-Disposition': 'attachment…'}})`, and chunks reach it over a MessagePort ([StreamSaver README](https://github.com/jimmywarting/StreamSaver.js), [sw.js](https://raw.githubusercontent.com/jimmywarting/StreamSaver.js/master/sw.js)) [P].
- **Firefox:**
  - Service workers have streamed intercepted response bodies since Firefox 58 ([bug 1204254](https://bugzilla.mozilla.org/show_bug.cgi?id=1204254)) [S, via search snippet].
  - Idle timeout is 30 s, with a further 30 s allowed for `waitUntil` or long-running JS (`dom.serviceWorkers.idle_timeout` and `idle_extended_timeout`, both 30000, in [all.js](https://raw.githubusercontent.com/mozilla/gecko-dev/master/modules/libpref/init/all.js)) [P, but read from the gecko-dev mirror, which may be stale].
  - A 2026 report on Firefox 155 shows a service worker relaying a stream through `respondWith` being killed at exactly 30.0 s ([home-assistant/frontend#54173](https://github.com/home-assistant/frontend/issues/54173)) [S].
  - **So in Firefox, each chunk has to arrive as a message event** to keep the worker alive. A transferred stream that generates no events is not enough.
  - A 134.0.1 regression that interrupted service-worker downloads was fixed in 134.0.2 ([bug 1942573](https://bugzilla.mozilla.org/show_bug.cgi?id=1942573)) [P].
  - Service workers in private browsing arrived in Firefox 140 ([bug 1959535](https://bugzilla.mozilla.org/show_bug.cgi?id=1959535)) [P].
- **Chrome:**
  - Idle timeout 30 s, "an event takes more than 5 minutes" limit, and a 30 s ping check ([Chromium SW security FAQ](https://chromium.googlesource.com/chromium/src/+/main/docs/security/service-worker-security-faq.md); the page is dated 2017) [P, may be stale].
  - Chromium closed as WONTFIX the request to keep a service worker alive for a whole stream: "Chrome stops the service worker after 5+ minutes timeout even if it is streaming" ([w3c/ServiceWorker#1182](https://github.com/w3c/ServiceWorker/issues/1182)) [P, 2017].
  - New events reset the idle state (comment in [service_worker_version.cc](https://raw.githubusercontent.com/chromium/chromium/main/content/browser/service_worker/service_worker_version.cc)) [P].
  - StreamSaver pings for this reason: "goes idle after 30 sec in firefox, 5 minutes in blink" [P].
- **Safari:**
  - Service-worker-generated downloads were fixed in [WebKit bug 202142](https://bugs.webkit.org/show_bug.cgi?id=202142) (r286944, Dec 2021). [StreamSaver#373](https://github.com/jimmywarting/StreamSaver.js/issues/373) says this shipped in Safari 15.4 and that downloads are written to disk incrementally [P for the fix, S for the version].
  - iOS 18.2–18.3 had a regression that cut downloads short ([bug 286060](https://bugs.webkit.org/show_bug.cgi?id=286060), fixed 2025) [P].
  - Safari 18.5 fixed "Service Worker downloads being prematurely interrupted", and Safari 26 fixed `ReadableStream` cancel not being reliably called in a service worker ([18.5 notes](https://developer.apple.com/tutorials/data/documentation/safari-release-notes/safari-18_5-release-notes.json), [26 notes](https://developer.apple.com/tutorials/data/documentation/safari-release-notes/safari-26-release-notes.json)) [P].
  - **"Safari buffers everything in memory" is mostly StreamSaver's own behaviour.** Its code sends every WebKit browser to a Blob fallback: `useBlobFallback = /constructor/i.test(HTMLElement) || !!safari || !!WebKitPoint` ([StreamSaver.js](https://raw.githubusercontent.com/jimmywarting/StreamSaver.js/master/StreamSaver.js)) [P]. That fallback is what kills iOS tabs (1.41 GB on iOS 18.7) [S].
  - Field findings from Sept 2026 in #373, not confirmed by Apple [S]:
    - iOS can truncate downloads that have no `Content-Length`. Send the exact ciphertext size, which you know in advance.
    - postMessage chunks above 256 KiB were sometimes dropped.
    - The fetch event has to stay open until the body drains.
    - iOS takes the file extension from `Content-Type`, not `Content-Disposition`.
    - **Safari evicted the service worker 41–58 minutes into very long downloads.**
  - On iPadOS, a `respondWith` promise left pending was killed at about 70 s ([Apple forums](https://developer.apple.com/forums/thread/764482)) [S]. Resolve `respondWith` immediately with the streaming `Response`.

### 1d. Plain `Blob` + `URL.createObjectURL`

- **Chrome:** blob storage limits from the [Chromium blob README](https://chromium.googlesource.com/chromium/src/+/main/storage/browser/blob/README.md) [P]:

| Platform | In memory | On disk |
|---|---|---|
| Desktop 64-bit | 2 GB | disk / 10 |
| ChromeOS | RAM / 5 | disk / 2 |
| Android | **RAM / 100** | **6% of disk** |

  A 50 GB Blob therefore needs about 500 GB of disk on desktop and about 833 GB on Android. On Android it is not feasible.
- **Firefox:** the FileSaver table ("800 MiB") is years old ([FileSaver README](https://cdn.jsdelivr.net/npm/file-saver@2.0.5/README.md)) [S, outdated]. Firefox writes XHR/fetch blobs over 1 MB to temporary files ([bug 1373222](https://bugzilla.mozilla.org/show_bug.cgi?id=1373222)). I could not confirm that `new Blob(parts)` or `new Response(stream).blob()` behaves the same way [U].
- **Safari:** no documented Blob size limit; the practical ceiling is the process memory limit (see §4) [U].
- **Conclusion:** a Blob built from ciphertext chunks is not viable for 50 GB in any browser. The only Blob worth downloading is a `File` that already lives on disk, from OPFS `getFile()`.

### 1e. Newer APIs

| API | Support | Relevance |
|---|---|---|
| `FileSystemObserver` | Chrome 133 desktop only, experimental ([BCD](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/FileSystemObserver.json)) | Not needed |
| File Handling (`file_handlers`) | Chrome/Edge 102 desktop only ([BCD](https://raw.githubusercontent.com/mdn/browser-compat-data/main/manifests/webapp/file_handlers.json)) | Nice to have for "Open with" |
| Web Share Target | Chrome Android 76 and Chrome 89; Firefox no ([bug 1476515](https://bugzil.la/1476515)); Safari no ([webkit.org/b/194593](https://webkit.org/b/194593)) ([BCD](https://raw.githubusercontent.com/mdn/browser-compat-data/main/manifests/webapp/share_target.json)) | Limited |
| `navigator.share({files})` | Safari/iOS 14, Chrome Android 76, Firefox no ([BCD](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Navigator.json)) | Possible iOS "Save to Files" exit for an OPFS `File`; behaviour at 50 GB [U] |
| SW static routing | Safari 27 ([WebKit 27.0](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/)) | Not relevant |

---

## 2. Input side

- **`Blob.stream()`:** Chrome 76, Firefox 69, Safari 14.1 ([BCD Blob](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Blob.json)) [P].
  - The spec reads chunks in parallel into a byte stream and does not specify chunk size ([File API](https://w3c.github.io/FileAPI/)) [P].
  - WebKit stopped holding the whole file in memory for `file.stream()` in Jan 2022 ("does not need to keep in memory the whole file", [changeset 288463](https://trac.webkit.org/changeset/288463/webkit), bug 235448) [P].
  - Avoid `Blob.text()` on large files. WebKit's version reads the whole blob ([WPT PR re: bug 328102](https://github.com/web-platform-tests/wpt/pull/63900)) [S].
- **`file.slice(a, b).arrayBuffer()`** reads only that range. It works everywhere and gives exact chunk boundaries, which makes it the most predictable reader.
- **A changed file errors out.** If the file changes on disk mid-read, reads fail with `NotReadableError` ([File API snapshot state](https://w3c.github.io/FileAPI/)) [P].
- **iOS copies every picked file before JS sees it** [P, from source]:
  - WebKit's [WKFileUploadPanel.mm](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebKit/UIProcess/ios/forms/WKFileUploadPanel.mm) opens the document picker in `UIDocumentPickerModeImport` for files and with `asCopy` for directories, then copies or moves the result into a temporary directory.
  - **A 50 GB input therefore needs another 50 GB free** on iOS, plus time to copy it.
  - Videos picked from Photos can be transcoded (`WKVideoUpload`). Users should pick from Files instead.
- **Folders:**
  - `webkitGetAsEntry`: Chrome 13, Firefox 50, Firefox Android 141, Safari 11.1 [P].
  - `getAsFileSystemHandle`: Chromium only (desktop 86, Android 132) ([BCD](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/DataTransferItem.json)) [P].
  - `<input webkitdirectory>`: full support in iOS 18.4, Chrome Android 132 and Firefox Android 142 ([BCD](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/HTMLInputElement.json)) [P].

---

## 3. Streams plumbing

| Feature | Chrome | Firefox | Safari |
|---|---|---|---|
| Transfer `ReadableStream` | 87 | 103 | **27** |
| Transfer `WritableStream` / `TransformStream` | 87 | 103 | BCD: no (conflict, see below) |
| BYOB reader / byte streams | 89 | 102 | 26.4 |
| BYOB `read({min})` | 140 | 134 | No ([webkit.org/b/264731](https://bugs.webkit.org/show_bug.cgi?id=264731)) |
| Async iteration | 124 | 110 | 27 |
| `ArrayBuffer.prototype.transfer` | 114 | 122 | 17.4 |

Sources: [ReadableStream](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/ReadableStream.json), [WritableStream](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/WritableStream.json), [TransformStream](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/TransformStream.json), [BYOBReader](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/ReadableStreamBYOBReader.json), [ArrayBuffer](https://raw.githubusercontent.com/mdn/browser-compat-data/main/javascript/builtins/ArrayBuffer.json) [P].

- **Safari 27 transfer conflict.** Apple's [27 release notes](https://developer.apple.com/tutorials/data/documentation/safari-release-notes/safari-27-release-notes.json) say only "transferring `ReadableStream` objects via `postMessage()`. (169950592)", and BCD agrees ([PR #30648](https://github.com/mdn/browser-compat-data/pull/30648)). The [WebKit 27.0 blog post](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/) also names Writable and Transform streams. **Treat only `ReadableStream` transfer as reliable in Safari, and feature-detect.**
- **Transferred streams copy every chunk and move one at a time** ([Streams §8.2](https://streams.spec.whatwg.org/)) [P]:
  - `PackAndPostMessage` posts each chunk with an empty transfer list, so the bytes are copied.
  - The readable side has high-water mark 0, the writable side 1, and each `"pull"` message releases the next chunk.
  - Backpressure is kept, but transfer is not zero-copy and runs one chunk per round trip. For bulk binary data, plain `postMessage(buf, [buf])` with your own credit protocol is cheaper.
- **`pipeTo` respects backpressure.** "While WritableStreamDefaultWriterGetDesiredSize(writer) is ≤ 0 or is null, the user agent must not read from reader" ([Streams §4.9.1](https://streams.spec.whatwg.org/)) [P]. `TransformStream` defaults to high-water mark 1 on the writable side and 0 on the readable side [P].
- Safari 27 also "Fixed spec conformance issues in the Streams API piping and abort behavior" [P].

---

## 4. Memory limits

- **iOS (WebKit, all browsers outside the EU):**
  - Simon Fraser on WebKit bugzilla, 2024: "WebContent processes on iPhone are subject to a 'soft' limit of around 1.5GB… design your web content to not exceed the 1.5GB limit" ([bug 277848](https://bugs.webkit.org/show_bug.cgi?id=277848)) [P].
  - 2026 jetsam logs show `com.apple.WebKit.WebContent … exceeded mem limit: ActiveHard 2048 MB (fatal)` on an iPhone 17 Pro with 12 GB of RAM. An Apple Frameworks Engineer replied that "iPhones do indeed have stricter jetsam limits than iPads" ([Apple forums 823061](https://developer.apple.com/forums/thread/823061)) [P for Apple's statement, S for the log].
  - WebKit confirmed jetsam on an iPhone 17 Pro in April 2026 ([bug 312727](https://bugs.webkit.org/show_bug.cgi?id=312727)) [P].
  - My assumption is that dedicated workers share this budget because they run inside the page's process [U].
- **macOS WebKit:** default kill thresholds in [MemoryPressureHandler.cpp](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WTF/wtf/MemoryPressureHandler.cpp) are 7 GB for an active process (15 GB if RAM > 16 GB) plus 1 GB per tab [P].
- **Firefox Android:** a low-end Nokia crashed after allocating about 512 MB of ArrayBuffers; the bug is still open ([bug 1693256](https://bugzilla.mozilla.org/show_bug.cgi?id=1693256)) [P].
- **Desktop Chrome and Firefox:** I found no documented fixed per-tab cap [U].
- **WebCrypto copies its input.** `encrypt()` step 4 takes "a copy of the bytes held by the data parameter", and there is no streaming API ([WebCrypto](https://w3c.github.io/webcrypto/)) [P]. Each chunk in flight costs about 3× its size: the read buffer, the internal copy, and the output.
- **Safe settings:** **1–4 MiB chunks, at most 4 in flight per pipeline.** Peak memory is then about 50 MB or less, far below the roughly 1.5 GB iOS soft limit and the 512 MB low-end Android failures.

---

## 5. Service worker lifetime

- **Spec:** the browser may terminate a service worker when it has no event to handle, or when tasks exceed "imposed time limits" ([SW spec §2.1.1](https://w3c.github.io/ServiceWorker/)) [P].
- **Decision on long-running service workers:** "We're not going to allow a service worker to run indefinitely" ([w3c/ServiceWorker#980](https://github.com/w3c/ServiceWorker/issues/980), closed 2021) [P].
- **Per browser:**
  - Chrome: 30 s idle, about 5 minutes per event.
  - Firefox: 30 s plus 30 s, with a 5-minute `respondWith` limit. The request to relax it is still open ([bug 1302715](https://bugzilla.mozilla.org/show_bug.cgi?id=1302715)).
  - Safari: undocumented. Field reports say about 70 s for a pending `respondWith` and eviction after 41–58 min [S].
- **Conclusion:** at around 100–500 MB/s, encrypting 50 GB takes several minutes to over an hour. **Run the crypto in a dedicated worker.** Use the service worker only as a thin download pipe, kept alive by message events.

## 6. Cross-origin isolation (COOP/COEP)

- **What it gives you:** `SharedArrayBuffer` needs a secure context and `crossOriginIsolated` ([MDN SAB](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)) [P].
- **COEP support:** `require-corp` in Chrome 83, Firefox 79, Safari 15.2. `credentialless` in Chrome 96 and Firefox 119, but **not Safari** ([BCD](https://raw.githubusercontent.com/mdn/browser-compat-data/main/http/headers/Cross-Origin-Embedder-Policy.json)) [P].
- **What it breaks:**
  - Every cross-origin subresource needs CORP or CORS.
  - COOP cuts the link to cross-origin popups (OAuth, `window.opener`).
  - Child iframes must opt in too ([web.dev COOP/COEP](https://web.dev/articles/coop-coep)) [P].
  - For a self-contained static app this is harmless, provided the host can set headers. GitHub Pages cannot, which is why [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker) exists (it needs a reload on first visit) [P].
- **`SharedArrayBuffer` doesn't help here:**
  - WebCrypto takes `BufferSource`, which excludes shared buffers without `[AllowShared]` ([Web IDL](https://webidl.spec.whatwg.org/#AllowShared)). Safari 27 now "correctly reject[s] `SharedArrayBuffer` where `[AllowShared]` is not specified" [P].
  - Only SyncAccessHandle accepts shared buffers.
  - It would only matter for WebAssembly threads, such as a multithreaded Argon2 key derivation. **Don't enable isolation for v2 unless you need that.**

---

## Implications for Encryptee v2

**Pipeline, all browsers:**
- The main thread posts the `File` (and, on Chromium, the picker's `FileSystemFileHandle`) to **one dedicated worker**.
- The worker loop is: `file.slice(off, off+CHUNK).arrayBuffer()` → `crypto.subtle.encrypt` → `sink.write()`, awaiting the sink each time. Don't rely on transferable streams.
- Bound the queue: **CHUNK = 4 MiB** (1 MiB on iOS), **at most 3–4 chunks in flight**. Write the chunk size into the file header so it can be tuned later.
- Use deterministic per-chunk nonces (counter plus a last-chunk flag). 50 GB / 4 MiB is about 12.8k chunks, well within AES-GCM limits (NIST SP 800-38D, not re-fetched this session).
- Precompute the exact ciphertext size so you can send `Content-Length`.

**Per-browser strategy:**

| Browser | Primary sink | Fallbacks | 50 GB? |
|---|---|---|---|
| Chrome / Edge desktop | `showSaveFilePicker` → `createWritable()` in the worker | SW stream → OPFS staging | Yes. Allow time for the scan at `close()` |
| Chrome Android | `showSaveFilePicker` (132+, feature-detect; writes not atomic) | SW stream → OPFS staging | Yes, if disk space allows |
| Firefox desktop / Android | SW streaming download fed by MessagePort, one message per chunk, credit-based acks | OPFS + SyncAccessHandle, then `getFile()` blob-URL download; needs `persist()` (prompt) and 2× disk | Plausible; test it [U] |
| Safari macOS | SW streaming download (15.4+; 18.5+ for the fixes) with `Content-Length` and chunks ≤ 256 KiB | OPFS staging, then blob URL download | Plausible. Watch for service-worker eviction past about 45 min [S] |
| Safari iOS / iPadOS | SW streaming download, app kept in foreground | OPFS staging, then blob URL or `navigator.share` [U] | **Not realistic on iPhone**; fragile on iPad |

**Where 50 GB is not realistically possible:**

1. **iPhone (Safari and every other iOS browser).**
   - The input is copied by the document picker, and the output is either a long service-worker download that may be evicted or another 50 GB in OPFS. That adds up to roughly 100–150 GB of free space.
   - The page has to stay in the foreground for the whole run, and the process is under a strict memory limit. Backgrounding on iOS isn't covered by any primary source I found [U].
2. **Firefox private windows** have no OPFS ([bug 1975760](https://bugzilla.mozilla.org/show_bug.cgi?id=1975760)), so only the service-worker path is left. **Firefox normal windows without a `persist()` grant** are capped at about 10 GiB of staging.
3. **Safari Private Browsing** has no OPFS ([2022 note](https://webkit.org/blog/12257/the-file-system-access-api-with-origin-private-file-system/), [U] for 2026). **Chrome Incognito** has a quota based on RAM, so no staging, though the picker path still works.
4. **Any setup that ends up on the in-memory Blob fallback,** which includes the StreamSaver default on all of WebKit. On Chrome Android the disk-backed Blob limit is 6% of disk.
5. **Android WebView or embedded hosts** that don't implement `onShowFileChooser`, and devices without about 50 GB free (about 100 GB on the OPFS-staging path).

**Still unverified, so prototype these first:**
- Whether a 50 GB OPFS `getFile()` blob-URL download stays off the heap in Firefox and Safari.
- How long the Safari and Firefox service-worker download paths hold up over an hour or more, when fed by message events.
- OPFS write throughput in each browser.
