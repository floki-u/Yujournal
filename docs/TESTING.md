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
