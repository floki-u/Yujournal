# Changelog

## 0.2.3 — 2026-10-14

- Remove GitHub Release/CDN navigation from shortcut installation. Prepare and verify the signed files on the app origin, then share or save local files from the user's tap.
- Cache the two small installers with the app shell, reuse preparation, and show ready/retry/cancel states.
- Keep iOS native sharing within the tap's activation window; provide an explicit save-file alternative without displaying binary documents.

## 0.2.2 — 2026-10-14

- Keep one voice-pack download running when closing the entry sheet or changing pages; add visible progress and explicit pause/continue controls.
- Resume large resources from saved 2 MiB HTTP Range chunks. Merge and remove temporary chunks after completion; hosts without ranges fall back to replacing the whole file.
- Show complete/partial speech resource storage separately and clear both without touching ledger data.
- Constrain native date fields and grid columns, allow only vertical sheet scrolling, and focus the dialog heading initially while keeping keyboard button focus indicators.
- Download signed shortcuts from attachment endpoints, preserve `.shortcut` filenames, and separate installation instructions from screenshot/voice usage.
- Explain PWA installation, automatic shell updates and local cache behavior in a Chinese FAQ.

## 0.2.1 — 2026-10-14

- Return uncached voice responses immediately; the optional downloader owns streaming and cache writes, so large model files show live progress.
- Release the global action lock while preparing speech resources. Switching entry modes or closing the sheet cancels preparation without freezing navigation.
- Bound readiness, connection and cache waits; preserve completed files for retries and reject incomplete responses.
- Show a progress bar, downloaded bytes/resource count and explicit ready/retry states; ignore callbacks from cancelled downloads and stale readiness checks.

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
