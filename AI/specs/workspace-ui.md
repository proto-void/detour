# Spec: workspace-ui

**Status:** Approved — **slice 1 (popup)**, **slice 2 (rule editor + group/rule switches)**, **slice 3 (rule tester)**, and **slice 4 (recipes, DevTools panel, light theme, popup group toggles)** (Hamza, 2026-10-06).  
**Last updated:** 2026-10-06  
**Build order:** 7  
**Depends on:** rule-model (engines as available)  
**Plans:** [003-workspace-ui-popup](../plans/003-workspace-ui-popup.md), [004-workspace-ui-editor](../plans/004-workspace-ui-editor.md), [006-workspace-ui-rule-tester](../plans/006-workspace-ui-rule-tester.md), [007-workspace-ui-remainder](../plans/007-workspace-ui-remainder.md). CodeMirror for inject/mock bodies is plan [005](../plans/005-page-inject-api-mock.md).

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
- [x] Dark theme by default (light theme is slice 4)
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
- [x] **Autosave** (on by default) writes a validated draft about 1 s after the last edit; invalid drafts are held without forcing focus. Explicit **Save now** (Ctrl/Cmd+S) still writes immediately with validation focus. Unsaved changes are flagged and can be discarded; a toast Undo restores the previous autosave. External changes (e.g. a popup import) pause autosave and don't silently overwrite unsaved edits
- [x] Inline per-rule status from `applyReport`: applied, refused + reason, off, or waiting for apply
- [x] **Export** button downloads the saved workspace as `{ v: 1, data }`
- [x] Site-scoped groups show an **iframe coverage warning** on browsers without `topDomains` (Firefox, Chrome < 145): requests made by cross-site iframes on those pages aren't covered (accepted gap, Hamza 2026-10-06)
- [x] Dark, keyboard accessible (reorder by buttons, focus kept after moves), no color-only state

### Slice 2 out of scope

CodeMirror was deferred from this slice and landed with page-inject (plan 005). Still out of scope here: drag-and-drop reorder, moving rules between groups, undo history, import from the editor page.

## Approved scope — slice 3 (rule tester)

### User stories

- As a developer, I paste a URL on the rules page and see which rule wins for that request.
- As a developer, I can set the method, the kind of request, and the page it comes from, so inject, mock, and network rules are judged the way the engines judge them.
- As a developer, I can open the tester from the popup.

### Acceptance criteria

- [x] Options page has a tester: a URL field, plus optional method, resource type, page URL, and “page is inside a frame”
- [x] Resolves the workspace on screen (the editor draft) with the engines’ precedence: group order, rule order, on/off, site scoping (`pageDomains` + subdomain match), and action type
- [x] Fetch/XHR: the first matching mock wins, and network rules do not (the request never leaves the page). Other resource types ignore mocks
- [x] Otherwise the earliest matching block or redirect wins. Redirects show the target with the same wildcard / `\1` expansion as the compiler. Header rules all apply; on one header an earlier set or remove wins, and later appends still apply
- [x] Inject rules run against the page URL (all of them, in order). They do not run when this probe is a page load that is redirected or blocked. Inline JS is not applied when user scripts are off
- [x] A rule the compiler would refuse (redirect loop, non-ASCII pattern, and the same) does not win; the tester says it matched but is not applied
- [x] Shows the group name, a short rule summary, and the outcome (redirect target, block, headers, inject, or mock status and body), or “No rule matches.”
- [x] Popup has a control that opens the tester
- [x] Notes when Detour is off or the draft has unsaved edits
- [x] Dark, keyboard accessible, result text is not color-only, and the result is announced

### Slice 3 out of scope

The tester does not model the initiatorDomains cross-site iframe gap (it uses the page URL’s host, i.e. top-frame scoping). It does not call Firefox `testMatchOutcome`. Recipes, the DevTools panel, light theme, and popup group toggles are slice 4.

## Approved scope — slice 4 (remainder)

Hamza approved these four items on 2026-10-06. The bullets below are the build contract. Anything under "Deferred" is not part of this approval.

### User stories

- As a developer, I turn a group on or off from the popup without opening the rules page.
- As a developer, I add a starter recipe (point a host at localhost, allow CORS, or SPA fallback) and get a normal rule group I can edit.
- As a developer, I switch to a light theme, and Detour remembers that on the next open.
- As a developer, I open a Detour panel in DevTools and see which rule wins for the page I'm inspecting.

### Acceptance criteria

- [x] **Popup group toggles:** the popup lists the first 8 groups in workspace order (the ones that win first) with a switch each. Flipping a switch saves that group's `enabled` flag immediately and the engines re-apply. Further groups are counted, with Edit rules for the rest. The global Enabled switch is unchanged
- [x] **Recipes:** the rules page has a built-in list. Adding one appends a group to the editor draft; Save applies it, same as any other edit. The popup links to that list. Built-ins:
  - Point a host at localhost (default `http://localhost:5173`, the Vite-shaped case). Two redirects, `http` and `https`, `host/*` → `origin/*`, all request types including page loads
  - Allow CORS: response `Access-Control-Allow-Origin`, `Allow-Methods`, and `Allow-Headers` on a glob (default every URL). Headers on real responses only
  - SPA fallback: page loads whose path has no dot go to `/index.html` on that origin. One regex rule, `main_frame` only
- [x] Recipes produce ordinary groups through the shared rule schema and compiler. They do not invent a second matcher
- [x] **Light theme:** a "Light theme" switch on the popup and the rules page. Off (the default when nothing is stored) is the current dark palette. On applies a light palette with the same text for state (On/Off, Applied, Refused). The choice is stored in `storage.local` under `theme` and shared by every Detour page, including the DevTools panel
- [x] **DevTools panel:** MV3 `devtools_page` adds a Detour panel (Chrome, Edge, Firefox). For the inspected page it shows the page URL and the rule-tester result for a page load of that URL (same `resolveProbe` precedence). It says when Detour is off. It can open the rules page. It does not attach the debugger
- [x] Dark, and light, stay keyboard accessible: native controls, visible focus, switches expose On/Off, results are text, no color-only state
- [x] CodeMirror 6 editors for inject/mock bodies (delivered in plan 005)

### Deferred (not approved — do not build)

- A shareable recipe file format. Recipes become normal groups; those groups already export with the workspace
- Answering a CORS preflight with a mock, instead of only adding headers to responses the server actually sends
- A DevTools network log, per-request match list, or rule editor inside the panel (observability / a later UI slice)
- Following the operating-system color scheme when the user has never chosen a theme

## Remainder

Slice 4 is the whole remainder. No workspace-ui acceptance criteria are still Draft.

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
- The popup shows 8 groups. A group switch writes storage immediately, so an editor with unsaved edits shows the existing "changed somewhere else" banner
- The SPA recipe skips paths that contain a dot, and the CORS recipe does not invent an OPTIONS response
- `chrome.devtools` exists only inside a DevTools page. Opening the panel HTML directly has nothing to inspect

## Out of scope

- Mobile-native apps
- Collaborative multiplayer editing

## Verification

- Slice 1: unit tests for import/report logic; real-browser smoke (`pnpm e2e:chrome`)
- Slice 2: unit tests for editor operations, validation, preview and status; e2e creates a rule through the editor and confirms it fires; e2e re-import replaces instead of duplicating
- Slice 3: unit tests for resolution precedence (order, on/off, site scope, resource type, mock-over-network, header stacking, inject vs redirect); e2e opens the tester, pastes a URL, and sees the winning rule
- Slice 4: unit tests for recipe groups (schema + compiler, no self-redirect), popup group list, theme parse/apply, and the DevTools page-load view; e2e toggles a group from the popup, adds a localhost recipe, and switches theme; manifest contains `devtools_page`
- A11y: keyboard-only pass over popup and editor
- Theme: dark by default on first run; light only after the switch is turned on
