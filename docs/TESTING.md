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
