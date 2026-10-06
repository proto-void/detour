# 004 — workspace-ui slice 2: rule editor

**Status:** Done  
**Date:** 2026-10-06  
**Spec:** [workspace-ui](../specs/workspace-ui.md) — slice 2 Approved (Hamza, 2026-10-06)

## Goal

A workspace editor page (options page, opens in a tab) for groups and rules, with group/rule on/off switches, site scoping, live validation, a sample-URL preview, explicit Save, inline applied/refused status, and Export. It also covers re-import replacement (plan 003 answer 1) and the iframe coverage warning (answer 2).

## Plan (design)

- **Provenance:** `Group.importedFrom?: { file, sha256 }`. `replaceImported(base, incoming, source)` swaps the groups whose `file` or `sha256` matches, at the position of the first one. Otherwise it appends. Groups without `importedFrom` are never touched. `importIntoStorage(text, area, { fileName })` hashes the text with `crypto.subtle`
- **Editor logic** (`src/workspace-ui/editor.ts`, pure, unit tested):
  - immutable ops: add/update/remove/move for groups and rules
  - `validateRule` / `validateGroup`: field-path → message, from valibot issues plus `compileRule` pre-checks and Chrome's request-`append` allowlist
  - `describeMatch`: plain language
  - `previewMatch(rule, url)`: match + redirect result, using the same capture semantics as the compiler
  - `ruleStatus(report, …)`: applied / refused / off / pending / disabled
  - `parseDomains`: domain list text → `pageDomains`
- **Page:** `src/entrypoints/options/` (`manifest.open_in_tab`). Components:
  - `GroupCard`, `RuleEditor`, `HeaderOps`, `Switch` (shared with the popup)
  - Draft state in `App.svelte`, saved with `saveWorkspace`; the background applies on `storage.onChanged`
  - Status waits for a report newer than the save
- **Popup:** an "Edit rules" link that calls `runtime.openOptionsPage()`
- **Iframe warning:** shown on a scoped group when `supportsTopDomains(browser.declarativeNetRequest)` is false

## Tasks

- [x] T1 Docs: spec slice 2 Approved, distribution CI note, answers recorded (plan 003, ADR-007)
- [x] T2 Re-import provenance + `mergeImported` + summary `replaced` — tests
- [x] T3 Editor logic module — tests
- [x] T4 Options page + popup link + iframe warning; `svelte-check`
- [x] T5 Builds (chrome, firefox)
- [x] T6 e2e: create a rule in the editor → it fires; re-import replaces instead of duplicating
- [x] T7 KB write-back

## Results (2026-10-06)

- 164 unit tests (10 files) pass; `tsc` + `svelte-check --fail-on-warnings` clean
- `wxt build`: chrome-mv3 ~125 KB, firefox-mv3; both manifests have `options_ui { page: options.html, open_in_tab: true }`; no warnings
- `pnpm e2e:chrome` on Chrome for Testing 154: **23/23**. The 9 new checks:
  - re-import reports "Replaced 2 groups", and the editor still shows 2 groups
  - no iframe warning (topDomains is supported)
  - Save is blocked with focus on the empty redirect field
  - the preview shows the target
  - the new rule shows ✓ Applied, and its redirect fires on a real page
  - turning the rule off and saving stops it
- Bug found by e2e and fixed: the import picker couldn't re-pick the same file (`event.currentTarget` is null after `await`)
- Deviations:
  - the helper is named `mergeImported` (not `replaceImported`), and `normalizeDomains` replaces `parseDomains`. Invalid hosts stay in the draft so the schema error shows at the field
  - engine pre-check problems are **warnings, not blocking errors**, so an imported refused rule never stops you saving unrelated edits
- **Not run in a real browser:** Firefox. Manual steps, after the plan 003 steps:
  1. Load `.output/firefox-mv3`
  2. In the popup choose **Edit rules…**; the editor tab opens
  3. Add a group with a site (e.g. `localhost`); the iframe warning shows (Firefox has no `topDomains`)
  4. Add a redirect rule, Save, and check that it shows ✓ Applied and that the redirect shows in the Network panel
  5. Re-import the same RO file from the popup tab; the summary says "Replaced …", and the editor shows a banner if it had unsaved edits

## Out of scope

Spec "Remainder" and the slice 2 out-of-scope list (CodeMirror, drag-and-drop, cross-group moves, undo, import from the editor page).

## Verification

`pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm build:firefox`, `CHROME=… pnpm e2e:chrome`
