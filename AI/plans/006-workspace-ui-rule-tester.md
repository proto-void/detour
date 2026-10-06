# 006 — workspace-ui rule tester

**Status:** Done  
**Date:** 2026-10-06  
**Spec:** [workspace-ui](../specs/workspace-ui.md) slice 3 — Approved (Hamza, 2026-10-06)

## Goal

Paste a URL on the rules page and see which rule wins, using the same precedence as the engines.

## Design

- **Where:** a tester section at the top of the options page. The popup gets “Test a URL…”, which opens `options.html#tester` and focuses the field.
- **Probe:** URL, method (default GET), resource type (default page load), page URL (blank = the URL; ignored for a page load, because that URL is the page), and “page is inside a frame” (inject `allFrames`).
- **Workspace:** the editor draft (the rules on screen). The section notes when Detour is off or the draft is unsaved.
- **Resolve** (`workspace-ui/tester.ts`, pure) reuses `matchesUrl`, `previewMatch`, `compileRule`, `urlTest`, `testUrl`, and `hostOnDomains`. It does not reimplement glob/regex syntax.
  1. Skip disabled groups and rules.
  2. A rule `compileRule` would refuse does not win. If it matched this probe, say so.
  3. Fetch/XHR (`xmlhttprequest`): the first matching mock (method `ANY` or exact, request URL, page host in `pageDomains`) wins. Network rules are not applied.
  4. Otherwise the earliest matching block or redirect wins. The redirect target comes from `previewMatch`.
  5. Every matching header rule applies. On one header, the earlier set or remove wins; a later append still applies.
  6. Inject rules match the page URL, all of them, in order. Inline JS is skipped when user scripts are off. They do not run when this probe is a page load that is redirected or blocked.
  7. Site scope: `main_frame` uses the request host (`requestDomains`); everything else uses the page host. Subdomains match. This is top-frame scoping, not the initiatorDomains iframe gap.
- **Result text** includes the group name, a short summary, and the outcome in words (not color alone).

## Out of scope

Recipes, DevTools panel, light theme, popup group toggles, Firefox `testMatchOutcome`, drag-and-drop.

## Tasks

- [x] T1 Spec approved, this plan, PROGRESS
- [x] T2 `resolveProbe` + result text — unit tests for precedence
- [x] T3 Options-page tester + popup entry
- [x] T4 Typecheck, unit tests, Chrome + Firefox builds
- [x] T5 e2e: open tester, paste URL, assert the winning rule
- [x] T6 KB write-back

## Results (2026-10-06)

- 263 unit tests pass (24 new, in `tester.test.ts`); `tsc` + `svelte-check --fail-on-warnings` clean
- Chrome and Firefox production builds clean
- `pnpm e2e:chrome` 45/45 on Chrome for Testing 154: winning redirect, no match, redirect loop not applied

## Verification

- `pnpm test` (from `extension/`)
- `pnpm typecheck`
- `pnpm build` and `pnpm build:firefox`
- `pnpm e2e:chrome` when a Chrome for Testing binary is available
