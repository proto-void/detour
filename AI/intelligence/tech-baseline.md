# Tech baseline

**Last verified:** 2026-10-08

## Locked (ADR-001)

| Layer | Choice |
|-------|--------|
| Extension framework | WXT |
| Language | TypeScript |
| UI | Svelte 5 |
| Code editor | CodeMirror 6 (options page only; separate chunk) |
| Validation | valibot |
| Local Bridge | Node.js CLI |
| License | MIT |

## Installed versions (extension/, 2026-10-06)

| Package | Version | Note |
|---------|---------|------|
| wxt | 0.21.4 | `srcDir: 'src'`, `manifestVersion: 3` forced for all targets |
| vite | 8.3.x | WXT peer dependency |
| typescript | ~6.0.3 | Pinned below 7.x (native compiler); Svelte/WXT tooling still uses the JS compiler API |
| svelte / @wxt-dev/module-svelte | 5.57 / 2.0.5 | Popup + options entrypoints |
| valibot | 1.5.0 | Runtime dependency |
| vitest | 5.0.3 | `WxtVitest()` plugin → `fakeBrowser` storage in tests |
| puppeteer-core | 25.12 | `e2e/chrome-smoke.mjs`; Chrome for Testing via `CHROME=` |
| @puppeteer/browsers | 3.2.3 | `scripts/install-chrome.mjs` installs `chrome@stable` and prints the binary path |
| @codemirror/* | 6.x | `@codemirror/view` 6.43, lang-javascript/css/json; ~435 KB options chunk |

## Tooling (ADR-004)

- **pnpm 12** via `packageManager` field; run with `corepack pnpm …` (no global pnpm needed)
- Root `pnpm-workspace.yaml` includes `extension/` and `cli/`. One lockfile: `pnpm-lock.yaml`. Install from the repo root
- Scripts: `test`, `typecheck` (`wxt prepare && tsc --noEmit && svelte-check --fail-on-warnings`), `build`, `build:firefox`, `dev`, `dev:firefox`, `zip`, `zip:firefox`, `e2e:chrome`, `chrome:install`, `ci`
- Node **24** (`.node-version`). CI installs pnpm 12.9.1 with `pnpm/action-setup` so it matches `packageManager` without Corepack’s signature check
- Output: `extension/.output/{chrome-mv3,firefox-mv3}/` (gitignored, as are `.wxt/` and `node_modules/`)
- Zips (also gitignored): `detour-<version>-chrome.zip`, `detour-<version>-firefox.zip`, `detour-<version>-sources.zip`. `zip.name` is `detour` so the scoped package name is not collapsed to `detourextension`
- E2E: `pnpm build && CHROME=/path/to/chrome pnpm e2e:chrome` from `extension/`. puppeteer-core `launch({ pipe: true, enableExtensions: true })` + `installExtension`. When `CI` is set, args add `--no-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`. Chrome for Testing 155 stable, 2026-10-08: 127/127, including one script served by `@detour/cli` on port 8099, a stylesheet inserted by `setHTMLUnsafe` with scripts off, a stylesheet parsed by `Document.parseHTMLUnsafe` then adopted into the live document, a script whose `integrity` Attr was moved with `setAttributeNode`, a script whose `integrity` Attr was adopted with `setNamedItem` and then written again through `Attr.value`, a script inserted by `document.write` whose production hash was split across arguments, and a script in an iframe `srcdoc` whose production hash was rewritten before the frame parsed it
- **CLI:** `@detour/cli`. Node 24 runs `cli/src/cli.ts` with type stripping (`node --experimental-strip-types`, or `pnpm --filter @detour/cli exec detour bridge <folder>`). Tests are `node --test`. Default port 47321. No npm publish
- CI: `.github/workflows/ci.yml` on pull requests, `main`, and `v*` tags. The tag job attaches the three zips to a GitHub Release with `github.token`. No store API secrets. No remote in the workspace yet, so the workflow has not run on GitHub

## Ops / cost

- **$0** recurring cloud: no Detour server, no mandatory BaaS
- Distribution: browser stores (manual upload) + GitHub Releases from a `v*` tag. Docs in `docs/distribution/`. GitHub Actions free tier only
- Optional analytics: only if privacy-safe and never includes rule bodies/file contents (default off). Firefox manifest declares `data_collection_permissions: { required: ['none'] }`.

## Free-for-life constraint

Any new dependency must not introduce a paid API key requirement for Core features.
