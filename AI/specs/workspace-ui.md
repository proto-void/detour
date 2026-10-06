# Spec: workspace-ui

**Status:** Draft  
**Last updated:** 2026-10-06  
**Build order:** 7  
**Depends on:** rule-model (engines as available)

## Objective

Deliver Detour's primary UX: popup quick controls, full workspace editor, recipes, rule tester, RO import, and **dark default** theme — CodeMirror 6 for bodies.

## User stories

- As a developer, I can toggle Detour or a group from the popup in two clicks.
- As a developer, I can edit rules in a workspace with CodeMirror.
- As a developer, I can paste a URL into the **rule tester** and see which rule wins.
- As a developer, I can apply a **recipe** (e.g. Vite) and import RO exports.

## Acceptance criteria

- [ ] Popup: master enable, top groups toggle, link to workspace
- [ ] Workspace: groups/rules CRUD, CM6 editors, save/persist
- [ ] Rule tester matches compiler priority semantics
- [ ] Recipes installable from built-in list
- [ ] RO import UI wired to rule-model mapping + warnings
- [ ] Dark theme default; light optional
- [ ] Empty states explain “Point production at your code.”

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

## Out of scope

- Mobile-native apps
- Collaborative multiplayer editing

## Verification

- Manual UX checklist: popup toggle, create rule, tester hit, recipe apply, RO import sample
- A11y: keyboard toggle focus in popup
- Theme: dark by default on first run
