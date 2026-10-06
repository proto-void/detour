# 005 — page-inject + api-mock

**Status:** In progress  
**Date:** 2026-10-06  
**Specs:** [page-inject](../specs/page-inject.md), [api-mock](../specs/api-mock.md) — Approved (Hamza, 2026-10-06)

## Goal

New rule actions `injectJs`, `injectCss`, `mock`, compiled into browser registrations that follow the global/group/rule switches and site scoping, with editor UI and real-browser proof.

## Design

- **Model:** actions `injectJs { source, runAt, allFrames, world }`, `injectCss { source, runAt, allFrames }`, `mock { method, status, headers[], body, delayMs }`. `source` = `{ kind: 'inline', code } | { kind: 'url', url }`. The DNR compiler skips these actions
- **Plan (pure):** `planPage(workspace, enabled)` → `{ userScripts[], pageConfig, needsBridge, needsMockRuntime, refused[] }`
  - `pageConfig` (stored at `storage.local.pageConfig`) holds compiled regex sources, never re-parsed globs
- **Sync:** `syncPage(api, plan)`, run inside `syncRules` and merged into `applyReport` (`injected[]` + refusals):
  - unregisters/registers Detour's content scripts (bridge ISOLATED, mock MAIN)
  - replaces Detour's user scripts
- **Runtimes:**
  - `content-scripts/bridge.js` (ISOLATED): CSS via message → background `insertCSS`; JS URL via `<script src>`; mock config → MAIN; failure reports
  - `content-scripts/mock-main.js` (MAIN): fetch/XHR patch
- **Failures:** the background keeps the last 50 page failures in `storage.session.pageFailures` (no bodies); the editor shows them per rule
- **UI:** the action select gains Inject JS / Inject CSS / Mock response, with a CodeMirror 6 body editor (lazy chunk, options page only). A user-scripts banner explains the Chrome toggle, or offers a Firefox permission request
- **Permissions:** `scripting` + `userScripts` (Chrome install-time; Firefox `optional_permissions`)

## Tasks

- [x] T1 Docs: specs Approved, plan 005, ADR-008, answers recorded in plan 004
- [x] T2 Schema: new actions + compile skip — tests
- [x] T3 `planPage` (scoping, switches, refusals) — tests
- [ ] T4 Mock runtime (fetch + XHR, hold-until-config, abort, pass-through) — tests
- [ ] T5 Bridge + MAIN entrypoints, `syncPage`, background wiring, permissions, report merge — tests with fake APIs
- [ ] T6 Editor UI: inject/mock fields, CodeMirror, failures, user-scripts banner
- [ ] T7 Builds (chrome, firefox), manifest check
- [ ] T8 e2e: inline JS at document_start (matching vs not), CSS applies, fetch + XHR mock, pass-through, toggles off, re-import keeps switches, name-only confirm
- [ ] T9 KB write-back

## Verification

`pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm build:firefox`, `CHROME=… pnpm e2e:chrome`
