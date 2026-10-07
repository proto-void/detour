# Browser matrix

**Last verified:** 2026-10-07 (DNR quotas, domain conditions, page engines, body override, badge and match log, Local Bridge redirect and in-place, SRI hash update, page-world integrity, markup integrity, script-running markup, inert markup, setHTMLUnsafe with scripts off, `Document.parseHTMLUnsafe`, `setAttributeNode`, `setNamedItem` and `Attr.value`. Chrome for Testing 155 e2e 117/117. Firefox 157 importer, editor, inject, mock, tester). Firefox 157 BiDi still cannot open `moz-extension://` pages, so the live filter path, the Firefox match-log UI, and a Firefox bridge click-through were not driven. CI does not run a Firefox UI smoke. In-place `serveLocal` uses the same body engines as `overrideBody` (debugger on Chrome, `filterResponseData` on Firefox). Without that consent both browsers redirect to `127.0.0.1`. While those rules are armed, matching script and stylesheet `integrity` values become SHA-384 of the override, including when page JavaScript assigns the attribute, copies it with `setAttributeNS`, moves that attribute with `setAttributeNode` or `setAttributeNodeNS`, adopts it with `setNamedItem` or `setNamedItemNS`, writes `Attr.value` after it is already on the element, passes the tag to `innerHTML` / `outerHTML` / a shadow root's `innerHTML` / `insertAdjacentHTML`, or passes the tag to `createContextualFragment` or to `setHTMLUnsafe` even when that call does not run scripts, or passes the string to `Document.parseHTMLUnsafe` or `DOMParser` with type `text/html`. Nodes moved from that document into the page carry the hash.

## Supported targets (product intent)

| Browser | Minimum | Engines expected |
|---------|---------|------------------|
| Chrome | **120+** | Core DNR, Inject, Mock, Deep (debugger), Bridge |
| Edge | **120+** | Same as Chrome |
| Brave | **120+** | Same as Chrome (verify debugger policies) |
| Firefox | **128 ESR+** | Core DNR (as available), Inject, Mock, FF body (`filterResponseData`), Bridge |
| Safari | **17+** | Core subset TBD; Deep likely unavailable; track separately |

## Core DNR quotas

| Browser | Dynamic rules | Unsafe (redirect/headers) | Regex |
|---------|---------------|---------------------------|-------|
| Chrome / Edge 121+ | 30000 | 5000 | 1000 (dynamic + session) |
| Firefox 128+ | 5000 | (no separate cap) | 1000 per ruleset |
| Safari | `MAX_NUMBER_OF_DYNAMIC_AND_SESSION_RULES` | — | no separate cap |

Source: Chrome DNR reference + MDN (2026-10-06). Detour reads the constants at runtime.

## DNR domain conditions (page scoping)

| Condition | Chrome | Firefox | Detour use |
|-----------|--------|---------|------------|
| `requestDomains` | 101+ | 128+ | `main_frame` half of a page-scoped rule |
| `initiatorDomains` | 101+ | 128+ | subresource half when `topDomains` is missing |
| `topDomains` | **145+** | **not on MDN** | subresource half when `RuleConditionKeys` lists it |

All three match subdomains too. Chrome for Testing 154 verified end to end (`pnpm e2e:chrome`, 2026-10-06, 41/41).

## Page engines (inject + mock)

| Capability | Chrome / Edge / Brave 120+ | Firefox 128+ | Safari 17+ |
|------------|----------------------------|--------------|------------|
| Inline JS | `userScripts` + user toggle (Chrome 138+ “Allow User Scripts”; earlier, Developer mode) | 136+ optional `userScripts` permission; 128–135 refused with a reason | Not available; refuse |
| JS from a URL | Bridge inserts `<script src>`; page CSP applies | Same (MAIN world 128+) | Verify |
| CSS inline / URL | `scripting.insertCSS` from the background | Same | Verify |
| fetch / XHR mock | Packaged MAIN script, `document_start`; no user-scripts toggle | Same | Verify |

Mocks and URL/CSS injection do not need the user-scripts toggle. Inline JS rules are refused (`user-scripts-unavailable`) until it is on.

## Body override

| Capability | Chrome / Edge / Brave 120+ | Firefox 128+ | Safari 17+ |
|------------|----------------------------|--------------|------------|
| Replace response body | `chrome.debugger` + CDP Fetch at Response (`fulfillRequest`). `debugger` is install-time. Attach waits for Allow debugger | `filterResponseData` after optional `webRequest` + `webRequestBlocking` + `webRequestFilterResponse`, then Allow response rewriting | Unsupported; refused |
| DevTools on that tab | Detaches the override until the next load | Stays usable | — |
| Out-of-process iframes | Not attached | n/a | — |
| Service-worker scripts | Fetched like other scripts when the pattern matches | Not filtered (would need `webRequestFilterResponse.serviceWorkerScript`) | — |
| Matching `integrity` in HTML | Document paused with Fetch `resourceType: Document`, hash rewritten, then fulfilled. A MAIN-world `document_start` hook covers `integrity` assigned from page JavaScript, copied with `setAttributeNS`, moved with `setAttributeNode` / `setAttributeNodeNS`, adopted with `setNamedItem` / `setNamedItemNS`, written with `Attr.value` once that attribute is on the element, inside `innerHTML` / `outerHTML` / shadow `innerHTML` / `insertAdjacentHTML` strings, inside `createContextualFragment` markup that runs scripts, `setHTMLUnsafe` markup whether or not scripts run, and strings passed to `Document.parseHTMLUnsafe` or `DOMParser` `text/html` (adoptees carry the hash; scripting on that document stays off) | Document buffered with `filterResponseData` from `onBeforeRequest`, same hash list and the same hook | — |

Verified on Chrome for Testing 154: after Allow debugger, one script body became the rule text and a sibling script did not (`pnpm e2e:chrome`, 62/62, including the badge count and the options match log).

## Badge and match log

| Capability | Chrome / Edge / Brave 120+ | Firefox 128+ | Safari 17+ |
|------------|----------------------------|--------------|------------|
| Toolbar count | `action.setBadgeText` per tab. `declarativeNetRequestFeedback` (no install warning) | `action.setBadgeText`. No DNR feedback API | Not in this slice |
| Which DNR rule matched | Unpacked: `onRuleMatchedDebug` (request URL). Packed: `getMatchedRules` (tab URL, no request URL) | Not recorded (`webRequest` was not added) | — |
| Page, mock, body rows | Logged locally | Logged locally | — |

Chrome `debugger` is unchanged. The log is `storage.session` only.

## Local Bridge

| Capability | Chrome / Edge / Brave 120+ | Firefox 128+ | Safari 17+ |
|------------|----------------------------|--------------|------------|
| Serve a file from disk | In-place via `chrome.debugger` when Allow debugger is on. Otherwise a DNR redirect to `http://127.0.0.1` | In-place via `filterResponseData` when Allow response rewriting is on. Otherwise the same redirect | Not verified |
| Bridge process | Node CLI on `127.0.0.1` only | Same process | Same process |

Verified on Chrome for Testing 155 (`pnpm e2e:chrome`, 117/117), after Connect and Allow debugger: `*:8001/bridge.js` ran `window.BRIDGE = "DISK"` and the script URL stayed on port 8001. A document with `script-src 'self'` on port 8001 still ran `window.CSP_BRIDGE = "DISK"` and did not request the bridge port. Without that consent the rule is still a redirect, which that policy would block. The same run replaced `*:8001/sri.js` whose `integrity` was the production hash; the override ran, a sibling with a valid hash ran, and a sibling with a bad hash stayed blocked. An in-place `sri-disk.js` whose page hash was for the production file ran the disk bytes. A page that set `integrity` from JavaScript after parse ran `window.SRI_JS = "LOCAL"`; a sibling script whose hash that page set, and which did not match, stayed blocked. A page that passed the production hash to `insertAdjacentHTML` ran `window.SRI_HTML = "LOCAL"`; a sibling in that same string stayed blocked. `createContextualFragment` and `setHTMLUnsafe` with `runScripts: true` ran their overrides; non-matching siblings stayed blocked. `setHTMLUnsafe` with `runScripts` omitted, and with `runScripts: false`, applied override stylesheets; siblings in those strings stayed blocked and kept the page's hash. `setAttributeNS` ran `window.SRI_NS = "LOCAL"`; a non-matching sibling stayed blocked. An `outerHTML` stylesheet and a shadow-root `innerHTML` stylesheet whose page hashes were for the production files applied the override; siblings in those strings stayed blocked. `Document.parseHTMLUnsafe` with a production hash, after `adoptNode` into the live document, applied the stylesheet and the adopted node carried the override hash; a non-matching sibling stayed blocked and kept the page's hash; a script in that document did not run. `DOMParser` `text/html` carried the same override hash; `application/xhtml+xml` kept the page's hash. `setAttributeNode` with a production hash, set before `src`, ran `window.SRI_NODE = "LOCAL"` and the live attribute was the override hash; a sibling moved with `setAttributeNodeNS` stayed blocked and kept the page's hash. `setNamedItem` with a production hash, set before `src`, ran `window.SRI_NAMED = "LOCAL"` and the live attribute was the override hash; writing that hash back through `Attr.value`, `nodeValue`, and `textContent` left the override hash in place; a sibling adopted with `setNamedItemNS` stayed blocked and kept the page's hash. Firefox document rewrite is unit-tested; the live filter was not driven (BiDi).

## Notes

- MV3 everywhere (Firefox too, forced in `wxt.config.ts`); Firefox WebExtensions APIs differ for body rewrite
- Manifest minimums: `minimum_chrome_version: "120"`, `gecko.strict_min_version: "128.0"`
- Safari often lags DNR/scripting parity — ship after Chromium+Firefox Core
- Store review policies differ; `distribution` spec owns permission copy

## Verification policy

- CI (`.github/workflows/ci.yml`): unit tests, typecheck, Chrome and Firefox builds, Chrome for Testing stable `e2e:chrome`, then the three store zips. Firefox UI smoke is not in CI
- Manual: one ESR Firefox check before a store submission
