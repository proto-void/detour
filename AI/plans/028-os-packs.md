# Plan 028 — Self-sufficient OS packs

**Status:** Done  
**Approved:** Hamza, 2026-10-09 (“Go, approved” on Cursor plan)  
**Specs:** [distribution](../specs/distribution.md) (OS packs amendment Approved), [db-client](../specs/db-client.md) (OS packs setup Approved)  
**ADR:** [ADR-029](../DECISIONS.md)

## Goal

On a fresh machine, download `detour-<ver>-<os>-<arch>.zip`, load the extension unpacked, double-click the installer, and **Databases → Start** shows **Helper: Ready**. No Node, pnpm, or repo on the target machine. Store zips remain extension-only.

## Checklist

- [x] Spec amendments + ADR-029 Approved (Hamza)
- [x] SEA: esbuild-bundle `cli.ts` → CJS; postject; `@napi-rs/keyring` beside binary via `createRequire`; ad-hoc codesign on macOS; official Node base when Homebrew stub detected
- [x] SEA subcommands: `install` / `uninstall` / `doctor` / `--version`; copy to per-user app dir; quarantine clear on macOS
- [x] Fixed public manifest `key` per brand; installer `allowed_origins` for unpacked + store ids; `--extension-id` optional
- [x] `pnpm pack:os` (+ Rogers local): layout per Cursor plan; templates under `cli/pack/templates/`
- [x] `extension/README-load-unpacked.md` (+ `public/` copy) in plain Chrome zips
- [x] CI: 4-target SEA matrix, smoke tests, `os-packs` job, attach packs on `v*` releases
- [x] Databases setup card: OS-aware pack instructions + Releases link; pnpm under Developers
- [x] Root README + `docs/distribution/README.md`; unit tests; typecheck; KB write-back; dual zip

## Out of scope

- Paid notarization / Authenticode
- Private `.pem` in repo
- `linux-arm64` / `windows-arm64` (later matrix rows)
- npm publish of `@detour/cli`

## Verification

- Unit: install path resolution, `allowed_origins`, SEA native-addon resolver — pass
- Local macos-arm64 pack built; SEA `--version` / `doctor` / `install --dry-run` smoked
- Dual zip DoD (Detour + Rogers)
- CI matrix lands when remote exists
