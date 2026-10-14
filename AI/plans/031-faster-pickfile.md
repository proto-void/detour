# Plan 031 — Faster pickFile Browse

**Status:** Done  
**Approved:** Hamza, 2026-10-09 (“Go” on Cursor plan `faster_pickfile_browse`)  
**Specs:** [db-client](../specs/db-client.md) (pickFile RPC unchanged)  
**Related:** [028-os-packs](028-os-packs.md), [029-closed-rogers-native-helper](029-closed-rogers-native-helper.md)

## Goal

Speed up Databases **Browse** by replacing per-click PowerShell / AppleScript cold starts with native Win32 dialogs and a compiled macOS NSOpenPanel path. Keep RPC `pickFile { title?, filters? } → { path }` and absolute-path TLS model unchanged.

## Approach

| Platform | Before | After |
|----------|--------|-------|
| Windows | Fresh `powershell.exe -STA` + WinForms | Go in-process `GetOpenFileNameW` (helper); Node SEA `execFile`s sibling `detour-pickfile` (PowerShell fallback if missing) |
| macOS | Fresh `osascript -e` compile every click | `osacompile` at pack/install → `osascript compiled.scpt …`; System Events fallback (no fixed delay unless needed) |
| Linux | zenity then kdialog every time | Probe once, cache which dialog exists |

## Checklist

- [x] Plan + README index; gotchas after ship
- [x] Go helper Windows native dialog (no CGO); TopMost / owner HWND
- [x] `cmd/detour-pickfile` + public `cli/tools/detour-pickfile` for Node SEA
- [x] Node `pick-file.ts`: prefer sibling binary / compiled script; PowerShell / live `-e` fallbacks
- [x] macOS compile-at-install (Node SEA + Go install); shared script name
- [x] Linux cached dialog probe (Node + Go)
- [x] OS pack / Install Helper docs; Rogers `pack:all && pack:verify`
- [x] `CGO_ENABLED=0 go test ./...`; unit tests for filter/cancel helpers

## Out of scope

- Storing file bytes in the extension
- Warm PowerShell worker
- SSL TablePlus UX (plan 030)

## Verification

- Unit: filter strings, cancel classification, platform branch mocks
- Manual: Windows Browse without multi-second pause; macOS second Browse not compile-bound; cancel + filters; path paste if picker missing
- After pack: Hamza re-runs **Install Detour Helper**
- **Agent Mac verification (required):** `DETOUR_PUBLIC_DIR=… pnpm install:helper:local` in `rogers-detour` — packs macos-arm64 (unless `--skip-pack`), runs `helper/install.sh`, verifies Mach-O `~/Library/Application Support/Detour/db-host/detour-pickfile`. Extension Reload / inspecting `staging/.../extension` is never enough for Browse.
