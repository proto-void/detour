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
- `initiatorDomains` is the frame that made the request, not the top page, so iframes from other sites aren't covered on Firefox / older Chrome
- An unknown condition key (e.g. `topDomains` on old Chrome) rejects the **whole** batch, so Detour feature-detects with `RuleConditionKeys` (Chrome 145+) before using it
- Domain conditions match hosts only and include subdomains; ports and paths in RO tab patterns can't be enforced (import warning)

## Popup

- Firefox closes the popup when a file picker opens, so the importer opens `popup.html?view=tab` in a tab there
- `applyReport` holds ids only; the popup joins them with the workspace for labels, and split page-scoped rules show once

## Resource Override import

- v1 (master): `{ v: 1, data: [{ id: "d1", matchUrl, on, rules }] }`, file bodies inline in `rule.file`
- v2 (mv3): the original exporter wrote `{ v: 2, ruleGroups }`, while the importer read `data`. Fixed in PR #73 to `{ v: 2, data }`. Groups use `name`, but older exports wrote `matchUrl`
- A group's `matchUrl`/`name` gates rules by **tab URL**. Detour maps the host to `pageDomains`. A port/path it can't enforce gives a `page-scope-approximated` warning. A pattern with no usable host (e.g. `*` host with a path) imports the group **disabled** with a `page-scope-unsupported` reason
- RO applied rules to page loads too, so imported rules list every resource type explicitly, including `main_frame`
- RO globs pair `*` runs by length (`**` ↔ `**`); Detour treats any run as one wildcard, with a `wildcard-groups-simplified` warning
- Header strings look like `set name: value;remove name`, with URI-encoded parts and lowercased names
- The RO mv3 exporter (before PR #73) could write `{}`; Detour rejects it with an explicit message
- RO "redirect to the same URL = stop here" (an allow-like rule) has no Detour equivalent yet

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
