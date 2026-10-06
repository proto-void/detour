# 003 — workspace-ui slice 1: popup

**Status:** In progress  
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

- [ ] T1 `enabled` setting + `syncRules` off path + background listener — tests
- [ ] T2 `appendImported` + `importIntoStorage` — tests
- [ ] T3 `describeReport` — tests
- [ ] T4 Svelte popup + `svelte-check` in `typecheck`
- [ ] T5 builds (chrome, firefox)
- [ ] T6 real-browser check (Chrome for Testing + CDP `Extensions.loadUnpacked`): import RO sample in popup, redirect fires
- [ ] T7 KB write-back

## Out of scope

Everything in the spec's "Remainder" (editor, CM6, recipes, tester, group toggles, options page, DevTools panel).

## Verification

- `pnpm test`, `pnpm typecheck` (tsc + svelte-check), `pnpm build`, `pnpm build:firefox`
- Manual/automated browser check per T6
