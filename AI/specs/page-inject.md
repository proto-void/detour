# Spec: page-inject

**Status:** Approved (by Hamza, 2026-10-06)  
**Last updated:** 2026-10-06  
**Build order:** 3  
**Depends on:** rule-model  
**Plan:** [005-page-inject-api-mock](../plans/005-page-inject-api-mock.md)

## Objective

Inject user-provided JavaScript and CSS into matched pages at configurable document lifecycle points, without relying on abandoned MV2 `webRequest` HTML rewriting.

## User stories

- As a developer, I can inject a CSS snippet to restyle a production page for debugging.
- As a developer, I can inject JS at `document_start` or after load to patch behavior.
- As a developer, I can load a script or stylesheet from my dev server (a URL) into a production page.
- As a developer, I can scope inject rules to URL patterns and toggle them quickly.

## Acceptance criteria

- [x] Rule actions `injectJs` and `injectCss`, each with a source: **inline code** or **URL**. The rule's `match` is the **page URL** (glob/regex); the group's sites still apply
- [x] Timing `runAt`: `document_start` (default for JS and CSS, so styles land before first paint), `document_end`, `document_idle`
- [x] Frames: top frame only (default) or all frames (`allFrames`)
- [x] Inline JS world: `MAIN` (default; shares the page's globals) or isolated `USER_SCRIPT` (exempt from page CSP, can't see page variables)
- [x] Registration follows the global switch, group/rule switches and site scoping; re-registered on every workspace change
- [x] Refused registrations (e.g. user scripts not allowed) appear in `applyReport` with a reason. Per-page runtime failures (CSP-blocked script URL, unreachable CSS URL) are recorded and shown on the rule
- [x] Disabled rules do not inject
- [x] UI copy explains MAIN-world risk (the page can see and tamper with injected code) and the user-scripts toggle

## Mechanism (verified against Chrome + MDN docs, 2026-10-06)

| Source | Mechanism | CSP |
|--------|-----------|-----|
| Inline JS | `userScripts.register` (`js: [{ code }]`, `runAt`, `allFrames`, `world`) | The page's CSP doesn't block the injection. Code in `MAIN` is then subject to page CSP for things like `eval`; `USER_SCRIPT` is exempt |
| JS URL | Packaged bridge content script inserts `<script src>` (`async = false`) at `runAt` | Page CSP applies; violations are reported |
| Inline / URL CSS | Bridge asks the background, which calls `scripting.insertCSS({ target: { tabId, frameIds }, css })`. URL CSS is fetched by the background | Not subject to page CSP (extension-inserted author sheet) |

- `scripting.registerContentScripts` only accepts **packaged files** (`js` / `css` paths). It can't carry user code, so it's used only for Detour's own bridge and mock runtime
- `userScripts` requires: Chrome 120+, the `userScripts` permission, and the user enabling **Allow User Scripts** on the extension's details page (Chrome 138+) or **Developer mode** (before 138). Firefox 136+ treats it as an optional-only permission, granted via `permissions.request` from a click. Not available on Firefox 128–135 or Safari: inline JS rules are refused there with a reason; URL JS and CSS still work
- User scripts are cleared on extension update, so re-register on `runtime.onInstalled`

## Browser support table

| Browser | Min | Inline JS | JS URL / CSS |
|---------|-----|-----------|--------------|
| Chrome / Edge / Brave | 120+ | `userScripts` (toggle) | ✓ |
| Firefox | 128 ESR+ | 136+ (`userScripts` optional permission) | ✓ (MAIN world 128+) |
| Safari | 17+ | ✗ | Verify |

## Limits and gotchas

- CSP: a script URL is blocked when the page's `script-src` doesn't allow it. Detour reports it rather than working around it
- Script order versus page scripts: inline JS at `document_start` via `userScripts` runs before page scripts. A script URL inserted at `document_start` is fetched asynchronously, so page scripts may run first
- Do not use deprecated mutation-event HTML rewrite as the primary path
- Site scoping in subframes uses the frame's own host, or its top ancestor where the browser exposes `location.ancestorOrigins` (Chromium)

## Out of scope

- Replacing network response bodies
- Userscript marketplace / fetching remote code by default (a JS URL is always one the user typed)
- Greasemonkey `GM_*` APIs

## Verification

- Fixture page + inline JS sets a marker before page scripts run (`document_start`); not injected on a non-matching page
- Fixture page + inline CSS changes a computed style
- Switching the rule off stops injection on the next load
- User scripts unavailable → the rule is refused with an actionable reason, not a silent failure
