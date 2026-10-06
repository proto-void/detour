# Spec: distribution

**Status:** Draft  
**Last updated:** 2026-10-06  
**Build order:** 9  
**Depends on:** all product modules for store listing accuracy

## Objective

Define how Detour is built, versioned, and published to browser stores and GitHub Releases as a free MIT project — including naming disambiguation from unrelated “Detour” listings.

## User stories

- As a user, I can install Detour from Chrome Web Store / AMO / Edge with clear permission rationale.
- As a developer, I can download the CLI from GitHub Releases or npm (`@detour/cli`).
- As a maintainer, CI produces signed/reproducible artifacts without paid infra beyond free tiers.

## Acceptance criteria

- [ ] Store listing title/subtitle distinguishes resource override (AMO has unrelated Detour proxy)
- [ ] Permissions justification doc for reviewers
- [ ] CI pipeline plan: lint, unit test, build artifacts (implementation later)
- [ ] GitHub Release assets for extension zip + CLI
- [ ] LICENSE MIT at repo root when packaging
- [ ] Privacy policy: no account; local data; telemetry off by default

## Browser support table

| Store / channel | Browser | Priority |
|-----------------|---------|----------|
| Chrome Web Store | Chrome | P0 |
| Edge Add-ons | Edge | P0 |
| AMO | Firefox | P0 |
| GitHub Releases | All | P0 |
| Safari | Safari | P2 |
| npm | CLI | P1 (`@detour/*`) |

## Limits and gotchas

- npm unscoped `detour` taken — use scope
- CWS policies on broad host permissions + debugger
- Chrome 137+ unpacked automation changes for QA
- Name conflicts: confirm listing slug at publish time (see ADR-003)

## Out of scope

- Paid store featuring
- Proprietary licensing SKUs

## Verification

- Dry-run store listing copy review
- CI builds empty/smoke artifacts once scaffold exists
- Manual confirm: package names and listing titles not colliding badly
