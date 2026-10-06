# Gotchas

**Last verified:** 2026-10-06

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

- Firefox closes the popup when a file picker opens, so the importer opens `popup.html?view=tab` in a tab there
- `applyReport` holds ids only; the popup joins them with the workspace for labels, and split page-scoped rules show once
- In an async DOM handler, `event.currentTarget` is `null` after the first `await`. Grab the element first. This bit the import picker: the reset threw, so choosing the same file again fired no `change`, and repeat imports silently did nothing
- A file input fires `change` only when its value changes, so reset `input.value = ''` after each import

## Editor

- Chrome accepts `append` on **request** headers only for a case-sensitive allowlist (accept, accept-encoding, accept-language, access-control-request-headers, cache-control, connection, content-language, cookie, forwarded, if-match, if-none-match, keep-alive, range, te, trailer, transfer-encoding, upgrade, user-agent, via, want-digest, x-forwarded-for). Any other name makes Chrome reject the rule. The editor warns but doesn't block. Firefox 157 delivered a DNR `set` of a custom request header (`x-detour`) to the server. `append` on Firefox is still unverified (DNR reference, 2026-10-06)
- A DNR `regexSubstitution` replaces only the **first match** within the URL, not the whole URL. Glob rules are anchored `^…$`, so for them it's the whole URL anyway. A regex rule with `\1` keeps the unmatched prefix and suffix; the preview copies this
- Save timing: take the timestamp **before** `storage.set`. The background can apply and write `applyReport` before the write promise resolves, and a later timestamp would leave status stuck on "Applying"
- Imported rules with a custom `resourceTypes` list show under Advanced as "Custom…". The collapsed Advanced section has a checkbox per type. An empty list is a field error. Inject and mock ignore `resourceTypes`

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
- Prefer Local Bridge `http://127.0.0.1` or extension-page / redirect-to-extension strategies over giant `data:` bodies

## CORS / preflight

- Redirecting XHR/fetch can invalidate preflight (#11), so document and test header rules carefully
- 404-fallback to prod (#10) often needs a CORS header strategy

## SRI

- Subresource Integrity blocks replaced scripts/styles (#45). This may need integrity-attribute stripping with clear user consent and a warning

## Chrome 137+ extension loading

- `--load-extension` removed from Chrome-branded builds (Chrome 137+)
- Use CDP **`Extensions.loadUnpacked`** with `--enable-unsafe-extension-debugging` for automation (RO PR #73)
- `--disable-features=DisableLoadExtensionCommandLineSwitch` stopped working after Chrome 142
- What works (verified on Chrome for Testing 154): puppeteer-core `launch({ pipe: true, enableExtensions: true })` + `browser.installExtension(dir)`, which uses that CDP path. See `extension/e2e/chrome-smoke.mjs`
- When writing test rules, a redirect target on the same path (e.g. `*/a.js` → `http://127.0.0.1:8002/a.js`) matches its own pattern and is refused as `redirect-loop`. Scope the pattern (`*:8001/a.js`)

## Permissions UX

- Deep engine requires debugger attach, which shows a scary prompt; never enable it silently
- Optional host permissions should be progressive where store policies allow

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
