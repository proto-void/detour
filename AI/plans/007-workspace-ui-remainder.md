# 007 — workspace-ui remainder

**Status:** In progress  
**Date:** 2026-10-06  
**Spec:** [workspace-ui](../specs/workspace-ui.md) slice 4 — Approved (Hamza, 2026-10-06)

## Goal

Ship the four approved remainder items: popup group switches, three starter recipes, a light theme that persists, and a DevTools panel that reuses the rule tester.

## Assumptions

1. "Top groups" means the first 8 groups in workspace order (highest priority), including ones that are off, so they can be turned on.
2. A recipe is added to the editor draft and applied on Save (ADR-007). The popup only links to the list.
3. The DevTools panel judges one page load of the inspected URL. It does not log the network or attach the debugger.
4. Light theme is an explicit `storage.local` choice. First run stays dark even when the OS is light.
5. Built-in recipes are enough. A recipe file format, a CORS preflight mock, and a DevTools request list stay deferred.

## Design

- **Groups:** `popupGroupList` picks the first 8. The popup calls `updateGroup` + `saveWorkspace`. The switch shows On/Off.
- **Recipes** (`workspace-ui/recipes.ts`): `localhost`, `cors`, `spa`. Each returns a normal `Group`. `buildRecipe` rejects input the schema or `compileRule` would refuse, including a host redirected at itself. The rules page renders the list; `#recipes` opens it.
- **Theme** (`ui/theme.ts`): `theme` is `'light'` or anything else → dark. `data-theme` on `<html>` swaps the existing CSS variables. CodeMirror follows the same attribute.
- **DevTools:** `entrypoints/devtools/` is the MV3 devtools page and calls `panels.create`. `entrypoints/devtools-panel/` is the panel. `inspectPage` calls `resolveProbe` for `main_frame`.

## Out of scope

Recipe files, OPTIONS mocks, DevTools network log, OS color-scheme tracking, engine-deep, distribution CI.

## Tasks

- [ ] T1 Spec approved, this plan, PROGRESS
- [ ] T2 Light theme tokens, persistence, switches on popup and rules page
- [ ] T3 Popup group toggles (immediate save)
- [ ] T4 Built-in recipes on the rules page
- [ ] T5 DevTools panel using the rule tester
- [ ] T6 Typecheck, unit tests, Chrome + Firefox builds
- [ ] T7 e2e: theme, popup group toggle, localhost recipe; manifest has `devtools_page`
- [ ] T8 KB write-back

## Verification

- `pnpm test` (from `extension/`)
- `pnpm typecheck`
- `pnpm build` and `pnpm build:firefox`
- `pnpm e2e:chrome` when a Chrome for Testing binary is available
