# Distribution

Detour is free and MIT. CI and packaging use GitHub Actions on the free tier. There is no Detour server and no store API token in this repo.

The installed extension name is **Detour**. Store listings use **Detour** (short description clarifies resource overriding so it is not confused with the unrelated Firefox proxy add-on). See [store-listing.md](store-listing.md), [permissions.md](permissions.md), and [privacy.md](privacy.md).

## Run the same checks as CI

From the repo root, with Node 24 (see `/.node-version`) and pnpm 12.9.1 via Corepack. The lockfile is `pnpm-lock.yaml` at the root (`extension/` and `cli/`):

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @detour/cli test
corepack pnpm --filter @detour/cli typecheck
corepack pnpm --filter @detour/extension test
corepack pnpm --filter @detour/extension typecheck
corepack pnpm --filter @detour/extension build
corepack pnpm --filter @detour/extension build:firefox
cd extension
CHROME=$(node scripts/install-chrome.mjs) corepack pnpm e2e:chrome
corepack pnpm zip
corepack pnpm zip:firefox
```

The store zips are the extension only. Local Bridge is `corepack pnpm --filter @detour/cli exec detour bridge <folder>` (see `cli/README.md`). It is not published to npm from CI.

`corepack pnpm ci` runs that sequence and expects `CHROME` to be set already. `scripts/install-chrome.mjs` prints a Chrome for Testing **stable** binary (cached under `~/.cache/puppeteer` unless `CHROME_CACHE` is set). On Linux, install its libraries once as root:

```sh
sudo env PATH="$PATH" node scripts/install-chrome.mjs --deps
```

GitHub Actions sets `CI`, which makes the smoke test pass `--no-sandbox`, `--disable-dev-shm-usage`, and `--disable-gpu`. A local run does not.

## Packages

`zip` and `zip:firefox` rebuild, then write into `extension/.output/detour/` (gitignored):

| File | Use |
|------|-----|
| `detour-<version>-chrome.zip` | Chrome Web Store and Edge Add-ons (extension only; includes `README-load-unpacked.md`) |
| `detour-<version>-firefox.zip` | Firefox AMO |
| `detour-<version>-sources.zip` | AMO source upload (produced with the Firefox zip) |

### OS packs (extension + Databases helper)

Self-sufficient sideload packs (ADR-029). **Not** for store upload. CI builds Detour packs.

| File | Use |
|------|-----|
| `detour-<version>-windows-x64.zip` | Windows + SEA helper |
| `detour-<version>-macos-arm64.zip` | Apple Silicon + SEA helper |
| `detour-<version>-macos-x64.zip` | Intel Mac + SEA helper |
| `detour-<version>-linux-x64.tar.gz` | Linux x64 + SEA helper |

Local (current machine):

```sh
corepack pnpm --filter @detour/extension build
corepack pnpm --filter @detour/cli sea:build
corepack pnpm pack:os
# → cli/.packs/detour-<ver>-<os>-<arch>.zip (or .tar.gz on Linux)
```

In-pack READMEs are generated from `cli/pack/templates/` (single source with the root README links).

**QA sideload (Chrome zip):** send `detour-<version>-chrome.zip` (extension only; includes `README-load-unpacked.md` and `load-unpacked-steps.jpg`). Recipient: unzip first (do not Load unpacked the `.zip`), then in Chrome:

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the **unzipped folder** that contains `manifest.json`

See the annotated screenshot in the zip (`load-unpacked-steps.jpg`) or in `extension/public/`. For Databases, use a Detour OS pack (Load unpacked → `extension/` inside the pack, then Install Helper) or `detour db install` from this repo.

**Agent / local delivery DoD:** Detour `zip` only (Rogers product retired — plan 033).


`<version>` is `extension/package.json` (`0.1.1` today). The root [LICENSE](../../LICENSE) is MIT. The sources zip excludes `node_modules`, tests, `.output`, `.wxt`, and secret-like files (`.env`, `*.pem`, `*.p12`).

## What CI does

[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) runs on pull requests, pushes to `main`, and `v*` tags:

1. `pnpm install --frozen-lockfile`
2. `pnpm test`
3. `pnpm typecheck` (`wxt prepare`, `tsc --noEmit`, `svelte-check --fail-on-warnings`)
4. `pnpm build` and `pnpm build:firefox`
5. Chrome for Testing stable, then `pnpm e2e:chrome`
6. `pnpm zip` and `pnpm zip:firefox`
7. Uploads the zips as the `detour-packages` artifact
8. SEA matrix (`windows-x64`, `macos-arm64`, `macos-x64` via Intel runner, `linux-x64`): build, smoke `--version` / stdio ping / `install --dry-run`
9. `os-packs` job assembles the four Detour OS packs

Firefox UI smoke is not in CI. Firefox’s automation cannot open extension pages.

A tag named `v*` (for example `v0.1.0`) also opens a GitHub Release and attaches store zips **and** OS packs. Notes are generated from commits. Edit them using [release-notes.md](release-notes.md). The release uses the automatic `GITHUB_TOKEN` only.

```sh
git tag v0.1.0
git push origin v0.1.0
```

Do that only after `main` is on the remote and CI is green. This workspace does not push by itself.

## Pushing (when you want CI to run)

There is no git remote until you add one. Example, after you create an empty GitHub repo:

```sh
git remote add origin git@github.com:proto-void/detour.git
git push -u origin main
```

Product site (privacy + marketing): [https://detour.protovoid.com](https://detour.protovoid.com). Chrome Web Store assets checklist: [store-assets/README.md](store-assets/README.md).

Branch protection (require the CI check before merge) is a GitHub setting, not a file in this repo.

Store upload stays manual. Secret names, if you later automate it, are listed in [store-listing.md](store-listing.md). Do not commit the values.
