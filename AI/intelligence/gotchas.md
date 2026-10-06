# Gotchas

**Last verified:** 2026-10-07

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
- Imported rules with a custom `resourceTypes` list show under Advanced as "Custom…". The collapsed Advanced section has a checkbox per type. An empty list is a field error. Inject and mock ignore `resourceTypes`

## Theme and DevTools

- Missing `storage.local.theme` is dark, even when the OS is light. Only `theme: 'light'` switches palettes
- `chrome.devtools` exists only on the devtools page and the panel it creates. Opening `devtools-panel.html` directly cannot see the inspected tab
- Puppeteer's Firefox BiDi session (157.0.1) can `installExtension` on the unpacked build but refuses `browsingContext.navigate` to `moz-extension://` URLs, so the Firefox UI check cannot drive the popup that way

## Recipes

- The localhost recipe redirects both `http` and `https` for that host, all request types, including the page load. A path on the local origin is rejected
- SPA fallback is one regex rule, `main_frame` only, and skips any path that contains a dot (so `/index.html` and files do not loop)
- CORS adds response headers only. It does not answer an OPTIONS preflight

## Rule tester

- The default probe is a **page load**. A rule that omits `resourceTypes` does not match it (DNR's "everything except main_frame"). Pick Script or Fetch / XHR in Request context to test those rules
- Mocks win only for Fetch / XHR. A script or page load still follows DNR even when a mock pattern matches the URL
- A page-load redirect or block suppresses injects for that URL. A subresource redirect does not
- The tester does not model the initiatorDomains cross-site iframe gap. It scopes by the page URL's host
- It resolves the draft on screen. "Detour is off" and "Includes unsaved edits" mean the live engines may differ

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

- RO mv3 file overrides use `data:` URLs, which hit **CSP**, opaque responses, and CORS mode limits (`no-cors` quirks; see RO #32)
- Body override (`overrideBody`, ADR-009) keeps the original URL. Files on disk use `serveLocal` and the Local Bridge. Do not emit giant `data:` bodies

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
- `outerHTML`, `setAttributeNS`, `ShadowRoot.innerHTML`, `Range.createContextualFragment`, and `setHTMLUnsafe` are not hooked. `createContextualFragment` clears the already-started flag, and `setHTMLUnsafe` with `runScripts: true` can execute a script whose hash is still the one in the markup. [createContextualFragment](https://w3c.github.io/DOM-Parsing/#dom-range-createcontextualfragment)
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

- Do not use a `data:` redirect. CSP, CORS, and opaque responses break it. `overrideBody` keeps the URL and replaces the bytes
- CDP `Fetch.fulfillRequest` body is base64. `continueResponse` with only `requestId` leaves a non-document response alone. HTML documents are the exception: `Fetch.getResponseBody` then fulfill, so a matching `integrity` hash can be rewritten. Do not call `Fetch.getResponseBody` for the script or stylesheet being replaced
- Drop `content-encoding`, `content-length`, and `transfer-encoding` on the replacement or Chrome tries to gunzip the new bytes
- A regex or bare `*` Fetch pattern pauses every response in the tab. Specific globs stay narrow. The editor warns
- Matching script and stylesheet tags in the HTML get a SHA-384 hash of the replacement. The same list is embedded for page JavaScript that sets `integrity` later, including a tag passed to `innerHTML` or `insertAdjacentHTML`. See SRI above
- A DNR redirect for the same URL can move the request before Fetch sees the response. The tester notes the overlap; the compiler does not suppress either rule
- Mocks still win for `xmlhttprequest` (the page answers first)
- Out-of-process iframes are not auto-attached. Firefox does not filter service-worker script streams
- `applyReport` lists armed body rules by id. It never stores the body. Import notices must not echo file contents either

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
