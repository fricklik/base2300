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

Confirm the chosen npm name and publisher account, review `npm pack --dry-run`,
and publish only the reviewed release. Tag the exact released commit. Keep
package version and wire version separate: a package patch must not silently
change an existing alphabet, header assignment or decoder meaning.

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
