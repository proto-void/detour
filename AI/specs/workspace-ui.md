# Spec: workspace-ui

**Status:** Approved — **slice 1 (popup)** and **slice 2 (rule editor + group/rule switches)** (both by Hamza, 2026-10-06). Everything under "Remainder" stays Draft.  
**Last updated:** 2026-10-06  
**Build order:** 7  
**Depends on:** rule-model (engines as available)  
**Plans:** [003-workspace-ui-popup](../plans/003-workspace-ui-popup.md), [004-workspace-ui-editor](../plans/004-workspace-ui-editor.md). CodeMirror for inject/mock bodies is plan [005](../plans/005-page-inject-api-mock.md).

## Objective

Deliver Detour's primary UX: popup quick controls, full workspace editor, recipes, rule tester, RO import, and **dark default** theme — CodeMirror 6 for bodies.

## Approved scope — slice 1 (popup)

### User stories

- As a developer, I can turn Detour on or off from the popup with one keyboard-reachable switch.
- As a migrating RO user, I can pick an RO export file in the popup and see what was imported, skipped, and why.
- As a developer, I can see which rules are applied and which were refused, with the reason.

### Acceptance criteria

- [x] Popup global on/off switch; off removes all Detour DNR rules without touching the stored workspace; state persists
- [x] RO import via file picker (Detour exports also accepted); summary shows counts, skipped rules and warnings with reasons
- [x] **Re-import replaces** (Hamza, 2026-10-06): imported groups remember their source file (file name + SHA-256 of the content). Importing a file with the same name or identical content replaces the groups from that earlier import in place, keeping their position. Any other import is appended. Groups the user created are never touched. The summary says how many groups were replaced
- [x] Applied vs refused view built from `applyReport`, joined with the workspace for human labels; refused rows show reason + message; storage errors shown
- [x] Empty state explains "Point production at your code." and points to import
- [x] Dark theme by default (light theme is in the Remainder)
- [x] Accessible: native controls, visible focus, switch exposed as `role="switch"` with `aria-checked`, status messages announced via `aria-live`, no color-only state

## Approved scope — slice 2 (workspace editor)

### User stories

- As a developer, I open the workspace editor in a tab from the popup and create, edit, delete and reorder groups and rules.
- As a developer, I turn a group or a single rule on or off.
- As a developer, I restrict a group to certain sites.
- As a developer, I see what my match pattern means in plain language, get field-level errors while typing, and check a sample URL against it before saving.
- As a developer, I save, and see inline whether each rule was applied or refused (and why).
- As a developer, I export my workspace as a Detour file.

### Acceptance criteria

- [x] Options page (`options_ui`, opens in a tab) linked from the popup; the popup stays lean
- [x] Groups: create, rename, delete, move up/down, on/off switch, site-scoping field (`pageDomains`, comma separated hosts)
- [x] Rules: create, edit, delete, move up/down within a group, on/off switch; actions **redirect**, **block**, **modify headers** (request/response set/append/remove)
- [x] Match field: glob or regex, a plain-language description, field-level errors from the valibot schemas plus the engine's pre-checks (non-ASCII, bad redirect target, loop, too many wildcards); a sample-URL preview showing match / no match and the redirect result
- [x] Rule options: case sensitivity, which requests (all incl. page loads / subresources only / custom kept as-is), note
- [x] Explicit **Save** writes the workspace (validated) which triggers engine apply; unsaved changes are flagged and can be discarded; external changes (e.g. a popup import) don't silently overwrite unsaved edits
- [x] Inline per-rule status from `applyReport`: applied, refused + reason, off, or waiting for apply
- [x] **Export** button downloads the saved workspace as `{ v: 1, data }`
- [x] Site-scoped groups show an **iframe coverage warning** on browsers without `topDomains` (Firefox, Chrome < 145): requests made by cross-site iframes on those pages aren't covered (accepted gap, Hamza 2026-10-06)
- [x] Dark, keyboard accessible (reorder by buttons, focus kept after moves), no color-only state

### Slice 2 out of scope

CodeMirror was deferred from this slice and landed with page-inject (plan 005). Still out of scope here: drag-and-drop reorder, moving rules between groups, undo history, import from the editor page.

## Remainder (Draft — not approved)

### User stories

- As a developer, I can toggle a group from the popup in two clicks.
- As a developer, I can paste a URL into the **rule tester** and see which rule wins.
- As a developer, I can apply a **recipe** (e.g. Vite).
- As a developer, I can use a light theme.

### Acceptance criteria

- [ ] Popup: top groups toggle
- [ ] Rule tester matches compiler priority semantics across the whole workspace
- [ ] Recipes installable from built-in list
- [ ] DevTools panel
- [ ] Light theme toggle
- [x] CodeMirror 6 editors for inject/mock bodies (delivered in plan 005; not part of this remainder)

## Browser support table

| Browser | Min | UI |
|---------|-----|----|
| Chrome / Edge / Brave | 120+ | Full |
| Firefox | 128 ESR+ | Full (import runs in a tab) |
| Safari | 17+ | Best-effort |

## Limits and gotchas

- Popup size limits — keep popup minimal
- Large file bodies: nudge toward Bridge
- Do not block UI thread on huge imports (loading overlay; RO #73 lesson)
- Firefox closes the popup when a file picker opens — import must run from a tab there
- Site scoping on Firefox / Chrome < 145 uses `initiatorDomains`, so cross-site iframes on a scoped page aren't covered; the editor warns on those browsers only
- Chrome allows request-header `append` only for an allowlist of headers; the editor flags other names

## Out of scope

- Mobile-native apps
- Collaborative multiplayer editing

## Verification

- Slice 1: unit tests for import/report logic; real-browser smoke (`pnpm e2e:chrome`)
- Slice 2: unit tests for editor operations, validation, preview and status; e2e creates a rule through the editor and confirms it fires; e2e re-import replaces instead of duplicating
- A11y: keyboard-only pass over popup and editor
- Theme: dark by default on first run
