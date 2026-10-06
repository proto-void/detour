# 008 — engine-deep body override

**Status:** Done  
**Date:** 2026-10-06  
**Spec:** [engine-deep](../specs/engine-deep.md) — Approved (Hamza, 2026-10-06), body-override slice

## Goal

A Detour rule can replace a response body in Chrome (debugger Fetch) and Firefox (`filterResponseData`). Resource Override file overrides import into that rule. Local Bridge stays deferred.

## Design

- **Action:** `overrideBody { body, contentType? }`. Not a DNR rule. 1 MB UTF-8 text
- **Opt-in:** `storage.local.bodyEngineConsent`, set only by the Allow button. Chrome’s `debugger` permission is install-time (optional grant is not acceptable in headless Chrome 154, and the API is missing until granted). Firefox still requests optional `webRequest*` from that click. No attach on install. Missing permission or consent → `body-permission-denied` (ids and a reason, never the body)
- **Chrome:** `chrome.debugger.attach(tab, "1.3")` on http(s) tabs only, `Fetch.enable` with `requestStage: "Response"`, `Fetch.fulfillRequest` (base64 body), `Fetch.continueResponse` otherwise. Cancelled tabs stay detached until the body rules change. DevTools detaches us; the next load tries again
- **Firefox:** `webRequest` + `webRequestBlocking` + `webRequestFilterResponse`. Listener only while a body rule is armed. Unmatched requests never get a stream filter
- **Patterns:** glob → CDP `urlPattern` (`*` wildcard, `?` and `\` escaped). A regex or a bare `*` pauses every response and the handler filters. Prefer specific globs
- **RO:** `fileOverride.file` → `overrideBody.body`. `fileInject` still skipped
- **Tester:** earliest block, redirect, or body rule wins, plus an overlap note
- **Deferred:** SRI strip, Local Bridge, binary bodies, OOPIF auto-attach, service-worker script filtering, distribution, observability

## Tasks

- [x] T1 Spec Approved, this plan, ADR-009
- [x] T2 Schema + RO `fileOverride` import — tests
- [x] T3 Plan / match / Chrome session / Firefox filter / permission gate — tests
- [x] T4 Background wiring, apply report, editor, tester, manifest permissions
- [x] T5 Unit tests, typecheck, Chrome + Firefox builds
- [x] T6 e2e Chrome body path; Firefox headless if it can be driven
- [x] T7 KB write-back

## Results (2026-10-06)

- 304 unit tests; typecheck clean; chrome-mv3 and firefox-mv3 builds clean (~646 KB)
- Chrome for Testing 154: `pnpm e2e:chrome` 57/57. After Allow debugger, `*:8001/replaced.js` runs `window.BODY = "LOCAL"` and `kept.js` stays `PROD`
- Firefox 157.0.1: temporary add-on installs; BiDi will not open `moz-extension://` pages, so the live filter path was not driven
- Deviation: `debugger` is a required Chrome permission. Attach is still gated by Allow debugger (`bodyEngineConsent`)

## Out of scope

Local Bridge, distribution CI, observability, SRI stripping, `data:` redirects.

## Verification

`pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm build:firefox`, `CHROME=… pnpm e2e:chrome`
