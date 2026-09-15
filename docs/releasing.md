# Preparing an independent repository and release

This directory is self-contained. It can be moved anywhere without changing
imports, build paths or runtime configuration.

## Local verification

```sh
npm ci
npm run check
npm run benchmark
npm pack --dry-run
npm pack
```

Inspect the tarball file list, install it in an empty temporary project, and
exercise both the root and experimental exports. Ensure `LICENSE`, `NOTICE`
and `licenses/unicode-3.0.txt` are included. Regenerate benchmark output when
codec behavior changes and explain runtime-dependent size differences.

## Repository publication

Before publishing, choose the repository owner and available package name.
The source uses `base2300` as its project/package name; npm name availability
and ownership are not assumed. Add the actual repository, homepage and issue
URLs to `package.json` only after the repository exists.

If starting from an archive without Git metadata:

```sh
git init -b main
git add .
git commit -m "Initial standalone Base2300 source"
```

Create the intended GitHub repository using your authenticated account, add it
as `origin`, and push `main`. Enable private vulnerability reporting if desired.
CI verifies supported Node versions. The initial workflow does not publish
packages or deploy a website automatically.

## Package release

Keep package version and wire version separate: a package patch must not
silently change an existing alphabet, header assignment or decoder meaning.
`prepublishOnly` runs `npm run check`, so a failing build or test blocks
`npm publish`.

### First release (manual, once)

npm Trusted Publishing is configured in the package settings on npmjs.com, so
the package has to exist before it can be enabled. Publish the first version
from a logged-in machine. npm requires two-factor authentication on the account
for direct publishing (`npm publish` otherwise fails with `E403 ... Two-factor
authentication ... is required`); enable it under Account → Two-Factor
Authentication on npmjs.com first.

```sh
npm login
npm run check
npm pack --dry-run          # review the file list
npm publish --access public # prompts for the 2FA code
git tag v0.1.0 && git push origin v0.1.0
```

Pushing the tag also triggers `publish.yml`; it verifies the commit and skips
`npm publish` because the version already exists on the registry.

Then open the package on npmjs.com → Settings → *Trusted Publisher* and add:

- Publisher: GitHub Actions
- Organization or user: `fricklik`
- Repository: `base2300`
- Workflow filename: `publish.yml` (filename only)
- Environment name: leave empty

### Later releases (GitHub Actions, no token)

1. Bump `version` in `package.json` and describe the release in `CHANGELOG.md`.
2. Commit, then tag the exact commit with the same version: `git tag v1.2.3`.
3. `git push origin main v1.2.3`.

`.github/workflows/publish.yml` runs on `v*` tags: it checks that the tag
matches `package.json`, runs `npm ci`, `npm run check` and `npm pack --dry-run`,
then `npm publish --access public` through OIDC (`id-token: write`). npm
generates provenance attestations automatically for public repositories.
The workflow needs npm ≥ 11.5.1 and installs the latest npm on Node 24.

## Browser demo

`npm run build && npm run demo` serves the checked-out demo locally. To host it,
publish `demo/` and `dist/` with the same relative layout and serve `demo/index.html`.
The demo has no remote font, analytics, API endpoint or model dependency.

Optional browser smoke test (Playwright is a development-only tool):

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node scripts/check-browser.mjs
```

This requires permission to bind a loopback port and launch Chromium. It checks
actual UI conversions, Unicode recovery, malformed input, limits, mobile overflow
and unexpected network requests. It is separate from Node's codec tests.

To reuse a Playwright installation from elsewhere, set
`BASE2300_PLAYWRIGHT_MODULE` to the path of its ESM entry file (for example
`/path/to/node_modules/playwright/index.mjs`; a directory or the CommonJS
`index.js` does not resolve the named `chromium` export). Set
`BASE2300_SCREENSHOT=/tmp/demo.png` to also save a full-page screenshot.
See [validation.md](validation.md) for the recorded result.
