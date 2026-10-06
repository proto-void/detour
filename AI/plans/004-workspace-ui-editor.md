# 004 — workspace-ui slice 2: rule editor

**Status:** In progress  
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
- [ ] T2 Re-import provenance + `replaceImported` + summary `replaced` — tests
- [ ] T3 Editor logic module — tests
- [ ] T4 Options page + popup link + iframe warning; `svelte-check`
- [ ] T5 Builds (chrome, firefox)
- [ ] T6 e2e: create a rule in the editor → it fires; re-import replaces instead of duplicating
- [ ] T7 KB write-back

## Out of scope

Spec "Remainder" and the slice 2 out-of-scope list (CodeMirror, drag-and-drop, cross-group moves, undo, import from the editor page).

## Verification

`pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm build:firefox`, `CHROME=… pnpm e2e:chrome`
