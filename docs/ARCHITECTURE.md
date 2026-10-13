# Architecture

Static HTML/CSS/JavaScript. `index.html` loads presentation helpers and `src/app.js`. No production npm packages, business server, remote user database or API key.

| Location                                                    | Responsibility                                                  |
| ----------------------------------------------------------- | --------------------------------------------------------------- |
| `src/app.js`                                                | Forms, UI state, commands, file downloads and installation help |
| `src/lib/ledger.js`                                         | Accounting, plans, recurrence, achievements and merge           |
| `src/lib/database.js`                                       | Atomic IndexedDB writes and cross-window updates                |
| `src/lib/backup.js`                                         | Versioned binary backups, checks and encryption                 |
| `src/lib/parser.js`, `exchange.js`, `ocr.js`                | Text parsing, quotations and local recognition                  |
| `src/features.js`, `views.js`, `theme-studio.js`, `styles/` | Calendars, reports, presentation and themed worlds              |
| `scripts/`                                                  | Static builds, profile generation and release packaging         |

Amounts are integer hundredths (`amountScale=100`); JPY input is whole-number only. Each record stores original currency, adopted rate/date/source and frozen CNY `baseAmount`. Stock losses are ordinary expenses. Opening assets are not income; plan allocation assigns existing assets without another expense.

Entities use stable UUIDs. A fixed record uses `fixed:<template ID>:<due date>` as its ID, so two devices cannot double count the same bill after merge. Pending bills freeze a template snapshot; edits affect future bills. Catch-up runs on opening, with no permanent iOS background scheduler.

State/images commit together; invalid input aborts the transaction. Edits compare monotonic update timestamps; full restore compares the ledger revision. Database/channel names are app-path scoped. The serialized ledger and `.yuji` format remain compatible with the initial version.

Shell caches are scoped and versioned by build content. Theme art/font cache after use; OCR is optional and separate. LSTM recognition selects one normal/SIMD build. Vendored resources have sources/versions/hashes/notices.

Reports use frozen accounting values: summary 1080×1800, at most 60 detail rows per page. Only the current canvas is kept. Reduced-motion preference disables action animation.
