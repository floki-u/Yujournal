# Contributing

Focused issues and PRs are welcome. Explain the user-visible problem and reproduce it with synthetic data. Hide amounts, identities, card details and transaction IDs in screenshots. Never upload `.yuji` backups.

Use Node.js 24 and `npm ci`; follow [TESTING.md](docs/TESTING.md). Format with `npm run format`. Add behavior tests for money, recurrence, persistence and backup changes rather than tests that mirror presentation code.

Keep production static and local-first. Do not introduce analytics, uploads, cloud accounts or remote OCR. Preserve data formats or provide explicit, protected migrations. Keep profiles removable and restricted to one Web Clip.

Submit small PRs with clear behavior and relevant validation. Preserve upstream notices and record version/source/hashes when updating resources. Treat contributors respectfully; use [SECURITY.md](SECURITY.md) for security reports.
