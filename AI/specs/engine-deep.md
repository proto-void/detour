# Spec: engine-deep

**Status:** Approved (by Hamza, 2026-10-06) — body-override slice  
**Last updated:** 2026-10-07  
**Build order:** 5  
**Depends on:** rule-model, engine-core  
**Plan:** [008-engine-deep-body](../plans/008-engine-deep-body.md)

Amended 2026-10-07 (Hamza, in-place bridge read): the same fulfill / filter path may replace a response with bytes the extension read from Local Bridge. Disk mapping, the token, and path confinement stay in [local-bridge](local-bridge.md) and [ADR-013](../DECISIONS.md). Consent is still `bodyEngineConsent`. This spec does not grow a folder browser.

## Objective

Replace the response body of a matched request with text the user wrote, without a `data:` redirect. Chromium uses the debugger (`Fetch` domain). Firefox uses `webRequest.filterResponseData`. The same rule action drives both.

Hamza approved **engine-deep** for body override on 2026-10-06. Local Bridge stays Draft. This spec records the thinnest slice that delivers a real override.

## User stories

- As a developer, I can replace a remote JS, CSS, JSON, or other text response with my own body while the URL stays the same.
- As a developer, I am asked before Detour attaches the debugger (Chrome) or filters responses (Firefox), and nothing attaches on install.
- As a developer, I can turn the rule or Detour off and the browser stops rewriting bodies.
- As a developer, I can import a Resource Override `fileOverride` and get this action instead of a skip.

## Acceptance criteria

- [x] Rule action `overrideBody` with an inline UTF-8 `body` (1 MB max) and an optional `contentType`. Match, resource types, and site scoping work like other request rules
- [x] Chromium: `debugger` is an install-time permission (the API is missing until it is granted, and Chrome 154 headless will not accept an optional grant from a click). Attach still waits for **Allow debugger**, which sets `storage.local.bodyEngineConsent`. CDP `Fetch.enable` at the **Response** stage; `Fetch.fulfillRequest` swaps the body; other paused requests `Fetch.continueResponse`. Protocol version `1.3`. Detach when no body rule is enabled or Detour is off
- [x] Cancelling Chrome’s debugging banner leaves that tab detached until the body rules change. Opening DevTools detaches the override (Chrome documents this)
- [x] Firefox: optional `webRequest`, `webRequestBlocking`, and `webRequestFilterResponse` (required for MV3 since Firefox 110). `filterResponseData` replaces the body. No debugger on Firefox. The same Allow click requests that permission and sets `bodyEngineConsent`
- [x] The DNR compiler does not emit these rules. `applyReport.bodies` lists armed rules (ids only). Missing permission or consent refuses them with `body-permission-denied`
- [x] Rule tester treats body replacement as a request outcome. The earliest block, redirect, or body rule wins. A note covers the Chrome overlap with a redirect
- [x] Editor: “Replace response body”, code editor, content type, and honest Chrome vs Firefox copy (banner, DevTools, SRI, CSP)
- [x] RO `fileOverride` imports as `overrideBody` using the export’s `file` string. Empty files are skipped. `fileInject` stays skipped
- [x] No attach on install. Rule bodies are not written to the apply report

## Browser support table

| Browser | Min | Body override |
|---------|-----|----------------|
| Chrome / Edge / Brave | 120+ | `chrome.debugger` + CDP Fetch. Out-of-process iframes are not attached in this slice |
| Firefox | 128+ | `filterResponseData`. Service-worker script streams are not filtered (that needs another permission) |
| Safari | 17+ | Unsupported; rules are refused if neither API exists |

## Limits and gotchas

- Chrome shows a debugging infobar and only one debugger client can own a tab. DevTools or Cancel detaches Detour
- A regex or “every URL” pattern pauses every response in the tab, then non-matches continue. The editor warns
- Subresource Integrity checks the new bytes. This slice does not strip `integrity` attributes
- The URL does not change, so page CSP still applies to that URL. That is why this is not a `data:` redirect
- A DNR redirect for the same URL can change the address before Fetch sees the response. The tester says so
- Response `content-encoding` / `content-length` are dropped on the replaced response so the browser does not decode the new bytes as gzip
- Original status and the other headers are kept. Optional content type replaces `Content-Type`

## Out of scope

- Local-folder mapping and external editors. [local-bridge](local-bridge.md) may call this fulfill path with bytes it already read. The token never enters this module’s apply report
- SRI stripping, binary bodies, and `data:` redirects
- Attaching to out-of-process iframes (`Target.setAutoAttach`)
- Firefox service-worker script filtering (`webRequestFilterResponse.serviceWorkerScript`)
- Distribution, CI, and observability

## Verification

- Unit tests: planning, match, header rewrite, Chrome session (attach / fulfill / continue / detach / cancel), Firefox filter, permission refusal, RO import, tester
- `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm build:firefox`
- Chrome smoke: one script body changes and a sibling script does not. Verified 2026-10-06, Chrome for Testing 154, `pnpm e2e:chrome` 57/57, after Allow debugger
- Firefox headless: Firefox 157.0.1 installs the temporary add-on, then BiDi refuses `moz-extension://` navigation, so the Allow click and a live `filterResponseData` path were not driven. Firefox filter behavior is unit-tested

## Sources

- [chrome.debugger](https://developer.chrome.com/docs/extensions/reference/api/debugger) — `attach` / `onDetach` (tab close or DevTools). Fetch is an allowed domain. Protocol example is `0.1`; Detour asks for `1.3` (same major, current minor)
- [CDP Fetch](https://chromedevtools.github.io/devtools-protocol/tot/Fetch/) — `RequestPattern` wildcards, `requestStage: Response`, `fulfillRequest` body is base64, `continueResponse` with only `requestId` leaves the response alone
- [filterResponseData](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/filterResponseData) — Firefox; MV3 also needs `webRequestFilterResponse`
