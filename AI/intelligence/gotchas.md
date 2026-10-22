# Gotchas

**Last verified:** 2026-10-21 (grow-field collapsed CSS lock)

## DNR limits (verified against Chrome + MDN reference, 2026-10-06)

- `MAX_NUMBER_OF_REGEX_RULES` = **1000** for the dynamic(+session) set on Chrome; Firefox evaluates it per ruleset; Safari has no separate regex cap
- Chrome 121+: `MAX_NUMBER_OF_DYNAMIC_RULES` = 30000, but **unsafe** rules (anything other than block / allow / allowAllRequests / upgradeScheme, so **redirect and modifyHeaders count**) are capped at `MAX_NUMBER_OF_UNSAFE_DYNAMIC_RULES` = 5000
- Firefox: `MAX_NUMBER_OF_DYNAMIC_RULES` = 5000 total, no "unsafe" constant. Before Chrome 120 / Firefox 128: `MAX_NUMBER_OF_DYNAMIC_AND_SESSION_RULES`
- Each regex must compile to < 2KB (RE2); `isRegexSupported` reports `syntaxError` / `memoryLimitExceeded`
- Detour reads the constants at runtime (`readLimits`) with fallbacks 5000 / 1000
- Compiling every glob to regex (RO mv3) is what caps rules at 1000 — **prefer `urlFilter`**. Detour only needs regex for regex rules, globs containing `|` or `^`, and redirects that reuse `*` captures

## `updateDynamicRules` is atomic

- One bad rule or an exceeded quota rejects the **whole** call, and nothing changes. RO mv3 ended up with zero rules and no error this way (PR #73)
- Chrome's rejection text names the rule: `Rule with id N …`. Detour drops that rule and retries; if no id is named, it clears the rules and adds them one by one (`fallback: true` in the report)
- Firefox's rejection wording has **not been verified**, so the per-rule fallback is the safety net there

## Matching semantics

- `urlFilter`: `*` wildcard, `|` start/end anchor, `||` domain anchor, `^` separator; ASCII only; must not start with `||*`. Detour globs → `|pattern|` (anchors dropped next to a leading/trailing `*`); a bare `*` → no urlFilter (match all)
- `isUrlFilterCaseSensitive` defaults to **false** (Chrome used to default to true). Detour always sets it explicitly; rules default to case-insensitive
- URLs are matched with punycode hosts and percent-encoded paths, so non-ASCII patterns never match. Detour refuses them (`non-ascii-pattern`)
- `regexFilter` is unanchored (search); Detour anchors glob-derived regexes with `^…$`
- `regexSubstitution`: `\1`–`\9`, `\0` = whole match, `\\` = literal backslash. That allows at most 9 reusable wildcards
- If you omit both `resourceTypes` and `excludedResourceTypes`, a rule matches **everything except `main_frame`**. Navigation redirects need an explicit `resourceTypes: ['main_frame']`. RO mv3 listed all types, including main_frame, on every rule
- Same priority + same action ⇒ the order is unspecified across browsers, so Detour gives every rule a unique positional priority
- modifyHeaders: every matching rule applies. On the same header, a higher-priority `set`/`remove` blocks lower-priority edits, except that lower rules from the same extension may still `append`
- MDN: a redirect whose `regexSubstitution` yields an invalid URL silently does nothing

## Redirect validation

- `new URL('localhost:5173/x')` parses (scheme `localhost:`), so Detour requires `scheme://` or `data:` before trusting it
- A static redirect target that matches its own pattern loops (`ERR_TOO_MANY_REDIRECTS`); Detour refuses it (`redirect-loop`)

## Host permissions

- `declarativeNetRequest` alone covers block/upgrade only; **redirect and modifyHeaders need host access** to the request URL and (for non-navigation requests) the initiator, hence `<all_urls>`

## WXT / build

- WXT defaults Firefox and Safari to **MV2**; Detour sets `manifestVersion: 3`. Firefox MV3 output uses `background.scripts` (event page), not `service_worker`
- Firefox gecko id is `detour@protovoid.com` (Hamza, 2026-10-06), with `data_collection_permissions: { required: ['none'] }`; the Firefox build is warning-free
- Never call `browser.*` at module top level in entrypoints; WXT imports them in Node with a fake browser
- Svelte 5: a `const` derived from a prop captures only its initial value (`state_referenced_locally`); use `$derived`. `typecheck` runs `svelte-check --fail-on-warnings`
- Toolbar icons: `@wxt-dev/auto-icons` rasters `brands/<slug>/icon.svg` into `icons/{16,32,48,128}.png` and sets `manifest.icons`. Also set `action.default_icon` to those paths — without icons Chrome shows a grey letter glyph. Brand `outDir` is `.output/<slug>/`; an old `.output/chrome-mv3-dev` load (pre-brand) had no icon files and produced the letter "D"

## Page scoping (`pageDomains`)

- DNR has no "tab URL" condition. A page-scoped rule compiles to two DNR rules: `main_frame` with `requestDomains` (the page load is checked against its own URL, like RO), and subresources with `topDomains` (Chrome 145+), or `initiatorDomains` where that isn't available
- `initiatorDomains` is the frame that made the request, not the top page, so iframes from other sites aren't covered on Firefox / older Chrome. **Accepted gap** (Hamza, 2026-10-06). The editor warns on scoped groups only when `supportsTopDomains()` is false
- Firefox 157: `declarativeNetRequest.RuleConditionKeys` is null (no `topDomains`). A site-scoped imported group showed the cross-site iframe warning
- An unknown condition key (e.g. `topDomains` on old Chrome) rejects the **whole** batch, so Detour feature-detects with `RuleConditionKeys` (Chrome 145+) before using it
- Domain conditions match hosts only and include subdomains; ports and paths in RO tab patterns can't be enforced (import warning)

## Popup

- The popup lists the first 8 groups. A switch writes `workspace` immediately (no Save). A dirty rules page then shows the "changed somewhere else" banner
- Firefox closes the popup when a file picker opens, so the importer opens `popup.html?view=tab` in a tab there
- `applyReport` holds ids only; the popup joins them with the workspace for labels, and split page-scoped rules show once
- In an async DOM handler, `event.currentTarget` is `null` after the first `await`. Grab the element first. This bit the import picker: the reset threw, so choosing the same file again fired no `change`, and repeat imports silently did nothing
- A file input fires `change` only when its value changes, so reset `input.value = ''` after each import

## Editor

- Chrome accepts `append` on **request** headers only for a case-sensitive allowlist (accept, accept-encoding, accept-language, access-control-request-headers, cache-control, connection, content-language, cookie, forwarded, if-match, if-none-match, keep-alive, range, te, trailer, transfer-encoding, upgrade, user-agent, via, want-digest, x-forwarded-for). Any other name makes Chrome reject the rule. The editor warns but doesn't block. Firefox 157 delivered a DNR `set` of a custom request header (`x-detour`) to the server. `append` on Firefox is still unverified (DNR reference, 2026-10-06)
- A DNR `regexSubstitution` replaces only the **first match** within the URL, not the whole URL. Glob rules are anchored `^…$`, so for them it's the whole URL anyway. A regex rule with `\1` keeps the unmatched prefix and suffix; the preview copies this
- Save timing: take the timestamp **before** `storage.set`. The background can apply and write `applyReport` before the write promise resolves, and a later timestamp would leave status stuck on "Applying"
- Autosave (`storage.local.autosave`, missing = on) waits ~1 s after the last valid edit. Invalid drafts are not written and must not call `showAll`/focus. Own `workspace` writes echo through `storage.onChanged`; after `saved` is updated, `isDirty(loaded, saved)` is false so the editor must not set `changedElsewhere`. Pause autosave while that banner is up
- Imported rules with a custom `resourceTypes` list show under Advanced as "Custom…". The collapsed Advanced section has a checkbox per type. An empty list is a field error. Inject and mock ignore `resourceTypes`
- Compact rows hide body/code editors in a side drawer. E2E and focus helpers must open Edit body/code before touching `.cm-content` or Delivery. The drawer is a sibling of `article.rule`, not inside it
- **Single active rule drawer:** `App.activeRuleId` is the only open flag. Each `RuleEditor` derives `drawerOpen = activeRuleId === rule.id`; `Drawer` mounts only when `open` (`{#if open}`). Opening rule B replaces A — do not give each editor a local `drawerOpen` or stacked shells reappear on close
- **New-rule list strip stays collapsed:** `$effect.pre` may set `detailOpen = true` only when `showAll && hasErrors` — never because `pattern === ''`. Drawer still opens on add via `openSignal`
- Rule / group kebab menus sit under later list siblings unless the open row/header gets `position: relative; z-index: 40` (below overlay drawer `55` / toast `60`)
- Options sticky `.bar` is `z-index: 50`. Docked drawer is `fixed` at `z-index: 30` and must use `top: var(--options-sticky-offset)` (measured from the bar via ResizeObserver; CSS fallback `3.5rem`) or Match tabs clip under the header. Overlay drawers use `z-index: 55` (above the bar, below toast at 60)
- Drawer `.body` is `display: grid` with `flex: 1`. Default `align-content: stretch` grows auto rows to fill the panel height, so Match/Action/Test pills stretch vertically — set `align-content: start`
- Rule drawer sections are **Match / Action / Test** only. The middle tab used to relabel as Redirect/Headers/… which looked like missing action types; label stays **Action**. All engine actions switch via a single **ActionChip** in the drawer head (always visible while editing) — do not duplicate chips inside the Action panel. Redirect destination and other action fields live only on the Action tab
- Drawer `.body` is a tall CSS grid with `align-content: start` — without that, short Action/Test panels stretched auto rows and tab pills grew full-height between horizontal rules. Keep section tabs in the drawer `.head` chrome, not as stretching body rows
- Redirect-delivery `overrideBody` shows in Network as **307 Internal Redirect** on the original URL, then a `data:` request with the body. Filters that hide data URLs or only match the original path hide the second entry. Match log labels those DNR hits "Body replaced (redirect)"; the tester truncates `data:` targets to `data:<mime> (N bytes)`

## Theme and DevTools

- Missing `storage.local.theme` is dark, even when the OS is light. Only `theme: 'light'` switches palettes
- `chrome.devtools` exists only on the devtools page and the panel it creates. Opening `devtools-panel.html` directly cannot see the inspected tab
- Puppeteer's Firefox BiDi session (157.0.1) can `installExtension` on the unpacked build but refuses `browsingContext.navigate` to `moz-extension://` URLs, so the Firefox UI check cannot drive the popup that way

## Recipes

- The localhost recipe redirects both `http` and `https` for that host, all request types, including the page load. A path on the local origin is rejected
- SPA fallback is one regex rule, `main_frame` only, and skips any path that contains a dot (so `/index.html` and files do not loop)
- CORS adds response headers only. It does not answer an OPTIONS preflight

## Rule tester / API Tester

- Options tab is **API Tester** (`#tester`). **Which rules apply** uses `resolveProbe` with `resourceType: xmlhttprequest` (send path). DevTools panel still probes page loads
- Apply Detour rules is **dual-scope**: global `apiSettings.applyDetourRules` (default on) + per-request `inherit` | `on` | `off` (default inherit). `resolveApplyDetourRules` — explicit per-request wins, else global. Do not use a single toggle that is only global or only request-local
- **`apiSettings.autosaveRequests`** (missing = **on**): idle ~1s on the **active** dirty request tab → `saveRequest()`. Header checkbox next to Apply Detour rules. **Separate** from rules workspace `AUTOSAVE_KEY` / options Switch — do not reuse that key or Switch
- When effective on, Apply Detour is a **simulation** via `resolveProbe` — not a guarantee of identical DNR outcomes for every edge case
- **Passphrase field must not use class `.pass`:** that color rule collides with test-result Pass rows. Use `.passphrase-field`; keep pass color on `.tests li.pass` only
- Forbidden request headers on `fetch` need short-lived DNR **session** rules; cleanup must run on abort/error
- API storage keys (`apiCollections`, `apiEnvironments`, `apiHistory`, `apiSettings`) must never collide with rules `workspace`
- Never call API Tester collections a “workspace” in UI copy
- **Tools drawer:** do not remount `ApiTesterPower` / `ApiTesterAdvanced` under `.response` — open via Tools → `Drawer` (docked ≥56rem). Visualize stays on the response tab only (no duplicate iframe in Advanced)
- **Collections UX:** per-row ⋯ kebab (not always-on Rename/Dup/Del text). Rename/delete use in-app `role="dialog"` modal — **zero** `prompt()` / `confirm()` (Chrome wraps those as “The extension Detour says…”). Sibling reorder via `collections.reorderNode` + grip DnD (cross-folder moves out of scope)
- **Request tabs:** `.req-tabs-bar` = scrollable strip + fixed Tools; tabs `flex: 0 0 auto` min ~8rem / max 14rem; session-only tab order (DnD); double-click title to rename. Close is its own `<button>`
- **Side / response tabs:** underline style (Databases pattern) for `.side-tabs` and `.resp-tabs`; keep Params/Auth/body-views as chips. Import uses `class:active` + `aria-pressed` when open
- Grow helpers: `ui/grow-field.ts` — always-grow for rule Pattern/Redirect/Try URL/Note; focus-grow / blur-collapse for API Tester URL (`#tester-url`, soft max ~8 lines), Params/Headers/Body KV values, and Bearer/token fields. Focus-grow fields must start with class `collapsed` and use `syncGrowFieldCollapsed` — bare JS height is not enough: `field-sizing: content` + `pre-wrap` lets a second wrapped line peek under `min-height: 2rem`. `.collapsed` forces `field-sizing: fixed`, `white-space: nowrap`, one-row height. Re-collapse on blur and when tab/URL changes while unfocused
- **API Tester request bar:** top row Rules + Save; bottom Method | URL | Send (`flex-wrap: nowrap`). Use `width: auto` on method/rules selects — `base.css` forces `select { width: 100% }`. Shared `ui/KvTable.svelte` for Params/Headers/urlencoded/formdata. Body uses compact `.body-toolbar`; `none` is a short muted line
- A rule that omits `resourceTypes` does not match page loads (DNR's "everything except main_frame")
- Mocks win only for Fetch / XHR. A script or page load still follows DNR even when a mock pattern matches the URL
- The probe does not model the initiatorDomains cross-site iframe gap. It scopes by the page URL's host
- It resolves the draft on screen. "Detour is off" and "Includes unsaved edits" mean the live engines may differ
- Sandboxed scripts: CSP + timeout; not a security boundary against malicious collections the user chose to run
- Slice B `chrome.alarms` schedules only fire while the browser is open — UI must say so (`SCHEDULE_BROWSER_OPEN_COPY`)
- Load test soft cap is 200 (warn); hard cap 1000. Runner/load/scheduled sends use `executeApiRequest` (dual-scope Apply Detour)
- Scheduled background runs skip scripts (no sandbox iframe in the service worker); options Runner runs scripts
- `apiRuns` / schedules live under api-client storage keys — never rules `workspace`
- OpenAPI YAML uses a lite parser; prefer JSON when available
- Slice C OAuth uses optional `identity`; Chrome `launchWebAuthFlow`, Firefox manual code + PKCE verifier stored in-page until Exchange
- Cookie jar requests optional `cookies` on first use — Cookie header still needs DNR session rules when sending via fetch
- Folder sync File System Access is Chromium-first; Firefox UI copy points to Export / Import (`FOLDER_SYNC_COPY`)
- Capture handoff uses `session` key `apiCapturePending` (`queueCapture` / `takeCapture`); DevTools / Log navigate to `#tester`

## Resource Override import

- v1 (master): `{ v: 1, data: [{ id: "d1", matchUrl, on, rules }] }`, file bodies inline in `rule.file`
- v2 (mv3): the original exporter wrote `{ v: 2, ruleGroups }`, while the importer read `data`. Fixed in PR #73 to `{ v: 2, data }`. Groups use `name`, but older exports wrote `matchUrl`
- A group's `matchUrl`/`name` gates rules by **tab URL**. Detour maps the host to `pageDomains`. A port/path it can't enforce gives a `page-scope-approximated` warning. A pattern with no usable host (e.g. `*` host with a path) imports the group **disabled** with a `page-scope-unsupported` reason
- RO applied rules to page loads too, so imported rules list every resource type explicitly, including `main_frame`
- RO globs pair `*` runs by length (`**` ↔ `**`); Detour treats any run as one wildcard, with a `wildcard-groups-simplified` warning
- Header strings look like `set name: value;remove name`, with URI-encoded parts and lowercased names
- The RO mv3 exporter (before PR #73) could write `{}`; Detour rejects it with an explicit message
- RO "redirect to the same URL = stop here" (an allow-like rule) has no Detour equivalent yet
- Re-import identity is file name **or** content SHA-256 (ADR-007). Identical content replaces silently. The same name with different content asks Replace / Import as new / Cancel. `importKey` keeps each group's and rule's on/off state; everything else is replaced. User-created groups (no `importedFrom`) are left alone

## `data:` redirects

- RO mv3 file overrides use `data:` URLs. Detour’s default `overrideBody.delivery: redirect` does the same (ADR-025): works with DevTools open, no debugger
- `data:` can be blocked by CSP (`connect-src` / `script-src`), does not satisfy SRI, and Network shows a `data:` response. Use `delivery: inPlace` for those pages
- Opaque responses and CORS `no-cors` quirks still apply (see RO #32). Files on disk use `serveLocal` and the Local Bridge

## CORS / preflight

- Redirecting XHR/fetch can invalidate preflight (#11), so document and test header rules carefully
- 404-fallback to prod (#10) often needs a CORS header strategy

## SRI

- The HTML parser copies `integrity` onto the request when it prepares a script, before page JavaScript runs. A MAIN-world content script cannot see that write. Detour rewrites the document instead (ADR-014)
- While an `overrideBody` or in-place `serveLocal` rule is armed, UTF-8 HTML up to 2 MiB gets `sha384-` of the override bytes on each matching script or stylesheet tag. Other tags keep the page's hashes. The browser still checks the new hash
- The hash and the fulfilled body come from the same read. A failed read leaves the published hash. Non-UTF-8 documents and documents over 2 MiB are left unchanged
- A redirect to `127.0.0.1` (rewriting off) does not change the document, so the page's hash can still reject the file
- Page JavaScript that sets `integrity` after parse is handled by a MAIN-world `document_start` hook, registered only while a body rule is armed (ADR-015). The hook reads a `<meta name="detour-sri">` hash list embedded by the document rewrite. It substitutes `sha384-` of the override and does not clear `integrity`. The list has match patterns and hashes, not rule bodies or the bridge token. The page can read it. A later edit of the meta is ignored after the first snapshot. A forged hash can only make the check fail
- `innerHTML` and `insertAdjacentHTML` rewrite `integrity` in a string before the fragment parser runs, using the same hash list (ADR-016). A non-string is passed through, so TrustedHTML is not stringified. Markup over 2 MiB, or a page with no list, keeps the page's hashes. The fragment parser marks those scripts already started, so they do not run from the insertion alone. A stylesheet in the string is fetched and checked. [HTML fragment parsing](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#html-fragment-parsing-algorithm)
- `Range.createContextualFragment` always rewrites a string. The HTML spec parses it with scripting mode Fragment, so inserted scripts run (ADR-017). `Element.setHTMLUnsafe` and `ShadowRoot.setHTMLUnsafe` rewrite a string for every `runScripts` value, including omitted and `false` (ADR-019). The options object is forwarded unchanged, so scripts still run only when `runScripts` is strictly `true`. A stylesheet in an inert call is fetched and checked. A non-string, including TrustedHTML, is passed through. [createContextualFragment](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-range-createcontextualfragment), [setHTMLUnsafe](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-element-sethtmlunsafe)
- `Element.outerHTML` and `ShadowRoot.innerHTML` rewrite `integrity` in a string before the fragment parser runs, using the same hash list (ADR-018). Those scripts do not run from the insertion alone. A stylesheet in the string is fetched and checked. A non-string is passed through. `Element.setAttributeNS` substitutes the hash when the attribute is HTML `integrity` (no namespace, empty namespace, the HTML namespace, or a prefixed name with that local name) on a script or stylesheet link. Setting `src` or `href` that way re-resolves a hash already assigned. An attribute in another namespace is left unchanged. The hook does not clear `integrity`. [outerHTML](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-element-outerhtml), [setAttributeNS](https://dom.spec.whatwg.org/#dom-element-setattributens)
- `Element.setAttributeNode` and `Element.setAttributeNodeNS` do not call `setAttribute` or `setAttributeNS`. The hook sets the Attr's value to the same SHA-384 when `namespaceURI` is null, empty, or the HTML namespace and the local name is `integrity`, on a matching script or stylesheet (ADR-021). Setting an `src` or `href` Attr that way re-resolves a hash already assigned. A foreign namespace and a non-matching URL are left unchanged. The hook does not clear `integrity`. A failed adopt restores the Attr's previous value. [setAttributeNode](https://dom.spec.whatwg.org/#dom-element-setattributenode)
- `NamedNodeMap.setNamedItem` and `setNamedItemNS` do not call `setAttributeNode`. The hook records the element when page code reads `Element.attributes`, then uses the same substitution (ADR-022). A map that did not come from that getter is left unchanged. Once the Attr is already on a matching script or stylesheet, `Attr.value` rewrites a later write. Chrome 155 keeps `nodeValue` and `textContent` on `Node.prototype`, not `Attr.prototype`; those setters are hooked only when the receiver is an Attr, so an element's `textContent` stays as written. An unattached Attr keeps the page's string until an adopt hook runs. A non-matching URL and a foreign namespace stay. The hook does not clear `integrity`. [setNamedItem](https://dom.spec.whatwg.org/#dom-namednodemap-setnameditem), [Attr.value](https://dom.spec.whatwg.org/#dom-attr-value)
- `document.write` and `document.writeln` concatenate string arguments, rewrite `integrity` in that one string, then call the original method (ADR-023). `writeln` still appends its line feed. A tag split across arguments is rewritten. A call that includes a non-string, including TrustedHTML, is passed through. During parsing, a script in that string runs. After the document has finished loading, `document.write` can still call `document.open` and replace the document. [document write steps](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#document-write-steps)
- An iframe `srcdoc` string is parsed as the frame's document, so the other markup hooks never see a property assignment. The hook rewrites a string assigned to `HTMLIFrameElement.srcdoc`, or passed to `setAttribute` / `setAttributeNS` as HTML `srcdoc` on an iframe, before that parse (ADR-024). A non-string, including TrustedHTML, is passed through. `srcdoc` on any other element, and `srcdoc` in another namespace, stays. A `sandbox` without `allow-scripts` still blocks scripts in the frame. The hook does not change `sandbox` and does not inject the hash-list meta into the srcdoc string. [srcdoc](https://html.spec.whatwg.org/multipage/iframe-embed-object.html#attr-iframe-srcdoc)
- `Document.parseHTMLUnsafe` rewrites `integrity` in a string before the HTML parser runs (ADR-020). The new document has no browsing context, so scripting stays disabled. The options object, including a sanitizer, is forwarded. A node moved into a live document carries the rewritten attribute. A stylesheet is fetched and checked then. A script parsed this way still does not run after `adoptNode`. A non-string, including TrustedHTML, is passed through. `DOMParser.parseFromString` rewrites only when the type is exactly `text/html`, the same parse. `text/xml`, `application/xml`, `application/xhtml+xml`, and `image/svg+xml` are left unchanged. Safe `setHTML` and `Document.parseHTML` are not hooked. [parseHTMLUnsafe](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-document-parsehtmlunsafe), [DOMParser](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#domparser)
- Open pages keep the hook until the next load after the body rule is turned off
- Chrome pauses documents with Fetch `resourceType: Document` (a bare `*` pattern already pauses them) and fulfills the HTML. Firefox opens `filterResponseData` from `onBeforeRequest` and drops `content-encoding` on those documents, because the stream is already decoded. HTML documents are `Cache-Control: no-store` on Firefox while a body rule is armed. Chrome sets that when the document bytes change, which includes publishing the hash list

## Chrome 137+ extension loading

- `--load-extension` removed from Chrome-branded builds (Chrome 137+)
- Use CDP **`Extensions.loadUnpacked`** with `--enable-unsafe-extension-debugging` for automation (RO PR #73)
- `--disable-features=DisableLoadExtensionCommandLineSwitch` stopped working after Chrome 142
- What works (verified on Chrome for Testing 154): puppeteer-core `launch({ pipe: true, enableExtensions: true })` + `browser.installExtension(dir)`, which uses that CDP path. See `extension/e2e/chrome-smoke.mjs`
- When writing test rules, a redirect target on the same path (e.g. `*/a.js` → `http://127.0.0.1:8002/a.js`) matches its own pattern and is refused as `redirect-loop`. Scope the pattern (`*:8001/a.js`)

## Permissions UX

- Body override does not attach on install. Chrome’s `debugger` permission is install-time: an optional grant cannot be accepted from a headless click (Chrome 154), and reading `chrome.debugger` before it exists crashes the service worker. Attach waits for Allow debugger (`storage.local.bodyEngineConsent`)
- Chrome shows a “started debugging this browser” infobar. `--silent-debugger-extension-api` hides it for tests; it does not grant the permission
- Only one debugger client owns a tab. Puppeteer and Detour cannot both attach. The Chrome smoke test grants consent at the end and opens the body page from the service worker so Puppeteer never attaches to it
- Cancelling the infobar (`canceled_by_user`) leaves that tab detached until the body-rule plan changes. Opening DevTools detaches Detour (`onDetach`)
- Firefox asks for `webRequest`, `webRequestBlocking`, and `webRequestFilterResponse` from Allow response rewriting. The listener is installed only while a body rule is armed
- Optional host permissions should be progressive where store policies allow

## Body override

- Default `delivery: redirect` is a DNR `data:` URL (RO 2.0). Opt-in `inPlace` keeps the URL via debugger / filterResponseData (ADR-009, ADR-025)
- Only one debugger client owns a tab. DevTools and in-place Detour fight; redirect delivery does not. That is why a `switch.json` override failed with the old debugger-only path when DevTools was open
- CDP `Fetch.fulfillRequest` body is base64 (in-place). `continueResponse` with only `requestId` leaves a non-document response alone. HTML documents are the exception for SRI rewrite. Do not call `Fetch.getResponseBody` for the script or stylesheet being replaced
- Drop `content-encoding`, `content-length`, and `transfer-encoding` on an in-place replacement or Chrome tries to gunzip the new bytes
- A regex or bare `*` Fetch pattern pauses every response in the tab (in-place only). The editor warns for in-place broad patterns
- Matching script and stylesheet tags get a SHA-384 hash only while in-place body rules are armed. See SRI above. Redirect delivery does not rewrite `integrity`
- A DNR redirect for the same URL can move the request before Fetch sees the response. The tester notes the overlap; the compiler does not suppress either rule
- Mocks still win for `xmlhttprequest` (the page answers first)
- Out-of-process iframes are not auto-attached. Firefox does not filter service-worker script streams
- `applyReport.bodies` lists armed in-place rules by id. Redirect delivery shows under `applied`. Import notices must not echo file contents either

## Firefox vs Chromium

- Body rewrite APIs differ (`filterResponseData` vs debugger); one RuleCompiler, multiple backends
- Firefox has `declarativeNetRequest.testMatchOutcome()`, a candidate for a native rule tester there

## Page inject and api-mock

- `userScripts` can exist before the user allows it, and its methods throw. Probe with `getScripts()` (`userScriptsAvailable`). Chrome reads it through a getter because the property appears and disappears with the toggle. On Firefox 157 the property is missing until the optional permission is granted; the doorhanger buttons are Allow and Deny
- Inline JS is registered on `<all_urls>` and wrapped in a guard. The code runs inside a block, so top-level `let` / `const` / `class` are not page globals. The editor says to use `window.name = …`
- A script URL inserted at `document_start` still downloads asynchronously, so page scripts can run first. Inline `userScripts` at `document_start` runs before them (verified on Chrome 154 and Firefox 157)
- `insertCSS` goes bridge → background → tab, so CSS can land just after `load`. E2E waits for the computed style
- Subframe site scoping uses `location.ancestorOrigins` when the browser exposes it (Chromium). Firefox frames use their own host
- Mock config crosses worlds as a `CustomEvent` whose `detail` is a JSON string. Requests made before it arrives are held up to 1 s, then mocked or passed through. Synchronous XHR in that window cannot wait, so it passes through
- Status 204, 205, 304, and HEAD mocks send no body. `delayMs` listens for `AbortSignal`
- A mock is answered in the page, so DNR redirect/block/header rules for that URL never see the request. Mock wins
- CSS and script injection change on the next load. Mock on/off updates open pages without a reload
- `pageConfig` includes mock bodies (the bridge needs them). Failure records and `applyReport` do not. Do not add telemetry on `pageConfig`
- CodeMirror 6 is imported only from the options page. The production chunk is about 435 KB; popup stays separate
- User scripts are cleared on extension update. `runtime.onInstalled` re-runs `syncRules`. Firefox also re-syncs on `permissions.onAdded` / `onRemoved`

## Match log and badge

- `declarativeNetRequestFeedback` is the Chromium way to see which dynamic rule matched. It does not warn at install. Do not add `webRequest` to log matches: Chrome warns that it can read browsing history. Firefox 128 has no DNR feedback API, so Firefox DNR matches are absent from the log; page, mock, and body rows still record
- `onRuleMatchedDebug` includes the request URL and only fires for an unpacked extension. `getMatchedRules` has rule id, tab id, and time, not the request URL, so a packed row stores the tab URL. Poll keys use the `dnr-poll:` prefix and are left out of the badge count once a debug row for that tab exists
- Do not call `getMatchedRules` while clearing badges. Calling it for every tab (including non-http) wedged Chrome 154. Poll only the tab that finished loading, and race it at 4s so a slow call cannot block the badge. Turning the badge or Detour off clears text outside that queue
- A tight loop of `action.getBadgeText` from an extension page can stall the service worker's `setBadgeText`. The Chrome smoke test reads the badge a few times with a gap
- `tabs.onUpdated` often includes the URL again when `status` is `complete`. Reset the per-tab count on `loading` or a real URL change, not on complete, or the matches from that navigation fall outside the count. Match timestamps can precede `onUpdated` by a short time (`NAV_SLACK_MS` is 2s). The clock is in the service worker and resets when the worker restarts
- The session log can hold request URLs, including tokens in a query string. It stays in `storage.session` on the device. Labels are the group name and match pattern. Never store or ship action bodies
- Inline JS runs in the MAIN world and cannot message the extension, so those injections are not log rows. Options `h2` text is uppercased in `innerText` (`text-transform`); assert `textContent` for "Recent matches"

## Databases native host (Slices A–D + Connection options + partner hooks — ADR-027/029/030)

- Native messaging host→browser messages are capped at **1 MB**. Result sets must chunk (~900 KB) and page (Cassandra `pageState`, SQL OFFSET/FETCH)
- Browser stores cannot install native hosts — one-time OS-pack **Install Detour Helper** or `detour db install`; day-to-day start/stop is `connectNative` / port close (ADR-027/029)
- **`hello` first:** host returns `{ protocolVersion, hostVersion, capabilities[] }`. Extension shows Helper too old/new on protocol mismatch; engines and SSH/proxy sections are gated from `capabilities` (`engine:<id>`, `ssh`, `proxy`, …)
- **Brand host name:** `nativeHostName` (default `com.detour.db`) from brand config / `import.meta.env.BRAND` — partners may use a distinct name so helpers coexist (ADR-030)
- **`DETOUR_BRAND_DIR`:** absolute external brand tree for private builds; in-tree `brands/<slug>` still works. Do not commit closed partner helper source into the public MIT repo
- **Portable contract:** `DETOUR_DB_HOST_CMD=/path/to/binary` runs the framing/`hello` suite against any conforming host (for private Go helpers)
- **Preferred path:** OS packs (`detour-<ver>-<os>-<arch>`) ship a self-contained SEA; store zips stay extension-only. Gatekeeper / SmartScreen warnings are expected at $0 unsigned (no notarization)
- **Stable Chromium id:** public manifest `key` per brand (Detour in-repo; Rogers gitignored). Installer `allowed_origins` = brand unpacked id (+ store ids when known) + optional `--extension-id`. Never commit private `.pem`
- **CWS live (2026-10-21):** store id `jfgbokgdgpjhkciooicmbdgablgkklmn` (listing `https://chromewebstore.google.com/detail/detour/jfgbokgdgpjhkciooicmbdgablgkklmn`). Listed in `brands/detour` `chromiumExtensionIds` + `cli/src/db/extension-ids.ts` `DETOUR_STORE_CHROMIUM_IDS` alongside unpacked `hegphfgboahkhkpiglcccnkbdpddpemj`. Older docs wrongly used `…abigkklmn`. Public helper install (`detour db install` / public OS pack Install Helper) writes those ids into NM `allowed_origins` — re-run that path after appending a store id so the CWS extension can connect
- **SEA base binary:** Homebrew Node is a thin stub + `libnode.dylib` and cannot be postject-injected. `sea:build` downloads the official nodejs.org binary into `cli/.cache/node-official/` when `process.execPath` is too small / links `libnode`. CI `setup-node` already uses official builds. Detect fuse at inject time (`NODE_SEA_FUSE_…df1996b2` on Node 24+; older docs show `…df481702`)
- **SEA natives:** `@napi-rs/keyring` (+ `keyring-<platform>`) must be real copies beside the binary (`createRequire(dirname(execPath)/package.json)`). Copy via pnpm store realpaths — do not zip pnpm symlinks
- **Intel Mac CI:** use an Intel runner label (e.g. `macos-15-intel`); `macos-latest` is arm64 only
- **GUI browser PATH (Node launcher only):** Chrome/Edge/Firefox from a GUI often inherit a minimal PATH without Node. Dev `db install` embeds the **absolute** Node path. OS-pack SEA installs need no Node. Symptom if using the Node launcher: **Native host disconnected** (exit 127)
- **Launcher shape:** darwin/linux → bash `cli/bin/detour-db-host`; win32 → `cli/bin/detour-db-host.cmd` (Chrome requires `.exe` or `.bat`/`.cmd`, not a shebang). Paths with spaces are quoted on every OS
- **Windows registry:** Chromium browsers read `HKCU\Software\…\NativeMessagingHosts\com.detour.db` (default value = JSON under `%LOCALAPPDATA%\Detour\NativeMessagingHosts`). Firefox uses a separate JSON (`allowed_extensions`) under `%APPDATA%\Mozilla\NativeMessagingHosts` and its own HKCU Mozilla key — do not point Mozilla at the Chromium manifest. `db uninstall` deletes all registered keys
- **No sole-OS install paths:** Homebrew `/opt/homebrew/…` probes are optional same-binary aliases only; install always falls back to `process.execPath`. Do not hardcode `/Users/…` or `C:\Program Files` as the only Node path
- mkdir into Edge/Brave Application Support dirs can **EPERM** if that browser was never installed — install skips and notes; Chromium Chrome dir + Windows registry are enough for day-to-day
- Paths with spaces (e.g. `Resource Override`) must stay **quoted** in the launcher; the Chrome JSON `path` field is fine as a single string
- WXT `browser` (webextension-polyfill) often lacks `runtime.connectNative` on Chromium — Databases must call `chrome.runtime.connectNative` via `connectNativePort` (`extension/src/db-client/protocol.ts`), not `browser.runtime.connectNative`
- **Optional `nativeMessaging` first grant:** after `permissions.request` succeeds, Chrome often leaves `chrome.runtime.connectNative` undefined until the extension reloads. Probe with `isConnectNativeAvailable()`; UI uses `helperStatus: 'needs_reload'` + Reload panel — never surface raw `connectNative missing` to users. Keep permission optional (Approved db-client spec)
- **macOS `pickFile`:** Prefer clang-built Cocoa sibling `detour-pickfile` (`nsopen.m`, Regular NSApp + `makeKeyAndOrderFront`) — `osascript` **Accessory** panels stay non-key under Chrome (dimmed list, clicks dismiss). Install also `osacompile`s `pickfile-nsopen.scpt` as fallback (Regular policy). Order: native binary → compiled `.scpt` → inline `-e` → Finder `choose file`. AppleScript cancel **-128** → `null`. iCloud badges unrelated. Stale install: missing `detour-pickfile` Mach-O beside host / old Accessory-only script
- **Stale installed helper after pack rebuild:** Reload alone does **not** replace `~/Library/Application Support/Detour/db-host/detour-db-host`. After every new OS pack / `dist/staging` rebuild, re-run **Install Detour Helper**. Symptom: `hello` lacks `pickFile` → `unknown method "pickFile"`. Databases UI now warns explicitly when the capability is missing
- **Rogers local Mac verification (Hamza standing DoD):** after any change that ships in the closed OS helper/pack and should affect this Mac’s live host, agents must finish from `rogers-detour` with `export DETOUR_PUBLIC_DIR="<public Detour checkout>"` then `pnpm install:helper:local` (packs macos-arm64 + runs `install.sh`). Reload extension alone never updates Application Support. Details: `rogers-detour/AGENTS.md` OS packs + `rogers-detour/AI/intelligence/gotchas.md`
- **Rogers Windows handoff DoD (Hamza standing):** for Windows / simple helper+extension fixes, from `rogers-detour` run `export DETOUR_PUBLIC_DIR="<public Detour>"` then `pnpm extract-windows-helper-scripts` (rebuilds Rogers extension, packs windows-x64, refreshes `dist/extract-windows-helper-scripts/`). Not ad-hoc unzip/cp. Mac `install:helper:local` is not Windows coverage. Full Install Helper on Windows still runs from the OS pack. Details: `rogers-detour/AGENTS.md` + `rogers-detour/AI/intelligence/gotchas.md`
- **Windows `pickFile`:** Host prefers sibling `detour-pickfile.exe` (fresh process, 120s kill) so `GetOpenFileNameW` never blocks native-messaging `Handle()` when the dialog is behind Chrome. In-process fallback uses `LockOSThread` + `CoInitializeEx(STA)` + TopMost owner raise + a pick mutex (second concurrent common dialog hangs). Install Helper builds/copies the sibling beside the host. Node SEA same sibling preference; PowerShell `-STA` is **dev/fallback only**. Extension: shared `browsing` lock + 90s timeout + Cancel… clears the lock — without that, a hung RPC leaves every Browse button stuck on “Browsing…”
- **Windows second Browse stuck (2026-10-09):** Symptom — all SSL Browse buttons show “Browsing…”; truststore may show a partial `C:\Users\…`. Cause — in-process `GetOpenFileNameW` on the host thread (dialog lost / never returned) so `finally` never cleared `browsing`. Fix — sibling spawn + UI timeout/Cancel + STA/mutex hardening. Immediate recovery before new pack: click **Cancel…** (or Reload options tab), **Stop helper** then **Start**, Alt+Tab for a leftover dialog; paste paths if needed
- **Linux `pickFile`:** Probe `zenity` then `kdialog` once and cache; avoid a failed spawn on every Browse when zenity is absent
- **Rogers `pack:all`:** always rebuilds the extension from public Detour before zipping. Re-packing a stale `.output/extension` shipped an old options bundle without `needs_reload` while Hamza still saw `connectNative missing`
- **Rogers `dist/` must stay current (Hamza standing rule):** after `helper-go/` or packed-extension fixes, refresh **both** `rogers-detour/dist/detour-*.zip` (windows-x64 + macos-arm64 at minimum) **and** `dist/staging/` via `pnpm pack:all && pnpm pack:verify` in the private repo — public Chrome zips alone are not enough. Bare `pnpm pack` only updates the host OS. Never run concurrent `pack.mjs` (staging `ENOTEMPTY` / mixed trees). Details: `rogers-detour/AI/intelligence/gotchas.md`
- **Closed Go helper `pickFile`:** Rogers packs ship Go source (not Node SEA). The Go host must implement RPC `pickFile` + advertise capability `pickFile`; without it Browse fails with `unknown method "pickFile"` even when the extension UI is correct
- **`pickFile` contract (Go ↔ Node):** method `pickFile`; params `title` + optional `filters: [{name, extensions[]}]`; cancel → `{path: null}`; failures → RPC error. macOS: Cocoa `detour-pickfile` (+ compiled `.scpt` / inline Regular / Finder); Windows: native Win32 / `detour-pickfile` (PowerShell fallback); Linux: cached zenity|kdialog. After every `pack:all` / staging rebuild Hamza must re-run **Install Detour Helper** from the new pack root

- SEA + native addons: `esbuild` / `ssh2` / `oracledb` may need `pnpm approve-builds` (`allowBuilds` in `pnpm-workspace.yaml`). Optional `kerberos` / `@azure/identity` are external / dynamic — fail cleanly when missing
- **Driver-gated auth:** `pg` has no GSSAPI (UI disables); `mysql2` has no Kerberos plugin (UI disables); Oracle Kerberos needs thick + Instant Client; Entra interactive is host→system browser
- **TLS files by path:** host expands `~`, reads CA/cert/key at connect; missing file → clear RPC error. Never store cert bytes in `chrome.storage`. Mode `disable` early-returns without reading path contents (paths may still be filled in the UI)
- **SSL path fields always visible:** CA / client cert / client key show under SSL for every mode (including Disable). Mode controls host **application**, not field visibility (TablePlus-style)
- **TLS client-key passphrase (encrypted keys only):** No inline Key passphrase field. After Browse/blur on **client key** only, host RPC `inspectPemKey` `{ path }` → `{ encrypted }` (cap ~64KiB; capability `inspectPemKey`). Encrypted = PEM type `ENCRYPTED PRIVATE KEY` or legacy `Proc-Type`/`DEK-Info`. Modal “Private key password” → draft → keychain `${secretAccount}:sslKeyPass`; host hydrates `tls.keyPassphrase`. Unencrypted keys never prompt. CA/client cert Browse never inspects for passphrase. Optional “Update key passphrase…”. **No IncompletePair gate:** key-only or cert-only with TLS on passes host validation; material present is passed to the driver (TablePlus docs silent; Hamza wants key-only)
- **Go helper Cassandra TLS (Rogers packs):** `BuildCassandraOptions` uses shared `SSLFromConfig` (passphrase + SNI + CA/cert/key). Client identity loads via `tlsutil.X509KeyPair` only when **both** cert and key are present (decrypts traditional PEM-encrypted keys; PKCS#8 `ENCRYPTED PRIVATE KEY` not yet). `inspectPemKey` + `PemKeyEncrypted` mirror Node. Key-only / cert-only is not IncompletePair-rejected — Go crypto/tls simply omits `Certificates` until both sides exist; server/driver may still fail. Verify-full to an IP still needs **Server name (SNI)**; add CA/cert/key as the server requires. After pack rebuild: re-run **Install Detour Helper** (Reload alone is not enough)
- **Cassandra local DC:** Do **not** invent `datacenter1` when Local datacenter is blank (Go + Node + new-connection UI). Real clusters often use `DC1` (case-sensitive). Blank → no DCAware policy in Go; user must set the real DC. Host field accepts comma-separated contact points
- **Java truststore/keystore (plan 032):** Optional `tls.trustStorePath` / `tls.keyStorePath` (JKS or PKCS12) + keychain `:trustStorePass` / `:keyStorePass`. Host hydrates into PEM CA / client cert+key when SSL mode ≠ Disable. Precedence: truststore overrides `caPath`; keystore overrides `certPath`/`keyPath`. PEM-only still works when store paths are empty. No hardcoded Spring hosts/DC/secrets — each connection configures its own. Go: `tlsutil.LoadJava*` tries JKS (`0xFEEDFEED`) and PKCS12 (ASN.1 `0x30`) both ways; PKCS12 via `software.sslmate.com/src/go-pkcs12` (modern Java SHA-256/PBES2). Node: `jks-js` (+ PKCS12 bags without `friendlyName` fallback). Passwords are not swapped (`:trustStorePass` → truststore, `:keyStorePass` → keystore). Friendlier errors distinguish wrong password vs unsupported format; empty password hints to re-enter. Spring `.keystore` may be JKS **or** PKCS12 (Java 9+ default). JCEKS rejected with a clear message. **Last verified:** 2026-10-09
- AWS Keyspaces: TLS with Amazon Root CA1 at `cli/src/db/certs/starfield-keyspaces.pem`; typical port **9142**
- Azure Cosmos DB Cassandra API: port **10350**
- Live contract tests: `docker compose -f docker-compose.db.yml up -d …` then `DETOUR_DB_E2E=1 pnpm --filter @detour/cli test:db-e2e`; TLS extras need `node cli/src/db/certs/generate-test-certs.mjs` then `--profile tls`
- **After any Docker/compose work** (e.g. `docker-compose.db.yml` / `DETOUR_DB_E2E`): always `docker compose -f docker-compose.db.yml down`, then quit Docker Desktop on macOS (`osascript -e 'quit app "Docker"'` or equivalent). Do not leave the daemon running. Hamza standing rule (2026-10-09)
- Do not reuse Local Bridge loopback HTTP for DB traffic (open port + token; wrong lifecycle). Slice D may only start/stop that process
- Safari has no compatible native messaging — out of Databases v1
- Secrets stay in the OS keychain on the host; never in extension storage or collection exports

## Local Bridge

- Bind is the literal `127.0.0.1`. There is no `--host`. `localhost` may resolve to `::1`, which this process does not listen on
- The token is in the redirect URL (`/d/<token>/<base64url>`) when response rewriting is off. The page you override can see it then. In-place mode fetches that URL from the extension, so the page does not. Other origins cannot guess it. Restarting the CLI rotates it
- `Access-Control-Allow-Private-Network` is sent only after the token matches. A wrong token is 404 with no CORS opt-in
- A pattern that also matches `http://127.0.0.1:<port>/…` is refused as a redirect loop (`*`, or anything that covers every URL) while the rule is a redirect. In-place does not redirect, so that check is skipped. `https://cdn.example.com/*.js` does not loop either way, because the bridge path has no filename
- A page Content-Security-Policy that does not allow `http://127.0.0.1` blocks the **redirect**. With Allow debugger / Allow response rewriting, `serveLocal` keeps the original URL and the extension reads the file itself (ADR-013). Verified on Chrome for Testing 155: `script-src 'self'` on port 8001 still ran the disk script, and the page did not request the bridge port
- In-place responses are status 200 with `Cache-Control: no-store`. Files over 8 MiB are not copied into the service worker; the production response stays. A failed read does the same. On Firefox, headers may already have dropped `content-encoding` before that failure
- Cancelling Chrome’s debugging banner leaves that tab on the production response until the body plan changes. There is no per-tab redirect fallback
- Do not log the extension’s loopback `GET`. The token is in that path. The match log records the page URL only
- The CLI refuses the filesystem root. A symlink inside the folder that points outside is 404. Health returns the folder basename, not a full path
- `bridgeSession` lives in `storage.local`. Disconnect stores null. Apply probes only when an enabled `serveLocal` rule exists
- Node 24 runs the CLI with `--experimental-strip-types`. Tests are `node --test` in `cli/`, not Vitest

## CI and packaging

- `@detour/extension` run through WXT’s filename sanitizer becomes `detourextension`. `zip.name: 'detour'` is what makes `detour-<version>-chrome.zip`
- `wxt zip -b firefox` also writes `detour-<version>-sources.zip` (AMO). Default excludes drop `node_modules`, `*.test.ts`, and `.output`. Extra excludes drop `.env`, keys, and `.wxt/`
- Chrome for Testing **stable** is what CI installs (155.0.8059.39 on 2026-10-07). Pinned 154 builds still exist under `~/.cache/puppeteer` but are not what the workflow launches
- GitHub-hosted Ubuntu cannot use Chrome’s sandbox. `e2e/chrome-smoke.mjs` adds `--no-sandbox`, `--disable-dev-shm-usage`, and `--disable-gpu` only when `CI` is set. Linux library install (`--deps`) must be root; `@puppeteer/browsers` refuses it otherwise
- `chrome:install` prints the executable path and nothing else on stdout. A download of stable can take several minutes the first time
- No `git remote` yet. The workflow file does not run until `main` is pushed. Tag `v*` after that to open a GitHub Release. Do not put CWS, Edge, or AMO tokens in the workflow
