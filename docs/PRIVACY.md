# Privacy and local data

Yujournal has no cloud ledger, sign-in, analytics SDK, advertising or transaction upload. Business state and optional compressed images live in IndexedDB. Public quotations have a separate cache.

The static host receives normal page/asset requests and may record connection metadata under its own policy. The app does not send amounts, notes, screenshots, plans, badges, passwords or backup files. Public source/deployment does not make visitors' ledger storage public.

The external application API is [Frankfurter](https://frankfurter.dev/), receiving only currencies and public quotation dates, with credentials/referrer omitted. Records freeze their adopted conversion. Keyboard dictation is an iOS service, whose processing/network behavior depends on Apple's settings; Yujournal does not record/upload audio.

Shortcuts carry text in a URL **fragment**, not an HTTP query; the app clears it after intake. Do not put financial text in query parameters.

OCR downloads fixed, same-origin code and models on demand, processes a resized image locally, then terminates its worker. Image retention is opt-in. Clearing OCR cache does not delete ledgers or images.

Complete `.yuji` files include records/deletions, assets, goals/events, templates/pending bills, achievements, themes and referenced images. Plain SHA-256 checks detect corruption, not sender identity. Optional encryption uses PBKDF2-SHA256 (210,000 iterations) and AES-GCM-256 with fresh salt/nonce. Passwords are not saved and cannot be recovered.

Capacity guards: 256 MiB plain backup, 32 MiB encrypted backup, 20 MiB ledger text, 2 MiB per saved image. Import validates before an atomic state/attachment commit. Full restore first generates a safety export; confirm its download is stored safely.

Browsers may evict/clear local data and decide whether persistence requests succeed. Regular complete file backups provide recovery. Export before device/domain/entry-point moves, uninstalling or clearing website data.

## Application voice and shortcut input

Optional long-press voice uses a same-origin, locally cached Whisper-base model and WASM runtime. It requests the microphone only when the user starts recording. Audio stays in memory, stops on release/cancel/backgrounding, is decoded locally and sent only to a local Web Worker. Remote model loading and extra library caches are disabled. Original audio is not attached to transactions or backups.

The screenshot shortcut uses system text extraction, copies a tagged result with `WFLocalOnly=true`, and opens a URL containing no financial text. Clipboard reads occur only from the receiver button. Different iOS entry points may use separate storage; the bridge explicitly directs users back to their established ledger rather than silently writing a second ledger.

New profile-image backups should be restored using v0.2.0 or newer; older complete backups are still accepted. Model caches are not bundled into backups.
