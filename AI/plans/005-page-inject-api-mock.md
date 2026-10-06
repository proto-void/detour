# 005 — page-inject + api-mock

**Status:** Done  
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
- [x] T4 Mock runtime (fetch + XHR, hold-until-config, abort, pass-through) — tests
- [x] T5 Bridge + MAIN entrypoints, `syncPage`, background wiring, permissions, report merge — tests with fake APIs
- [x] T6 Editor UI: inject/mock fields, CodeMirror, failures, user-scripts banner
- [x] T7 Builds (chrome, firefox), manifest check
- [x] T8 e2e: inline JS at document_start (matching vs not), CSS applies, fetch + XHR mock, pass-through, toggles off, re-import keeps switches, name-only confirm
- [x] T9 KB write-back

## Results (2026-10-06)

- 239 unit tests (15 files) pass; `tsc` + `svelte-check --fail-on-warnings` clean
- `wxt build`: chrome-mv3 603 KB (CodeMirror chunk 435 KB, options only), firefox-mv3 603 KB; no warnings
- Manifests: both MV3. Chrome permissions include `scripting` + `userScripts`, `minimum_chrome_version` 120. Firefox `userScripts` is `optional_permissions`, gecko id `detour@protovoid.com`, `background.scripts`. Neither manifest lists content scripts; `syncPage` registers `content-scripts/bridge.js` and `content-scripts/mock-main.js`
- `pnpm e2e:chrome` on Chrome for Testing 154: **41/41**. The 18 new checks:
  - inline JS refused with the user-scripts banner, then Applied after Allow User Scripts
  - inline JS ran at `document_start` before the page script; not injected on a non-matching page
  - inline CSS computed color `rgb(1, 2, 3)`
  - fetch mock 201 + `{}`; XHR mock 201 + `{}` + `content-type: application/json`
  - POST to the mocked URL and a non-matching fetch both pass through
  - mock off → 404 on the open page without reload; group off stops JS and CSS on the next load
  - name-only re-import asks; Replace keeps the off switch, adds the new rule, and leaves the page-rule group alone
- Deviations:
  - api-mock lives in `page-inject/` (`mock-runtime.ts`, `mock-main.content.ts`) rather than its own folder
  - a new mock rule defaults to method `GET` (the schema default, if the field is omitted, is `ANY`), status 200, `content-type: application/json`, body `{}`
  - inline JS registers on `<all_urls>` and guards in the page, so the code runs in a block
  - e2e covers inline JS/CSS and mocks. JS-from-URL and CSS-from-URL are implemented and unit-tested, not in the Chrome smoke
- **Firefox 157.0.1 (2026-10-06):** passed — inline JS refused until Allow user scripts, then ran at `document_start` before the page script; inline CSS and fetch/XHR mock passed; a non-matching fetch hit the server; mock off applied without reload. Steps:
  1. Load `.output/firefox-mv3`
  2. Add an inline JS rule; the banner should offer **Allow user scripts** (Firefox 136+). Grant it and reload a matching page
  3. Add inline CSS and a mock; confirm the style and that fetch/XHR return the mock, and that a non-matching fetch still hits the server
  4. Turn the mock off and confirm the open page passes through without reload

## Verification

`pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm build:firefox`, `CHROME=… pnpm e2e:chrome`
