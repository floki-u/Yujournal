# Changelog

## 0.2.0 — 2026-10-13

- Fix repeated offline-ready notifications and reset the actual main/dialog scroll containers on navigation.
- Keep notifications in reserved layout space; report saving defaults to iOS image sharing with an in-app image fallback.
- Add editable profile names, built-in/custom avatars and profile-image backup coverage.
- Preserve screenshot resolution, add crop selection and review, and fix payee/direction, receipt-list dates and mixed numeric units.
- Add optional on-device Whisper-base q8 voice recognition, long-press/cancel handling and multi-entry batch confirmation.
- Remove unused encoder attention output exports for text-only inference; release speech workers after use.
- Include Apple-signed screenshot/voice shortcuts and an explicit local clipboard bridge, with an app-side receiver switch.

## 0.1.0 — 2026-10-13

First public source release of Yujournal (余记).

- Local iPhone ledger, calendar browsing, initial assets and savings plans.
- Sentence/dictation entry and local screenshot OCR.
- Recurrence, pending confirmation and stable occurrence IDs.
- Cached reference FX and frozen/actual settlement amounts.
- Badges, wearable achievements, themed worlds and default appearance modes.
- Report PNGs and complete optional-encrypted `.yuji` backups.
- Portable build, Pages CI, removable Web Clip and release downloads.

Device-validation limits are documented in [TESTING.md](docs/TESTING.md).
