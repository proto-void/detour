# Spec: engine-deep

**Status:** Approved — body override (Hamza, 2026-10-06); SRI hashes (Hamza, 2026-10-07); page-world integrity (Hamza, 2026-10-07); markup integrity (Hamza, 2026-10-07); script-running markup (Hamza, 2026-10-07); inert markup (Hamza, 2026-10-07); setHTMLUnsafe with scripts off (Hamza, 2026-10-07); `Document.parseHTMLUnsafe` (Hamza, 2026-10-07); `setAttributeNode` (Hamza, 2026-10-07); `setNamedItem` and `Attr.value` (Hamza, 2026-10-07)  
**Last updated:** 2026-10-07  
**Build order:** 5  
**Depends on:** rule-model, engine-core  
**Plan:** [008-engine-deep-body](../plans/008-engine-deep-body.md), [013-sri-handling](../plans/013-sri-handling.md), [014-sri-page-integrity](../plans/014-sri-page-integrity.md), [015-sri-markup-integrity](../plans/015-sri-markup-integrity.md), [016-sri-script-markup](../plans/016-sri-script-markup.md), [017-sri-inert-markup](../plans/017-sri-inert-markup.md), [018-sri-unsafe-html-scripts-off](../plans/018-sri-unsafe-html-scripts-off.md), [019-sri-parse-html-unsafe](../plans/019-sri-parse-html-unsafe.md), [020-sri-attribute-node](../plans/020-sri-attribute-node.md), [021-sri-named-item](../plans/021-sri-named-item.md)

Amended 2026-10-07 (Hamza, in-place bridge read): the same fulfill / filter path may replace a response with bytes the extension read from Local Bridge. Disk mapping, the token, and path confinement stay in [local-bridge](local-bridge.md) and [ADR-013](../DECISIONS.md). Consent is still `bodyEngineConsent`. This spec does not grow a folder browser.

Amended 2026-10-07 (Hamza, SRI): while those rules are armed, Detour rewrites UTF-8 HTML documents so a script or stylesheet tag whose URL matches an override gets a SHA-384 `integrity` of the bytes Detour will serve. Other tags keep the page's hashes. [ADR-014](../DECISIONS.md).

Amended 2026-10-07 (Hamza, page-world integrity): the same hash list is applied when page JavaScript assigns `integrity` after parse. The hook runs only while body rewriting is consented and a rule is armed. It substitutes the hash; it does not clear one. [ADR-015](../DECISIONS.md).

Amended 2026-10-07 (Hamza, markup integrity): the same hook rewrites `integrity` inside a string assigned to `innerHTML` or passed to `insertAdjacentHTML`, before the browser parses that string. A script or stylesheet tag whose URL matches an armed override gets the same SHA-384. Other hashes in the string stay. A value that is not a string is passed through unchanged. [ADR-016](../DECISIONS.md).

Amended 2026-10-07 (Hamza, script-running markup): the same hook rewrites that string when it is passed to `Range.createContextualFragment`, and when it is passed to `Element.setHTMLUnsafe` or `ShadowRoot.setHTMLUnsafe` with `runScripts: true`. Those calls can execute the script. [ADR-017](../DECISIONS.md). Amended the same day: `setHTMLUnsafe` rewrites the string even when scripts do not run ([ADR-019](../DECISIONS.md)).

Amended 2026-10-07 (Hamza, inert markup): the same hook rewrites that string when it is assigned to `Element.outerHTML` or `ShadowRoot.innerHTML`. Those calls do not execute scripts. A stylesheet in the string is still fetched and checked. `Element.setAttributeNS` substitutes the same hash when the attribute is `integrity` (no namespace, the empty namespace, the HTML namespace, or a prefixed name with that local name) on a script or stylesheet link, including when page code copies parser-written attributes. Another namespace is left unchanged. [ADR-018](../DECISIONS.md).

Amended 2026-10-07 (Hamza, setHTMLUnsafe with scripts off): the same hook rewrites a string passed to `Element.setHTMLUnsafe` or `ShadowRoot.setHTMLUnsafe` whenever a body rule is armed, including when `runScripts` is omitted, `false`, or any value other than `true`. A stylesheet in that call is fetched and checked. The options object is passed through, so scripts still run only when `runScripts` is strictly `true`. [ADR-019](../DECISIONS.md).

Amended 2026-10-07 (Hamza, `Document.parseHTMLUnsafe`): the same hook rewrites a string passed to `Document.parseHTMLUnsafe` before the browser parses it. That call creates a document with no browsing context, so scripting stays disabled. A node later moved into a live document carries the rewritten `integrity`. `DOMParser.parseFromString` is the historical form of that same HTML parse, so the string is rewritten only when the type is `text/html`. Other DOMParser types are left unchanged. [ADR-020](../DECISIONS.md).

Amended 2026-10-07 (Hamza, `setAttributeNode`): the same hook substitutes that hash when `Element.setAttributeNode` or `Element.setAttributeNodeNS` sets an `Attr` whose local name is HTML `integrity` on a script or stylesheet link. Those methods do not go through `setAttribute` or `setAttributeNS`. The namespace rules match `setAttributeNS`. A non-matching URL keeps the Attr's value. Setting `src` or `href` that way re-resolves a hash already assigned. [ADR-021](../DECISIONS.md).

Amended 2026-10-07 (Hamza, `setNamedItem` and `Attr.value`): the same hook substitutes that hash when `NamedNodeMap.setNamedItem` or `setNamedItemNS` adopts an HTML `integrity` Attr onto a matching script or stylesheet. Those methods do not go through `setAttributeNode`. A later write to `Attr.value`, `nodeValue`, or `textContent`, once that Attr is already on the element, is rewritten the same way. An Attr that is not attached yet is left unchanged until it is adopted. A non-matching URL keeps the page's value. [ADR-022](../DECISIONS.md).

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
- As a developer, I can override a script or stylesheet whose `integrity` is carried in `outerHTML` or a shadow root's `innerHTML`, or copied onto the element with `setAttributeNS`.
- As a developer, I can override a stylesheet whose `integrity` is carried in markup passed to `setHTMLUnsafe` when scripts are off.
- As a developer, I can override a stylesheet whose `integrity` is carried in markup passed to `Document.parseHTMLUnsafe`, after those nodes are moved into the live page. A script parsed that way still does not run from the parse.
- As a developer, I can override a script or stylesheet whose `integrity` is an `Attr` moved onto the element with `setAttributeNode` or `setAttributeNodeNS`.
- As a developer, I can override a script or stylesheet whose `integrity` is adopted with `setNamedItem` or `setNamedItemNS`, or written with `Attr.value` after that attribute is already on the element.

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
- [x] While those rules are armed, a string passed to `Range.createContextualFragment` is rewritten the same way before the browser parses it. A non-matching hash in that string stays
- [x] A value that is not a string is still passed through on `createContextualFragment` and on `setHTMLUnsafe`, including when `runScripts` is true
- [x] While those rules are armed, a string passed to `Element.setHTMLUnsafe` or `ShadowRoot.setHTMLUnsafe` is rewritten the same way before the browser parses it, including when `runScripts` is omitted, `false`, or any value other than `true`. The options object is passed through unchanged, so scripts still run only when `runScripts` is strictly `true`. A non-matching hash in that string stays. A value that is not a string is left unchanged. The hook still does not clear `integrity`
- [x] While those rules are armed, a string assigned to `Element.outerHTML` or `ShadowRoot.innerHTML` is rewritten the same way before the browser parses it. A non-matching hash in that string stays. A value that is not a string, markup with no hash list, or a string longer than 2 MiB is left unchanged
- [x] `Element.setAttributeNS` substitutes that hash when the attribute is `integrity` on a script or stylesheet link whose URL matches, including a null namespace, an empty namespace, the HTML namespace, and a prefixed name with that local name. A URL that does not match keeps the value the page assigned. An attribute in another namespace is left unchanged. Setting `src` or `href` that way re-resolves a hash the page already assigned. The hook still does not clear `integrity`
- [x] While those rules are armed, a string passed to `Document.parseHTMLUnsafe` is rewritten the same way before the browser parses it. The options object is passed through unchanged. Scripting stays disabled on the document that call creates. A node moved from that document into a live document carries the rewritten `integrity`. A non-matching hash in that string stays. A value that is not a string is left unchanged. The hook still does not clear `integrity`
- [x] `DOMParser.parseFromString` rewrites a string only when the type is exactly `text/html`, the same HTML parse with scripting disabled. Any other type is passed through unchanged
- [x] `Element.setAttributeNode` and `Element.setAttributeNodeNS` substitute that hash when the `Attr` is HTML `integrity` on a script or stylesheet link whose URL matches, including a null namespace, an empty namespace, the HTML namespace, and a local name of `integrity`. The Attr's value becomes that hash. A URL that does not match keeps the value the page set. An Attr in another namespace is left unchanged. Setting `src` or `href` that way re-resolves a hash the page already assigned. The hook still does not clear `integrity`
- [ ] `NamedNodeMap.setNamedItem` and `NamedNodeMap.setNamedItemNS` substitute that hash when the `Attr` is HTML `integrity` on a script or stylesheet link whose URL matches, with the same namespace rules as `setAttributeNode`. The element's attribute map is the one reached through `Element.attributes`. A URL that does not match keeps the value the page set. An Attr in another namespace is left unchanged. Setting `src` or `href` that way re-resolves a hash the page already assigned. The hook still does not clear `integrity`
- [ ] Once an HTML `integrity` Attr is already on a matching script or stylesheet, assigning `Attr.value`, `nodeValue`, or `textContent` writes Detour's hash. The same assignment on an Attr that is not attached, or on a URL that does not match, keeps the value the page wrote. An Attr in another namespace is left unchanged. Assigning `src` or `href` that way re-resolves a hash already assigned. The hook still does not clear `integrity`

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
- `createContextualFragment` parses with scripting mode Fragment, so a script in that fragment runs when it is inserted. `setHTMLUnsafe` runs scripts only when `SetHTMLUnsafeOptions.runScripts` is true; the default is false. Both copy `integrity` from the markup string. The hook rewrites that string first, using the same hash list, including when `setHTMLUnsafe` does not run scripts. A stylesheet in an inert call is still fetched and checked. A non-string is passed through, so TrustedHTML is not stringified. The options object is forwarded unchanged. [createContextualFragment](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-range-createcontextualfragment), [setHTMLUnsafe](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-element-sethtmlunsafe)
- `Element.outerHTML` and `ShadowRoot.innerHTML` rewrite `integrity` in a string before the HTML fragment parser runs, using the same hash list. That parser marks script elements already started, so those scripts do not execute from the insertion alone. A stylesheet in the string is fetched and checked. A non-string is passed through, so TrustedHTML is not stringified. [outerHTML](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-element-outerhtml), [ShadowRoot innerHTML](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-shadowroot-innerhtml)
- `Element.setAttributeNS` does not go through `setAttribute`. Copying a parser-written attribute uses it (`namespaceURI` is null for an HTML `integrity`). The hook substitutes the hash when the local name is `integrity` and the namespace is null, empty, or `http://www.w3.org/1999/xhtml`, including a prefixed qualified name. Setting `src` or `href` the same way re-resolves a hash already assigned, because a copy can set the URL after the hash. An attribute in any other namespace is passed through. The hook does not clear `integrity`. [setAttributeNS](https://dom.spec.whatwg.org/#dom-element-setattributens)
- `Element.setAttributeNode` and `Element.setAttributeNodeNS` do not go through `setAttribute` or `setAttributeNS`. Both set an attribute from an `Attr` node. The hook substitutes the Attr's value when `namespaceURI` is null, empty, or `http://www.w3.org/1999/xhtml` and the local name is `integrity`, on a script or stylesheet link whose URL matches. Setting an `src` or `href` Attr the same way re-resolves a hash already assigned. Any other namespace, local name, or non-matching URL is passed through. The hook does not clear `integrity`. A value that is not an Attr is passed to the original method. [setAttributeNode](https://dom.spec.whatwg.org/#dom-element-setattributenode), [setAttributeNodeNS](https://dom.spec.whatwg.org/#dom-element-setattributenodens)
- `NamedNodeMap.setNamedItem` and `setNamedItemNS` perform that same adopt and do not call `setAttributeNode`. The map's element is the one that exposed it through `Element.attributes`. The hook uses that element and the same namespace rules. A map that did not come from that getter is left unchanged. [setNamedItem](https://dom.spec.whatwg.org/#dom-namednodemap-setnameditem)
- `Attr.value`, `nodeValue`, and `textContent` each set the attribute value in place. They do not call one another or `setAttribute`. When the Attr is already on a matching script or stylesheet and it is HTML `integrity`, the hook writes Detour's hash. When `ownerElement` is null, the write is stored as the page set it, and the adopt hooks see it later. A non-matching URL and a foreign namespace stay. [Attr.value](https://dom.spec.whatwg.org/#dom-attr-value)
- `Document.parseHTMLUnsafe` parses with no browsing context, so scripting stays disabled. The hook rewrites `integrity` in a string before that parse. The options object, including a sanitizer, is forwarded unchanged. This slice does not turn scripting on. A node moved into a live document carries the attribute the parser copied from that string. A stylesheet is fetched and checked when that link is connected. A script parsed this way still does not run from the parse. A non-string is passed through, so TrustedHTML is not stringified. [parseHTMLUnsafe](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-document-parsehtmlunsafe)
- `DOMParser.parseFromString` with type `text/html` is the historical form of that same parse: the new document has no browsing context, so scripting is disabled, and an adopted node keeps `integrity`. The hook rewrites only that type. `text/xml`, `application/xml`, `application/xhtml+xml`, and `image/svg+xml` use the XML parser and are left unchanged. [DOMParser](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#domparser)
- The safe `setHTML` and `Document.parseHTML` methods sanitize and are not hooked
- The URL does not change, so page CSP still applies to that URL. That is why this is not a `data:` redirect
- A DNR redirect for the same URL can change the address before Fetch sees the response. The tester says so
- Response `content-encoding` / `content-length` are dropped on the replaced response so the browser does not decode the new bytes as gzip
- Original status and the other headers are kept. Optional content type replaces `Content-Type`

## Out of scope

- Local-folder mapping and external editors. [local-bridge](local-bridge.md) may call this fulfill path with bytes it already read. The token never enters this module’s apply report
- Binary bodies and `data:` redirects
- Rewriting the document when response rewriting is off
- Non-UTF-8 HTML and documents over 2 MiB
- The safe `setHTML` methods and `Document.parseHTML`
- `DOMParser.parseFromString` for any type other than `text/html`
- `document.write`, `document.writeln`, and `iframe` `srcdoc`
- Replacing a hooked setter with `Object.defineProperty` on one element
- Attaching to out-of-process iframes (`Target.setAutoAttach`)
- Firefox service-worker script filtering (`webRequestFilterResponse.serviceWorkerScript`)
- Distribution, CI, and observability

## Verification

- Unit tests: planning, match, header rewrite, Chrome session (attach / fulfill / continue / detach / cancel), Firefox filter, permission refusal, RO import, tester, document integrity rewrite (matching tag, sibling tag, failed read, non-HTML)
- Chrome smoke: a script whose `integrity` is the hash of the production file runs the override; a sibling with a valid hash still runs; a sibling with a bad hash stays blocked. Verified 2026-10-07, Chrome for Testing 155, `pnpm e2e:chrome` 111/111, including an in-place bridge file whose page hash was for the production bytes, a page that set `integrity` from JavaScript after parse (override ran, non-matching sibling stayed blocked), a page that passed the production hash to `insertAdjacentHTML` (override ran, sibling in that string stayed blocked), a page that passed the production hash to `createContextualFragment` and to `setHTMLUnsafe` with `runScripts: true` (both overrides ran, non-matching siblings stayed blocked), a page that set `integrity` with `setAttributeNS` (override ran, non-matching sibling stayed blocked) and passed production hashes to `outerHTML` and a shadow root's `innerHTML` (both stylesheets applied, non-matching siblings stayed blocked), a page that passed production hashes to `setHTMLUnsafe` with `runScripts` omitted and with `runScripts: false` (both stylesheets applied, non-matching siblings stayed blocked and kept the page's hash), and a page that passed a production hash to `Document.parseHTMLUnsafe` and adopted the nodes into the live document (the stylesheet applied and carried the override hash, a non-matching sibling stayed blocked and kept the page's hash, a script in that document did not run). `DOMParser` `text/html` carried the same override hash; `application/xhtml+xml` kept the page's hash. A page that moved a production `integrity` Attr with `setAttributeNode` before `src` ran the override, and the live attribute was the override hash. A sibling moved with `setAttributeNodeNS` stayed blocked and kept the page's hash
- `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm build:firefox`
- Chrome smoke: one script body changes and a sibling script does not. Verified 2026-10-06, Chrome for Testing 154, `pnpm e2e:chrome` 57/57, after Allow debugger
- Firefox headless: Firefox 157.0.1 installs the temporary add-on, then BiDi refuses `moz-extension://` navigation, so the Allow click and a live `filterResponseData` path were not driven. Firefox filter behavior is unit-tested

## Sources

- [chrome.debugger](https://developer.chrome.com/docs/extensions/reference/api/debugger) — `attach` / `onDetach` (tab close or DevTools). Fetch is an allowed domain. Protocol example is `0.1`; Detour asks for `1.3` (same major, current minor)
- [CDP Fetch](https://chromedevtools.github.io/devtools-protocol/tot/Fetch/) — `RequestPattern` wildcards, `requestStage: Response`, `fulfillRequest` body is base64, `continueResponse` with only `requestId` leaves the response alone
- [filterResponseData](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/filterResponseData) — Firefox; MV3 also needs `webRequestFilterResponse`
