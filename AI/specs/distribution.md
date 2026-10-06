# Spec: distribution

**Status:** Approved — CI + packaging (Hamza, 2026-10-07)  
**Last updated:** 2026-10-07  
**Build order:** 9  
**Depends on:** extension modules that are already built. Store listing copy describes the current extension, not Local Bridge.

This approval covers CI, store-ready zips, a GitHub Release workflow for those zips, and reviewer docs. It does not approve Local Bridge, npm publishing, or automated Chrome Web Store / AMO / Edge submission.

## Objective

Define how Detour is built, versioned, and published to browser stores and GitHub Releases as a free MIT project — including naming disambiguation from unrelated “Detour” listings.

## User stories

- As a user, I can install Detour from Chrome Web Store / AMO / Edge with clear permission rationale.
- As a developer, I can download the CLI from GitHub Releases or npm (`@detour/cli`) once Local Bridge is Approved.
- As a maintainer, CI produces extension zips on the GitHub Actions free tier, with no paid infra and no store credentials in the repo.

## Acceptance criteria

Approved for this slice:

- [x] Store listing title/subtitle distinguishes resource override (AMO has unrelated Detour proxy) — docs, not a manifest rename
- [x] Permissions justification doc for reviewers
- [x] CI on pull requests and `main`: unit tests, typecheck (`tsc` + `svelte-check`), Chrome and Firefox MV3 builds, and store zips. There is no separate ESLint script; typecheck is the static gate
- [x] CI runs `pnpm e2e:chrome` with Chrome for Testing from `@puppeteer/browsers` (`chrome@stable`) on every pull request and on `main`
- [x] GitHub Release assets for the extension zips (Chrome zip, Firefox zip, Firefox sources zip) on `v*` tags, using the built-in `GITHUB_TOKEN`
- [x] LICENSE MIT at repo root (already present)
- [x] Privacy policy: no account; local data; telemetry off by default

Still open (not this approval):

- [ ] GitHub Release / npm assets for `@detour/cli` — waits on `local-bridge`
- [ ] Automated store upload — needs publisher secrets; documented, not wired

## Browser support table

| Store / channel | Browser | Priority | This slice |
|-----------------|---------|----------|------------|
| Chrome Web Store | Chrome | P0 | Listing + permissions docs; Chromium zip. Upload is manual |
| Edge Add-ons | Edge | P0 | Same Chromium zip as Chrome. Upload is manual |
| AMO | Firefox | P0 | Firefox zip + sources zip. Upload is manual |
| GitHub Releases | Extension zips | P0 | Workflow on `v*` tags |
| Safari | Safari | P2 | Not built |
| npm | CLI | P1 (`@detour/*`) | Not built |

## Limits and gotchas

- npm unscoped `detour` taken — use scope
- CWS policies on broad host permissions + `debugger`
- Chrome 137+ branded builds ignore unpacked-extension flags. CI uses Chrome for Testing, and the smoke test sets `--no-sandbox` only when `CI` is set
- Name conflicts: confirm the listing slug at publish time (ADR-003). Installed manifest name stays `Detour`; the store listing title in the docs is `Detour — Resource Override`
- Firefox UI e2e stays out of CI: Firefox BiDi cannot open `moz-extension://` pages
- No git remote in this workspace yet. CI files do nothing until the repo is pushed. Do not put store tokens in the workflow

## Out of scope

- Paid store featuring
- Proprietary licensing SKUs
- Local Bridge and `@detour/cli`
- Calling the Chrome, Edge, or AMO publish APIs
- Safari packaging

## Verification

- Docs: listing title, permission rationale, privacy policy, and manual submission steps
- Locally, the same commands CI runs: `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm build:firefox`, `pnpm e2e:chrome`, `pnpm zip`, `pnpm zip:firefox`
- Release workflow is present and uses `github.token` only
