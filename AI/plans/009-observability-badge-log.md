# 009 — observability badge and match log

**Status:** Done  
**Date:** 2026-10-06  
**Spec:** [observability](../specs/observability.md) — Approved for badge + match log (Hamza, 2026-10-06)

## Goal

Show a per-tab match count on the toolbar icon, and a session-local log of which rules matched. No backend, no rule bodies, no change to the Chrome `debugger` permission.

## Design

- **Badge:** `storage.local.showBadge` (default on). Text is the count since the tab's last navigation, or empty. `99+` caps it
- **Log:** `storage.session.matchLog`, newest 50. Label is group name + match pattern. Sources: DNR, page (CSS / script URL), mock, body
- **DNR:** `declarativeNetRequestFeedback` on Chromium only. Unpacked: `onRuleMatchedDebug`. Packed (no debug event): `getMatchedRules` with the tab URL. Ids join `applyReport.applied`
- **Elsewhere:** successful CSS insert, script-URL inject, mock match (rule id + request URL only), and a body replacement call a local recorder
- **UI:** popup badge switch + "Match log…". Options section `#log` with an empty state and Clear
- **Deferred:** inline JS rows, Firefox DNR rows, packed per-request URLs, a network-panel clone, Local Bridge, distribution

## Tasks

- [x] T1 Spec Approved, this plan, ADR-010
- [x] T2 Match log, badge text, and DNR attribution — unit tests
- [x] T3 Background wiring, page/mock/body notes, popup and options
- [x] T4 Unit tests, typecheck, Chrome + Firefox builds
- [x] T5 Extend `e2e/chrome-smoke`. Firefox UI e2e skipped: Firefox 157 BiDi cannot open `moz-extension://` pages
- [x] T6 KB write-back

## Out of scope

Local Bridge, distribution CI, install-time `debugger` changes, `webRequest` for logging, inline JS match rows, a full network list.

## Verification

327 unit tests; `tsc --noEmit` and `svelte-check` clean; Chrome and Firefox MV3 builds warning-free; `e2e/chrome-smoke.mjs` 62/62 on Chrome for Testing 154. Firefox live UI not driven (BiDi).
