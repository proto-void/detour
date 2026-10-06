# 003 — workspace-ui slice 1: popup

**Status:** Done  
**Date:** 2026-10-06  
**Spec:** [workspace-ui](../specs/workspace-ui.md) — Approved for slice 1 only

## Goal

A Svelte 5 popup with a global on/off switch, RO/Detour file import, and an applied-vs-refused view from `applyReport`. Then a real-browser check that an imported RO redirect fires.

## Plan (design)

- **Global switch**: `storage.local.enabled` (default `true`). `syncRules` applies an empty rule set while off, leaving the workspace untouched; report gets `disabled: true`. Background also refreshes on `enabled` changes.
- **Import**: `importIntoStorage(text, area)` = `importWorkspace` → `appendImported` (fresh ids for every incoming group/rule so re-importing never collides) → `saveWorkspace`. Returns a summary for the UI. Background's existing `workspace` listener applies it.
- **Report view**: `describeReport(report, workspace)` joins DNR ids → Detour rules for labels, dedupes split rules (pageDomains → 2 DNR rules), maps reason codes to plain text.
- **Firefox**: the popup closes when a file picker opens, so "Import…" there opens the same page in a tab (`popup.html?view=tab`).
- **UI**: `src/entrypoints/popup/` (`App.svelte` + `PowerSwitch`, `ImportPanel`, `ReportView`), plain CSS tokens, dark default, native elements, `role="switch"`, `aria-live` status.
- Logic lives in `src/workspace-ui/` (pure / storage-injected, unit tested); components stay thin.

## Tasks

- [x] T1 `enabled` setting + `syncRules` off path + background listener — tests
- [x] T2 `appendImported` + `importIntoStorage` — tests
- [x] T3 `describeReport` — tests
- [x] T4 Svelte popup + `svelte-check` in `typecheck`
- [x] T5 builds (chrome, firefox)
- [x] T6 real-browser check (Chrome for Testing + CDP `Extensions.loadUnpacked`): import RO sample in popup, redirect fires
- [x] T7 KB write-back

## Results (2026-10-06)

- 130 unit tests pass; `tsc` + `svelte-check` clean; `wxt build` chrome-mv3 (~79 KB) and firefox-mv3 build with no warnings
- **Real browser (Chrome for Testing 154, headless):** `CHROME=<binary> pnpm build && pnpm e2e:chrome` → 14/14 checks:
  - empty state shows before import
  - RO v1 import through the popup file input shows a summary: 4 rules, 1 skipped file override, and a port-scope warning
  - report reads 3 applied / 1 refused, and the deliberate loop rule shows "Redirect loop" with its message
  - script redirect fires; `main_frame` redirect fires
  - page-scoped group fires on `localhost:8001` but not on `127.0.0.1:8001`
  - switch off: requests pass through; switch on: redirects are back
- **Not run in a real browser:** Firefox, and the Firefox tab-import path. Manual steps:
  1. `pnpm build:firefox`
  2. In `about:debugging#/runtime/this-firefox`, choose Load Temporary Add-on and pick `.output/firefox-mv3/manifest.json`
  3. Open the Detour popup and click **Open importer…**. A tab opens; choose an RO export
  4. Check the summary, then load a page the rule matches and confirm the redirect in the Network panel
  5. Toggle **Enabled** off and confirm the request reaches prod again
- Deviation: light theme moved to the spec's Remainder ("dark by default")

## Out of scope

Everything in the spec's "Remainder" (editor, CM6, recipes, tester, group toggles, options page, DevTools panel).

## Verification

- `pnpm test`, `pnpm typecheck` (tsc + svelte-check), `pnpm build`, `pnpm build:firefox`
- Manual/automated browser check per T6
