# Tech baseline

**Last verified:** 2026-10-06

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
| @codemirror/* | 6.x | `@codemirror/view` 6.43, lang-javascript/css/json; ~435 KB options chunk |

## Tooling (ADR-004)

- **pnpm 12** via `packageManager` field; run with `corepack pnpm …` (no global pnpm needed)
- `extension/` is a standalone package; add a root `pnpm-workspace.yaml` when `cli/` exists
- Scripts: `test`, `typecheck` (`wxt prepare && tsc --noEmit && svelte-check --fail-on-warnings`), `build`, `build:firefox`, `dev`, `dev:firefox`, `zip`, `zip:firefox`, `e2e:chrome`
- Output: `extension/.output/{chrome-mv3,firefox-mv3}/` (gitignored, as are `.wxt/` and `node_modules/`)
- E2E: `pnpm build && CHROME=/path/to/chrome pnpm e2e:chrome`. puppeteer-core `launch({ pipe: true, enableExtensions: true })` + `installExtension` (CDP `Extensions.loadUnpacked`). Chrome for Testing 154, 2026-10-06: 41/41

## Ops / cost

- **$0** recurring cloud: no Detour server, no mandatory BaaS
- Distribution: browser stores + GitHub Releases
- Optional analytics: only if privacy-safe and never includes rule bodies/file contents (default off). Firefox manifest declares `data_collection_permissions: { required: ['none'] }`.

## Free-for-life constraint

Any new dependency must not introduce a paid API key requirement for Core features.
