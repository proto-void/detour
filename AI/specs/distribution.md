# Spec: distribution

**Status:** Approved — CI + packaging (Hamza, 2026-10-07); **OS packs amendment** (Hamza, 2026-10-09); **partner-helper public hooks** (Hamza, 2026-10-09)  
**Last updated:** 2026-10-09  
**Build order:** 9  
**Depends on:** extension modules that are already built. Store listing copy describes the current extension, not Local Bridge.  
**Related:** [db-client](db-client.md) (Databases helper packs), [ADR-029](../DECISIONS.md), [ADR-030](../DECISIONS.md)  
**Plan:** [028-os-packs](../plans/028-os-packs.md); partner hooks [029](../plans/029-closed-rogers-native-helper.md)

This approval covers CI, store-ready zips, a GitHub Release workflow for those zips, reviewer docs, and **self-sufficient OS packs** (extension + Databases SEA helper) for GitHub Releases / sideloading. It does not approve Local Bridge npm publishing, or automated Chrome Web Store / AMO / Edge submission.

## Objective

Define how Detour is built, versioned, and published to browser stores and GitHub Releases as a free MIT project — including naming disambiguation from unrelated “Detour” listings.

## User stories

- As a user, I can install Detour from Chrome Web Store / AMO / Edge with clear permission rationale.
- As a developer, I can download the CLI from GitHub Releases or npm (`@detour/cli`) once Local Bridge is Approved.
- As a developer, I can download one OS pack per platform (`detour-<ver>-<os>-<arch>`) with the extension, a self-contained Databases helper, and a double-click installer — no Node, pnpm, or repo checkout on the target machine.
- As a maintainer, CI produces extension zips and OS packs on the GitHub Actions free tier, with no paid infra and no store credentials in the repo.

## Acceptance criteria

Approved for this slice:

- [x] Store listing title/subtitle distinguishes resource override (AMO has unrelated Detour proxy) — docs, not a manifest rename
- [x] Permissions justification doc for reviewers
- [x] CI on pull requests and `main`: unit tests, typecheck (`tsc` + `svelte-check`), Chrome and Firefox MV3 builds, and store zips. There is no separate ESLint script; typecheck is the static gate
- [x] CI runs `pnpm e2e:chrome` with Chrome for Testing from `@puppeteer/browsers` (`chrome@stable`) on every pull request and on `main`
- [x] GitHub Release assets for the extension zips (Chrome zip, Firefox zip, Firefox sources zip) on `v*` tags, using the built-in `GITHUB_TOKEN`
- [x] LICENSE MIT at repo root (already present)
- [x] Privacy policy: no account; local data; telemetry off by default

### OS packs amendment (Approved Hamza, 2026-10-09)

- [x] GitHub Releases attach **four** Detour OS packs on `v*` tags: `windows-x64`, `macos-arm64`, `macos-x64`, `linux-x64` (layout in plan 028)
- [x] Each pack includes unpacked Chromium `extension/`, self-contained SEA `helper/` (`detour-db-host` + platform `@napi-rs/keyring` beside the binary), install/uninstall scripts, and templated READMEs
- [x] Store / CWS / AMO / Edge zips remain **extension-only** (unchanged)
- [x] CI SEA matrix builds all four targets (Intel mac via Intel runner label); smoke `--version`, stdio ping, `install --dry-run`; `os-packs` job assembles packs
- [x] Fixed public Chrome manifest `key` per brand (Detour in repo; Rogers in gitignored brand dir) so unpacked extension id is stable; **no private `.pem` in repo**
- [x] Helper installs to a stable per-user directory; native-messaging `path` points at the SEA binary (no Node launcher)
- [x] Signing stays **$0**: ad-hoc `codesign --sign -` on macOS after postject; Gatekeeper / SmartScreen first-run warnings are an accepted limitation (ADR-029)
- [x] CI builds Detour packs only; local `pnpm pack:os` may build Rogers for the current OS

### Partner-helper public hooks amendment (Approved Hamza, 2026-10-09)

Generic build hooks for out-of-tree partner flavors ([ADR-026](../DECISIONS.md), [ADR-030](../DECISIONS.md)). No partner marks or closed helper binaries in the public MIT tree.

- [x] `DETOUR_BRAND_DIR` absolute path resolves brand assets (`brand.ts`, `tokens.css`, `icon.svg`, …) without requiring `extension/brands/<slug>` in this repo
- [x] Brand `nativeHostName` defaults to `com.detour.db`; partners may set a distinct native-messaging application name
- [x] Fixed public Chrome manifest `key` per brand (already from OS packs) remains the mechanism for stable unpacked id / NM `allowed_origins`
- [x] Detour store/sideload zips (`zip`); partner Rogers packs retired (plan 033)

Still open (not this approval):

- [ ] npm publish of `@detour/cli` / Local Bridge as a standalone npm asset
- [ ] Automated store upload — needs publisher secrets; documented, not wired
- [ ] `linux-arm64` / `windows-arm64` pack rows (matrix-only later)

## Browser support table

| Store / channel | Browser | Priority | This slice |
|-----------------|---------|----------|------------|
| Chrome Web Store | Chrome | P0 | Listing + permissions docs; Chromium zip. Upload is manual |
| Edge Add-ons | Edge | P0 | Same Chromium zip as Chrome. Upload is manual |
| AMO | Firefox | P0 | Firefox zip + sources zip. Upload is manual |
| GitHub Releases | Extension zips | P0 | Workflow on `v*` tags |
| GitHub Releases | OS packs (ext + DB helper) | P0 | Four Detour packs on `v*` tags (ADR-029) |
| Safari | Safari | P2 | Not built |
| npm | CLI | P1 (`@detour/*`) | Not built |

## Limits and gotchas

- npm unscoped `detour` taken — use scope
- CWS policies on broad host permissions + `debugger`
- Chrome 137+ branded builds ignore unpacked-extension flags. CI uses Chrome for Testing, and the smoke test sets `--no-sandbox` only when `CI` is set
- Name conflicts: confirm the listing slug at publish time (ADR-003). Installed manifest name and store listing title are both `Detour`; the short description clarifies resource overriding vs the unrelated AMO proxy
- Firefox UI e2e stays out of CI: Firefox BiDi cannot open `moz-extension://` pages
- No git remote in this workspace yet. CI files do nothing until the repo is pushed. Do not put store tokens in the workflow
- **OS packs (~90–130 MB)** include the Node runtime; acceptable for release assets, not for store upload
- **Unsigned at $0:** macOS Gatekeeper and Windows SmartScreen warn on first run; documented in pack READMEs and install scripts. Paid Apple notarization / Windows Authenticode are out of scope while the $0 hard no stands
- Browsers never let an extension register its own native host — one local install step remains (ADR-027 / ADR-029)
- SEA cannot embed `@napi-rs/keyring` platform `.node` files; they ship beside the binary and load via `createRequire` from `dirname(process.execPath)/node_modules/`

## Out of scope

- Paid store featuring
- Proprietary licensing SKUs
- Paid code signing / Apple notarization / Windows Authenticode certificates
- Calling the Chrome, Edge, or AMO publish APIs
- Safari packaging
- Shipping private extension signing keys in the repo

## Verification

- Docs: listing title, permission rationale, privacy policy, and manual submission steps
- Locally, the same commands CI runs: `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm build:firefox`, `pnpm e2e:chrome`, `pnpm zip`, `pnpm zip:firefox`
- Release workflow is present and uses `github.token` only
- OS packs: SEA smoke on four runners; pack READMEs present with no leftover `{{placeholders}}`; dual store zips still ship; plan 028 checklist
