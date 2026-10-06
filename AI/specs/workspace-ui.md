# Spec: workspace-ui

**Status:** Approved — **minimal slice 1 only** (by Hamza, 2026-10-06). Everything under "Remainder" stays Draft.  
**Last updated:** 2026-10-06  
**Build order:** 7  
**Depends on:** rule-model (engines as available)  
**Plan:** [003-workspace-ui-popup](../plans/003-workspace-ui-popup.md)

## Objective

Deliver Detour's primary UX: popup quick controls, full workspace editor, recipes, rule tester, RO import, and **dark default** theme — CodeMirror 6 for bodies.

## Approved scope — slice 1 (popup)

### User stories

- As a developer, I can turn Detour on or off from the popup with one keyboard-reachable switch.
- As a migrating RO user, I can pick an RO export file in the popup and see what was imported, skipped, and why.
- As a developer, I can see which rules are applied and which were refused, with the reason.

### Acceptance criteria

- [ ] Popup global on/off switch; off removes all Detour DNR rules without touching the stored workspace; state persists
- [ ] RO import via file picker (Detour exports also accepted); imported groups are appended; summary shows counts, skipped rules and warnings with reasons
- [ ] Applied vs refused view built from `applyReport`, joined with the workspace for human labels; refused rows show reason + message; storage errors shown
- [ ] Empty state explains "Point production at your code." and points to import
- [ ] Dark theme by default (follows `prefers-color-scheme: light` only if the user's system asks for it)
- [ ] Accessible: native controls, visible focus, switch exposed as `role="switch"` with `aria-checked`, status messages announced via `aria-live`, no color-only state

### Slice 1 out of scope

Rule editor/CRUD, CodeMirror, recipes, rule tester, options/workspace page, DevTools panel, group toggles in popup.

## Remainder (Draft — not approved)

### User stories

- As a developer, I can toggle a group from the popup in two clicks.
- As a developer, I can edit rules in a workspace with CodeMirror.
- As a developer, I can paste a URL into the **rule tester** and see which rule wins.
- As a developer, I can apply a **recipe** (e.g. Vite).

### Acceptance criteria

- [ ] Popup: top groups toggle, link to workspace
- [ ] Workspace: groups/rules CRUD, CM6 editors, save/persist
- [ ] Rule tester matches compiler priority semantics
- [ ] Recipes installable from built-in list
- [ ] Light theme toggle

## Browser support table

| Browser | Min | UI |
|---------|-----|----|
| Chrome / Edge / Brave | 120+ | Full |
| Firefox | 128 ESR+ | Full |
| Safari | 17+ | Best-effort |

## Limits and gotchas

- Popup size limits — keep popup minimal
- Large file bodies: nudge toward Bridge
- Do not block UI thread on huge imports (loading overlay; RO #73 lesson)
- Firefox closes the popup when a file picker opens — import must run from a tab there

## Out of scope

- Mobile-native apps
- Collaborative multiplayer editing

## Verification

- Slice 1: unit tests for import/report logic; manual: toggle off/on, import RO sample, redirect fires, refused rule visible
- A11y: keyboard toggle focus in popup
- Theme: dark by default on first run
- Remainder: popup group toggle, create rule, tester hit, recipe apply
