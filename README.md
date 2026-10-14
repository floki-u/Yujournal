<p align="center"><img src="icon.svg" width="76" alt="Yujournal icon"></p>

# Yujournal · 余记

**A quiet, offline-first ledger. Your records stay on your device.**

[![CI](https://github.com/floki-u/Yujournal/actions/workflows/ci.yml/badge.svg)](https://github.com/floki-u/Yujournal/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![PWA](https://img.shields.io/badge/iPhone-PWA-43694c.svg)](docs/INSTALL.zh-CN.md)

[Open the app](https://floki-u.github.io/Yujournal/) · [Install on iPhone](https://floki-u.github.io/Yujournal/install.html) · [Download Web Clip](https://floki-u.github.io/Yujournal/Yujournal.mobileconfig) · [Releases](https://github.com/floki-u/Yujournal/releases)

[简体中文](README.zh-CN.md)

Yujournal is a personal bookkeeping PWA designed for iPhone. It opens as a standalone Home Screen web app, without the App Store, a paid Apple developer account, or recurring app re-signing. The interface currently uses Simplified Chinese.

**0.2.3 is an early release.** Automated tests and selected desktop browser flows have passed; remaining device checks are documented in [TESTING.md](docs/TESTING.md).

See the [Chinese FAQ](docs/FAQ.zh-CN.md) for PWA installation, automatic updates, resumable voice downloads and local cache cleanup.

## Features

- Record income/expenses from a sentence, press-and-hold local voice recognition or iOS keyboard dictation, or locally recognized payment screenshots. Review before saving.
- Browse a selected day, month, or year with a calendar. Daily spending and overall assets have separate views.
- Schedule weekly/monthly/yearly entries. Each template books automatically or awaits confirmation when the app next opens.
- Set one opening asset balance and create savings plans; collect and wear badges to permanently unlock four themed worlds. The default theme supports system/light/dark modes.
- Use eight currencies with automatically cached daily reference rates; generate report images; export/restore complete `.yuji` backups including optional screenshots and achievements.

## A few different worlds

<p><img src="assets/mint-thumb.webp" width="150" alt="Mint island artwork"> <img src="assets/postcard-thumb.webp" width="150" alt="Postcard artwork"> <img src="assets/starlight-thumb.webp" width="150" alt="Moon sea artwork"> <img src="assets/pixel-thumb.webp" width="150" alt="Pixel village artwork"></p>

These are theme backgrounds, not screenshots or device-test evidence. Themes combine backgrounds, companions, icons, typography and short action animations, respecting reduced-motion preferences.

## Install

Open the [app](https://floki-u.github.io/Yujournal/) in iPhone Safari, then choose **Share → Add to Home Screen → Open as Web App → Add**. Begin regular bookkeeping from the installed icon.

Alternatively, download [Yujournal.mobileconfig](https://floki-u.github.io/Yujournal/Yujournal.mobileconfig), allow the download, and open **Settings → Profile Downloaded → Install**. The unsigned, removable profile adds exactly one full-screen Web Clip, without MDM enrollment, VPN, certificates or device restrictions. Installation confirmation and the passcode stay on your phone. See the [step-by-step guide](docs/INSTALL.zh-CN.md).

## Data and offline behavior

The static host serves program/theme assets. Yujournal does not upload transactions, notes, screenshots, plans, passwords or backups. Records live in IndexedDB; there is no business account, analytics SDK or cloud ledger. The public Pages app does not require ChatGPT login.

Profile names and avatars are editable and included in complete backups. Voice can split multiple entries for one reviewed batch save. Apple-signed [Shortcuts](docs/SHORTCUTS.zh-CN.md) provide screenshot sharing and a voice launcher.

The optional local Chinese voice pack is about **98 MiB**. It is downloaded only on request; raw audio is processed in a local worker, never uploaded or retained. Recognition errors still require manual review.

After the first successful online load, the Service Worker caches the shell. Screenshot recognition prepares about **7.5 MiB** once on demand, runs in one local Tesseract worker and retains images only if you opt in. OCR/font licenses are included.

Rate requests send only currencies and quotation dates to [Frankfurter](https://frankfurter.dev/). These are daily reference rates, not live trading prices. Each record freezes its conversion; actual CNY settlement can override it. iOS dictation follows Apple's settings. See [PRIVACY.md](docs/PRIVACY.md).

**Export complete `.yuji` backups regularly.** Browser storage may be cleared or evicted. Backups support validation, optional encryption, merge and full restore. An installation profile or Home Screen icon is not a data backup.

## Develop and self-host

Use Node.js 24+. The deployed app is plain static HTML/CSS/JavaScript, with no server-side runtime or production npm dependencies.

```sh
git clone https://github.com/floki-u/Yujournal.git
cd Yujournal
npm ci
npm test
npm run check
npm run build
npm run dev
```

Open `http://127.0.0.1:4313/`. To use your own HTTPS host:

```sh
YUJOURNAL_APP_URL=https://example.com/ledger/ npm run build
```

Deploy only `dist/`; its Web Clip points to that address. See [DEPLOYMENT.md](docs/DEPLOYMENT.md) and [ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Platform limits

A PWA cannot read WeChat, Alipay or banking-app transactions; provide screenshots/text. Recurring entries catch up on opening rather than using a permanent background scheduler. Native WidgetKit balance widgets are unavailable; Shortcuts can provide a quick entry launcher. OS storage separation can affect Safari/installed entries: export before changing devices, origins or installation paths.

## Contribute and license

Read [CONTRIBUTING.md](CONTRIBUTING.md), open an [issue](https://github.com/floki-u/Yujournal/issues), or submit a focused PR. Do not attach real payment screenshots, backups or personal ledger data. See [SECURITY.md](SECURITY.md) for vulnerability reports.

Project code, docs and project-created artwork use [MIT](LICENSE). Vendored Tesseract code/models and Pixelify Sans retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
