# Distribution

Detour is free and MIT. CI and packaging use GitHub Actions on the free tier. There is no Detour server and no store API token in this repo.

The installed extension name stays **Detour**. Store listings should use **Detour — Resource Override** so it is not confused with the unrelated Firefox proxy add-on. See [store-listing.md](store-listing.md), [permissions.md](permissions.md), and [privacy.md](privacy.md).

## Run the same checks as CI

From `extension/`, with Node 24 (see `/.node-version`) and pnpm 12.9.1 via Corepack:

```sh
cd extension
corepack pnpm install --frozen-lockfile
corepack pnpm test
corepack pnpm typecheck
corepack pnpm build
corepack pnpm build:firefox
CHROME=$(node scripts/install-chrome.mjs) corepack pnpm e2e:chrome
corepack pnpm zip
corepack pnpm zip:firefox
```

`corepack pnpm ci` runs that sequence and expects `CHROME` to be set already. `scripts/install-chrome.mjs` prints a Chrome for Testing **stable** binary (cached under `~/.cache/puppeteer` unless `CHROME_CACHE` is set). On Linux, install its libraries once as root:

```sh
sudo env PATH="$PATH" node scripts/install-chrome.mjs --deps
```

GitHub Actions sets `CI`, which makes the smoke test pass `--no-sandbox`, `--disable-dev-shm-usage`, and `--disable-gpu`. A local run does not.

## Packages

`zip` and `zip:firefox` rebuild, then write into `extension/.output/` (gitignored):

| File | Use |
|------|-----|
| `detour-<version>-chrome.zip` | Chrome Web Store and Edge Add-ons |
| `detour-<version>-firefox.zip` | Firefox AMO |
| `detour-<version>-sources.zip` | AMO source upload (produced with the Firefox zip) |

`<version>` is `extension/package.json` (`0.1.0` today). The root [LICENSE](../../LICENSE) is MIT. The sources zip excludes `node_modules`, tests, `.output`, `.wxt`, and secret-like files (`.env`, `*.pem`, `*.p12`).

## What CI does

[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) runs on pull requests, pushes to `main`, and `v*` tags:

1. `pnpm install --frozen-lockfile`
2. `pnpm test`
3. `pnpm typecheck` (`wxt prepare`, `tsc --noEmit`, `svelte-check --fail-on-warnings`)
4. `pnpm build` and `pnpm build:firefox`
5. Chrome for Testing stable, then `pnpm e2e:chrome`
6. `pnpm zip` and `pnpm zip:firefox`
7. Uploads the zips as the `detour-packages` artifact

Firefox UI smoke is not in CI. Firefox’s automation cannot open extension pages.

A tag named `v*` (for example `v0.1.0`) also opens a GitHub Release and attaches those zips. Notes are generated from commits. Edit them using [release-notes.md](release-notes.md). The release uses the automatic `GITHUB_TOKEN` only.

```sh
git tag v0.1.0
git push origin v0.1.0
```

Do that only after `main` is on the remote and CI is green. This workspace does not push by itself.

## Pushing (when you want CI to run)

There is no git remote until you add one. Example, after you create an empty GitHub repo:

```sh
git remote add origin git@github.com:<owner>/<repo>.git
git push -u origin main
```

Branch protection (require the CI check before merge) is a GitHub setting, not a file in this repo.

Store upload stays manual. Secret names, if you later automate it, are listed in [store-listing.md](store-listing.md). Do not commit the values.
