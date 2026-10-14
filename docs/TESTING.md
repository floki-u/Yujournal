# Testing and release limits

```sh
npm ci
npm test
npm run check
npm run format:check
npm run build
```

Node.js 24 is used locally and in CI. Test data is synthetic. Report tests use the production function through native Canvas, not a browser/iPhone screenshot. `.artifacts/` is generated and ignored.

The original desktop browser run verified empty-ledger sentence entry/save, reload persistence, local OCR, opt-in image retention, complete backup download, deduplicated import, opening assets, plan allocation and an automatic recurring entry. This repository reorganizes source paths/hosting, so those results **are not a complete regression of this public deployment**.

Automated tests cover money/JPY precision, Chinese amounts/ambiguity, stock losses, frozen FX/settlement, month-end/leap recurrence, pending snapshots, stable fixed IDs across devices, merge, stale edits, soft delete/undo, plan archive/restore, atomic rollback, missing images, backup encryption/corruption, report pagination, Service Worker cache behavior, portable build and profile output.

## iPhone acceptance checklist

- [ ] Safari Home Screen installation and independent opening.
- [ ] Web Clip download, payload review, installation and removal.
- [ ] Offline cold start/save/read/export after successful shell caching.
- [ ] Offline OCR after preparation; real payment formats with manual confirmation.
- [ ] Dictation, PNG save/share, themes/motion and keyboard layout.
- [ ] Same-address update and full restore on another device/entry point.

Connection detection or Safari launch is not proof of installation or completed device checks. Record observed results only. Keep device IDs, passcodes, payment data and diagnostic dumps out of the repository and issues.

## v0.2.0 validation

The actual navigation/startup/image-save code paths have regression tests for the reported scroll retention, repeated notification and download-first behaviors. Added tests cover profile/photo backup references, multiple entries, receipt lists, payee direction, compound amounts, tagged clipboard input, signed installer headers, microphone release/permission races and resampling.

The local Whisper-base model was run against a synthetic Mandarin recording on the desktop CPU, then its optimized encoder was also initialized and executed through the browser-oriented WASM backend. The four sample amounts entered the multi-entry parser. This is not an iPhone accuracy or latency benchmark. Names can still be misrecognized; the confirmation list remains required.

Remaining physical checks: microphone permission and hold/cancel on iOS, cold offline speech, actual payment screenshots, signed shortcut import/execution, Safari/Web Clip clipboard handoff, and Photos sharing. No private screenshots, recordings or device diagnostics are included in source.

## v0.2.1 download regression

Four regressions were observed failing before the fix: a Service Worker withheld a large response while `Cache.put` consumed it, an unready worker wait did not cancel, entry tabs stayed locked during preparation, and page navigation stayed locked after closing a pending download. Tests also cover resumed byte counts, complete cache writes before success, truncated responses, stale readiness checks and late callbacks from cancelled downloads.

The local in-app browser was exercised with real model files and a throttled HTTP server: progress advanced before the model finished, switching to text worked during download, and closing a restarted download left the My navigation responsive. A separate fast local download reached the explicit ready state with the microphone button enabled. This is desktop browser evidence; the iPhone update and on-device recognition remain physical checks.

## v0.2.2 validation

New failing regressions covered the missing attachment installer URL, preparation being cancelled by page/sheet navigation, and restarting a model instead of reusing saved range chunks. Automated tests verify a resumed model's exact bytes, cleanup to one full resource, fallback for hosts without Range, and ignoring callbacks from a paused older task.

At a 393×852 browser viewport, manual, batch and recurring date inputs stayed inside their labels and the sheet had no horizontal overflow. Initial focus moved to the dialog heading; keyboard Tab still gave the close button a visible focus indicator. This is browser layout evidence, not an iOS native date-picker certification.

A throttled local server served the real voice assets with HTTP Range: closing the sheet and navigating to My kept downloading, manual pause retained 12 MiB in six chunks, reload preserved them, and the next request resumed at byte 12582912. Completion showed 97.9 MiB of full resources and zero partial chunks. The signature-preserving shortcut link downloaded an actual `.shortcut` file instead of opening a document page. The public attachment headers and Range support were also checked over HTTP.

iPhone-specific remaining checks: native date control rendering, Safari/Files importing the signed shortcut and its screenshot handoff, and iOS suspension/resumption behavior. A desktop download is not proof of those OS flows.

## v0.2.3 shortcut connectivity

The previous installer required a GitHub release URL followed by an attachment CDN redirect. Both files were valid on the desktop, but the reported phone flow stalled after Safari opened. The new path prepares and verifies same-origin files before the tap, then shares or saves those local files without navigating to an external attachment host.

Tests cover same-origin URLs, both signed file digests, shared preparation, immediate native-share invocation, rejected HTML/corrupt data, and share cancellation. The in-app browser exercised both save buttons: filenames retained `.shortcut`, exact byte counts and SHA-256 matched source, and the page stayed on its original URL. The app sheet and standalone installation page both showed ready states.

This verifies local file delivery, not iPhone OS import. iOS native share targets and adding the signed workflow still require physical acceptance.
