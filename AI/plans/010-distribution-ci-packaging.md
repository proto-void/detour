# 010 — distribution CI and packaging

**Status:** Done  
**Date:** 2026-10-07  
**Spec:** [distribution](../specs/distribution.md) — Approved for CI + packaging (Hamza, 2026-10-07)

## Goal

GitHub Actions (free tier) runs the extension checks on pull requests and `main`, and `v*` tags attach store zips to a GitHub Release. Store submission stays a written checklist. No store secrets. No Local Bridge.

## Design

- One workflow, `.github/workflows/ci.yml`. Job `verify` runs unit tests, typecheck, both builds, Chrome for Testing e2e, then `zip` / `zip:firefox`, and uploads the zips. Job `release` runs only on `v*` tags and publishes those zips with `gh release create` and `github.token`
- pnpm **12.9.1** (the `packageManager` pin) via `pnpm/action-setup`. Node **24**
- Chrome: `extension/scripts/install-chrome.mjs` uses `@puppeteer/browsers` (`chrome@stable`). On Linux CI, a root re-run passes `--deps` so `apt-get` can install libraries
- `e2e/chrome-smoke.mjs` adds `--no-sandbox`, `--disable-dev-shm-usage`, and `--disable-gpu` only when `CI` is set
- Zip base name `detour` so artifacts are `detour-<version>-chrome.zip`, `detour-<version>-firefox.zip`, and `detour-<version>-sources.zip` (AMO). Secret-like files and `.wxt/` stay out of the sources zip
- Reviewer docs under `docs/distribution/`. Manifest display name stays `Detour`
- This workspace has **no git remote**. The docs say how to add one and push. This plan does not push

## Tasks

- [x] T1 Spec Approved for CI + packaging; this plan
- [x] T2 CI workflow, Chrome install script, CI-only browser flags
- [x] T3 Zip naming, release job, store / privacy / permissions docs
- [x] T4 Run the CI commands locally
- [x] T5 KB write-back. Commits on `main`. Do not push

## Out of scope

Local Bridge, `cli/`, npm publish, Safari, automated CWS / AMO / Edge upload, renaming the installed extension, a public privacy-policy URL (needs a remote).

## Verification

327 unit tests; typecheck clean; Chrome and Firefox builds warning-free; `CI=1` `e2e:chrome` 62/62 on Chrome for Testing 155.0.8059.39. Zips: `detour-0.1.0-chrome.zip`, `detour-0.1.0-firefox.zip`, `detour-0.1.0-sources.zip` (no `node_modules`, `.env`, or `.wxt`). Not pushed.
