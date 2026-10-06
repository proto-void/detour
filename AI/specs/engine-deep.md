# Spec: engine-deep

**Status:** Approved — body override (Hamza, 2026-10-06); SRI hashes (Hamza, 2026-10-07); page-world integrity (Hamza, 2026-10-07); markup integrity (Hamza, 2026-10-07); script-running markup (Hamza, 2026-10-07)  
**Last updated:** 2026-10-07  
**Build order:** 5  
**Depends on:** rule-model, engine-core  
**Plan:** [008-engine-deep-body](../plans/008-engine-deep-body.md), [013-sri-handling](../plans/013-sri-handling.md), [014-sri-page-integrity](../plans/014-sri-page-integrity.md), [015-sri-markup-integrity](../plans/015-sri-markup-integrity.md), [016-sri-script-markup](../plans/016-sri-script-markup.md)

Amended 2026-10-07 (Hamza, in-place bridge read): the same fulfill / filter path may replace a response with bytes the extension read from Local Bridge. Disk mapping, the token, and path confinement stay in [local-bridge](local-bridge.md) and [ADR-013](../DECISIONS.md). Consent is still `bodyEngineConsent`. This spec does not grow a folder browser.

Amended 2026-10-07 (Hamza, SRI): while those rules are armed, Detour rewrites UTF-8 HTML documents so a script or stylesheet tag whose URL matches an override gets a SHA-384 `integrity` of the bytes Detour will serve. Other tags keep the page's hashes. [ADR-014](../DECISIONS.md).

Amended 2026-10-07 (Hamza, page-world integrity): the same hash list is applied when page JavaScript assigns `integrity` after parse. The hook runs only while body rewriting is consented and a rule is armed. It substitutes the hash; it does not clear one. [ADR-015](../DECISIONS.md).

Amended 2026-10-07 (Hamza, markup integrity): the same hook rewrites `integrity` inside a string assigned to `innerHTML` or passed to `insertAdjacentHTML`, before the browser parses that string. A script or stylesheet tag whose URL matches an armed override gets the same SHA-384. Other hashes in the string stay. A value that is not a string is passed through unchanged. [ADR-016](../DECISIONS.md).

Amended 2026-10-07 (Hamza, script-running markup): the same hook rewrites that string when it is passed to `Range.createContextualFragment`, and when it is passed to `Element.setHTMLUnsafe` or `ShadowRoot.setHTMLUnsafe` with `runScripts: true`. Those calls can execute the script. A call that does not run scripts is left unchanged. [ADR-017](../DECISIONS.md).

## Objective

Replace the response body of a matched request with text the user wrote, without a `data:` redirect. Chromium uses the debugger (`Fetch` domain). Firefox uses `webRequest.filterResponseData`. The same rule action drives both.

Hamza approved **engine-deep** for body override on 2026-10-06. Local Bridge stays Draft. This spec records the thinnest slice that delivers a real override.

## User stories

- As a developer, I can replace a remote JS, CSS, JSON, or other text response with my own body while the URL stays the same.
- As a developer, I am asked before Detour attaches the debugger (Chrome) or filters responses (Firefox), and nothing attaches on install.
- As a developer, I can turn the rule or Detour off and the browser stops rewriting bodies.
- As a developer, I can import a Resource Override `fileOverride` and get this action instead of a skip.
- As a developer, I can replace a script or stylesheet that the page protects with Subresource Integrity, and the browser runs my file.
- As a developer, I can override a script whose `integrity` is assigned by page JavaScript after the HTML is parsed.
- As a developer, I can override a script or stylesheet whose `integrity` is carried in markup passed to `innerHTML` or `insertAdjacentHTML`.
- As a developer, I can override a script whose `integrity` is carried in markup that actually runs, through `createContextualFragment` or `setHTMLUnsafe` with scripts enabled.

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
- [x] While body rules are armed, a UTF-8 HTML document is rewritten so each matching script or stylesheet tag's `integrity` is `sha384-` of the override bytes (`overrideBody` text, or the in-place bridge file). Tags that do not match an armed rule keep their hashes
- [x] The hash and the fulfilled body come from the same read. If that read fails, the published hash stays
- [x] Documents that are not UTF-8 HTML, or are over 2 MiB, are left unchanged
- [x] The rules page says Detour updates that hash, that other files keep theirs, and that a redirect with rewriting off does not change the page
- [x] While those rules are armed, the rewritten HTML carries the same hash list (match, resource types, sites, SHA-384 — no rule body). A MAIN-world `document_start` hook, registered only then, substitutes that hash when page JavaScript sets `integrity` on a script or stylesheet link whose URL matches. A URL that does not match keeps the value the page assigned
- [x] The hook does not remove `integrity`. A missing hash leaves the page's value. Rewriting off does not register the hook
- [x] While those rules are armed, assigning `innerHTML` or calling `insertAdjacentHTML` with a string rewrites `integrity` on a script or stylesheet tag in that string whose URL matches an armed override. The rewrite happens before the browser parses the string. A tag in that string that does not match keeps the hash the page wrote
- [x] A value that is not a string is passed to the original setter or method unchanged. Markup with no hash list, or longer than 2 MiB, is left unchanged. The hook still does not clear `integrity`
- [x] While those rules are armed, a string passed to `Range.createContextualFragment` is rewritten the same way before the browser parses it. A string passed to `Element.setHTMLUnsafe` or `ShadowRoot.setHTMLUnsafe` is rewritten only when `runScripts` is `true`. A non-matching hash in that string stays. `runScripts` omitted or false leaves the string unchanged
- [x] A value that is not a string is still passed through on those methods, including when `runScripts` is true

## Browser support table

| Browser | Min | Body override |
|---------|-----|----------------|
| Chrome / Edge / Brave | 120+ | `chrome.debugger` + CDP Fetch. Out-of-process iframes are not attached in this slice |
| Firefox | 128+ | `filterResponseData`. Service-worker script streams are not filtered (that needs another permission) |
| Safari | 17+ | Unsupported; rules are refused if neither API exists |

## Limits and gotchas

- Chrome shows a debugging infobar and only one debugger client can own a tab. DevTools or Cancel detaches Detour
- A regex or “every URL” pattern pauses every response in the tab, then non-matches continue. The editor warns
- The HTML parser copies `integrity` onto the request when it prepares a script, before page JavaScript runs. A MAIN-world content script cannot see that parser write. Detour changes the hash in the document bytes instead. [HTML: prepare a script](https://html.spec.whatwg.org/multipage/scripting.html#prepare-the-script-element), [SRI](https://w3c.github.io/webappsec-subresource-integrity/#integrity-metadata-description)
- Chrome pauses document responses with a Fetch pattern whose `resourceType` is `Document`, then fulfills the HTML. [Fetch.RequestPattern](https://chromedevtools.github.io/devtools-protocol/tot/Fetch/#type-RequestPattern). Firefox buffers the document with `filterResponseData` opened from `onBeforeRequest`
- Only an armed `overrideBody` or in-place `serveLocal` rule updates a tag. The hash is SHA-384 of those bytes. The browser still enforces it
- A redirect to `127.0.0.1` (rewriting off) does not change the document, so the page's hash can still reject the file. [SRI checks the response that is used](https://w3c.github.io/webappsec-subresource-integrity/#does-response-match-metadatalist)
- The hash list in the page is readable by that page. The hook copies it once and then ignores later edits. A forged list can only substitute a SHA-384, so a wrong hash blocks the script. The hook never clears `integrity`, and the body engine still matches the real rules. [ADR-015](../DECISIONS.md)
- `innerHTML` and `insertAdjacentHTML` rewrite `integrity` in a string before the HTML fragment parser runs, using the same hash list. That parser marks script elements already started, so those scripts do not execute from the insertion alone. A stylesheet in the string is fetched and checked. [HTML fragment parsing](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#html-fragment-parsing-algorithm)
- `createContextualFragment` parses with scripting mode Fragment, so a script in that fragment runs when it is inserted. `setHTMLUnsafe` runs scripts only when `SetHTMLUnsafeOptions.runScripts` is true; the default is false. Both copy `integrity` from the markup string. The hook rewrites that string first, using the same hash list. A non-string is passed through, so TrustedHTML is not stringified. [createContextualFragment](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-range-createcontextualfragment), [setHTMLUnsafe](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-element-sethtmlunsafe)
- `outerHTML`, `setAttributeNS`, and `ShadowRoot.innerHTML` are not hooked. Those paths do not execute scripts. `Document.parseHTMLUnsafe` creates a document with scripting disabled, so it is not hooked either
- The URL does not change, so page CSP still applies to that URL. That is why this is not a `data:` redirect
- A DNR redirect for the same URL can change the address before Fetch sees the response. The tester says so
- Response `content-encoding` / `content-length` are dropped on the replaced response so the browser does not decode the new bytes as gzip
- Original status and the other headers are kept. Optional content type replaces `Content-Type`

## Out of scope

- Local-folder mapping and external editors. [local-bridge](local-bridge.md) may call this fulfill path with bytes it already read. The token never enters this module’s apply report
- Binary bodies and `data:` redirects
- Rewriting the document when response rewriting is off
- Non-UTF-8 HTML and documents over 2 MiB
- `outerHTML`, `setAttributeNS`, and `ShadowRoot.innerHTML`
- `Document.parseHTMLUnsafe` and the safe `setHTML` methods
- `setHTMLUnsafe` when `runScripts` is omitted or not strictly `true`
- Attaching to out-of-process iframes (`Target.setAutoAttach`)
- Firefox service-worker script filtering (`webRequestFilterResponse.serviceWorkerScript`)
- Distribution, CI, and observability

## Verification

- Unit tests: planning, match, header rewrite, Chrome session (attach / fulfill / continue / detach / cancel), Firefox filter, permission refusal, RO import, tester, document integrity rewrite (matching tag, sibling tag, failed read, non-HTML)
- Chrome smoke: a script whose `integrity` is the hash of the production file runs the override; a sibling with a valid hash still runs; a sibling with a bad hash stays blocked. Verified 2026-10-07, Chrome for Testing 155, `pnpm e2e:chrome` 85/85, including an in-place bridge file whose page hash was for the production bytes, a page that set `integrity` from JavaScript after parse (override ran, non-matching sibling stayed blocked), a page that passed the production hash to `insertAdjacentHTML` (override ran, sibling in that string stayed blocked), and a page that passed the production hash to `createContextualFragment` and to `setHTMLUnsafe` with `runScripts: true` (both overrides ran, non-matching siblings stayed blocked)
- `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm build:firefox`
- Chrome smoke: one script body changes and a sibling script does not. Verified 2026-10-06, Chrome for Testing 154, `pnpm e2e:chrome` 57/57, after Allow debugger
- Firefox headless: Firefox 157.0.1 installs the temporary add-on, then BiDi refuses `moz-extension://` navigation, so the Allow click and a live `filterResponseData` path were not driven. Firefox filter behavior is unit-tested

## Sources

- [chrome.debugger](https://developer.chrome.com/docs/extensions/reference/api/debugger) — `attach` / `onDetach` (tab close or DevTools). Fetch is an allowed domain. Protocol example is `0.1`; Detour asks for `1.3` (same major, current minor)
- [CDP Fetch](https://chromedevtools.github.io/devtools-protocol/tot/Fetch/) — `RequestPattern` wildcards, `requestStage: Response`, `fulfillRequest` body is base64, `continueResponse` with only `requestId` leaves the response alone
- [filterResponseData](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/filterResponseData) — Firefox; MV3 also needs `webRequestFilterResponse`
