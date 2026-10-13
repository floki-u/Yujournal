# Deployment

Serve the contents of `dist/` at a stable HTTPS URL. There is no business backend or required runtime secret.

## GitHub Pages

Use **GitHub Actions** as the Pages source. `.github/workflows/pages.yml` checks/builds pushes to `main`, uploads only `dist/`, and deploys to the Pages environment. The generated Web Clip uses the URL returned by `actions/configure-pages`. Actions are pinned to full commit SHAs.

For a fork, enable Pages in your repository settings and use your own deployment/profile. The original project's profile still points at the original project.

## Another host

```sh
npm ci
YUJOURNAL_APP_URL=https://example.com/ledger/ npm run build
```

Deploy `dist/` contents under `/ledger/`. Relative links, manifest scope and the worker support subdirectories. Rebuild the profile when the URL changes.

Serve JavaScript/manifest with appropriate MIME types. `.traineddata.gz` is binary: **do not set `Content-Encoding: gzip`** on model files, because OCR decompresses them itself. The ideal `.mobileconfig` MIME is `application/x-apple-aspen-config`; generic downloads can be opened in iPhone Files. The dev server sets the profile MIME explicitly.

Avoid untrusted code on the same origin, which controls access to local browser data. Keep HTTPS, origin, path and storage identity stable. Address changes need backup migration; same-address program updates do not clear the ledger.

## Release downloads

```sh
npm run build
npm run release:pack
```

`.release/` contains a web tarball, Web Clip, Chinese install guide and `SHA256SUMS.txt`. These are generated download assets. The release source archive is the reviewed Git repository. Do not put local `.yuji` backups in releases.
