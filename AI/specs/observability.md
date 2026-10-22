# Spec: observability

**Status:** Approved — badge + match log (Hamza, 2026-10-06)  
**Last updated:** 2026-10-06  
**Build order:** 8  
**Depends on:** engine-core, workspace-ui

Local Bridge and distribution stay Draft. This approval does not change the install-time Chrome `debugger` permission.

## Objective

Make Detour's effects visible and debuggable via a toolbar badge and an in-extension match log — without exfiltrating rule bodies or file contents.

## User stories

- As a developer, I see a badge when rules match on the active tab (RO #28).
- As a developer, I can open a log of recent matches.
- As a privacy-conscious user, I am never opted into uploading my rules.

## Acceptance criteria

- [x] Action-icon badge shows how many rules matched the current tab since its last navigation (`99+` above 99). The count is empty when Detour is off, nothing has matched, or the user turns the badge off. `storage.local.showBadge` persists (missing means on)
- [x] Match log is a `storage.session` ring (50, newest first) of rule id, group id, a label (group name + match pattern), the URL, and the source (`dnr`, `page`, `mock`, `body`). No action bodies, header values, or file contents. Popup opens it; the rules page can clear it. Nothing is uploaded
- [x] Compile/apply errors stay on the existing apply report in the popup and rules page (workspace-ui). This slice does not add a second error list
- [x] No telemetry. There is no match-log export that leaves the browser
- [x] Turning the badge off clears badge text and does not stop the log

## How a match is observed

| Source | What is logged | URL |
|--------|----------------|-----|
| DNR redirect / block / headers | `declarativeNetRequestFeedback` | Unpacked Chromium: `onRuleMatchedDebug` request URL. Packed Chromium: `getMatchedRules` has no request URL, so the log stores the tab URL. Firefox 128+ has no feedback API |
| CSS and script-URL inject | Bridge already knows the page matched | Page URL |
| fetch/XHR mock | MAIN world tells the bridge the rule id and request URL only | Request URL |
| Body override | Recorded when a response is actually replaced | Request URL |

DNR rule ids are positional. The log maps them through `applyReport.applied` (ADR-005). Inline JS is not logged: it runs in the page's MAIN world and cannot message the extension.

## Browser support table

| Browser | Min | Badge / log |
|---------|-----|-------------|
| Chrome / Edge / Brave | 120+ | `action.setBadge*`. Feedback permission has no install warning. `onRuleMatchedDebug` is unpacked-only; `getMatchedRules` works in packed builds |
| Firefox | 128 ESR+ | `action.setBadge*`. DNR matches are not observable without `webRequest` (not added; that permission warns about browsing history). Page, mock, and body matches still log |
| Safari | 17+ | Not in this slice |

## Limits and gotchas

- The log is cleared when the browser session ends. It can contain request URLs (tokens in a query string stay on the device)
- High-traffic pages keep the newest 50 matches. The badge counts only the current tab since the last navigation; that timestamp lives in the service worker and resets if the worker restarts
- A packed Chromium log row may show the tab URL rather than the subresource that matched
- One navigation can match several rules (a script redirect and a header rule). The badge counts events, not distinct rules

## Out of scope

- Hosted error tracking or any upload of page contents, rule bodies, or the log
- A full network panel or per-request DevTools list
- Inline JS match rows
- Firefox DNR attribution via `webRequest`
- Local Bridge and distribution
- Changing the install-time Chrome `debugger` permission

## Verification

- Enable the badge (default), load a page a rule matches, badge shows a count
- Turn the badge off; badge text is empty; the log still has the row
- The log lists the match locally with a rule label and URL, and the stored row has no action body
