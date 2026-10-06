# Decisions (ADRs)

**Last verified:** 2026-10-07

## ADR-001 — Stack: WXT + TypeScript + Svelte 5 + CodeMirror 6 + valibot; Node CLI

**Status:** Accepted  
**Date:** 2026-10-06

### Context

Detour needs a cross-browser MV3 extension, a serious rule/editor UX, and a Local Bridge that serves files from disk. The project must stay free with **$0** recurring ops (no backend).

### Decision

- **Extension:** [WXT](https://wxt.dev/) + **TypeScript** + **Svelte 5**
- **Editors:** **CodeMirror 6** for rule bodies / file override editing
- **Validation:** **valibot** for rule schemas and import payloads
- **Local Bridge:** **Node.js CLI** (loopback HTTP/WebSocket) — optional companion, not required for Core DNR

### Consequences

- One TS monorepo-friendly toolchain; Svelte fits options/popup complexity
- valibot aligns with learnings from Web Defuser's schema approach
- CLI is opt-in; Core remains pure extension

---

## ADR-002 — Tiered engine architecture

**Status:** Accepted  
**Date:** 2026-10-06

### Context

MV3 removed blocking `webRequest` body mutation on Chromium. A single engine cannot cover redirects, injects, API mocks, and true body overrides on all browsers.

### Decision

Compile user **Rules** through a **RuleCompiler** into the least-privilege engine that can satisfy the action:

1. **Core DNR** — redirect / modifyHeaders / block  
2. **Inject scripting** — page JS/CSS  
3. **Mock fetch/XHR** — API mock in page world  
4. **Deep** — `chrome.debugger` on Chromium when body/CDP is required  
5. **Firefox body** — `filterResponseData` where available  
6. **Local Bridge CLI** — local folder / external editor workflows  

### Consequences

- Clear capability matrix per browser (see `intelligence/browser-matrix.md`)
- UX must surface when a rule needs Deep / Bridge (permissions, attach debugger)
- Prefer Core over Deep whenever possible

---

## ADR-003 — Product name: Detour

**Status:** Accepted (with naming caveats)  
**Date:** 2026-10-06

### Context

Need a memorable name for a free resource-override successor. Checked availability 2026-10-06.

### Name check

| Channel | Result |
|---------|--------|
| **npm** `detour` | **Taken** — legacy ISC/MIT router package `detour@1.3.4` (cainus, last publish ~2017). Unrelated to browser extensions. Prefer scoped packages e.g. `@detour/cli`, `@detour/extension` (`@detour/core` was 404). |
| **Chrome Web Store** | Search for “Detour” returns a results page; no clear established resource-override extension branded Detour from automated HTML scrape. Exact listing slug still needs manual confirm before submit. |
| **AMO** | **Partial conflict** — “Detour” (`detour-proxy`) is a Firefox **proxy switcher** (unrelated). Also “triglavis-detour”. Resource-override niche appears free; exact display name “Detour” may need disambiguation (e.g. “Detour — Resource Override”). |
| **Domains** | `detour.com`, `detour.dev`, `detour.app`, `getdetour.com` resolve (taken/parked). `usedetour.com` and `detou.dev` had no A records at check time (not a purchase confirmation). |

### Decision

Keep product name **Detour**. Use scoped npm names and a store subtitle that clarifies resource override. Domain TBD — do not block development.

### Consequences

- Document store subtitle early in `distribution` spec
- Re-check CWS/AMO at publish time

---

## ADR-004 — Extension tooling: pnpm, standalone package, MV3 everywhere

**Status:** Accepted  
**Date:** 2026-10-06

### Context

tech-baseline left "pnpm or npm" open. WXT 0.21 defaults Firefox to MV2. TypeScript 7 (native compiler) is now `latest`.

### Decision

- **pnpm** (pinned through `packageManager`, run via `corepack pnpm`), with `extension/` as a standalone package; add a root workspace when `cli/` lands
- Force `manifestVersion: 3` for every target (Firefox gets an MV3 event page)
- Pin TypeScript `~6.0`; revisit 7.x when Svelte/WXT tooling supports the native compiler

### Consequences

- No global installs needed beyond Node + corepack
- One manifest shape across browsers; Firefox MV3 still needs a gecko id before AMO submission

---

## ADR-005 — Core DNR apply model

**Status:** Accepted  
**Date:** 2026-10-06

### Context

engine-core must batch updates, keep group/rule order as priority, and never drop to zero rules at a quota (RO mv3 / PR #73).

### Decision

- Each refresh **replaces all** dynamic rules in one atomic `updateDynamicRules` call; DNR ids are positional (1..n) and recorded in `applyReport`
- Priority = `n − position` over enabled rules (unique, so tie-break order never matters)
- Quotas are enforced in priority order **before** the call; later rules are refused, earlier ones always apply
- On rejection: drop the rule named in `Rule with id N` and retry; otherwise fall back to per-rule adds
- Globs compile to `urlFilter` unless they need regex

### Consequences

- Positional ids carry no meaning across refreshes, so observability must map ids through `applyReport`
- A full replace costs one call even for a single edit; that's fine at Detour scale and keeps state simple

## ADR-006 — Page scoping and the global switch

**Status:** Accepted  
**Date:** 2026-10-06 (Hamza's answers to plan 002 questions + workspace-ui slice 1)

### Context

Resource Override gates groups by tab URL; DNR has no tab condition. The popup needs an on/off switch that doesn't lose rules.

### Decision

- Groups carry optional `pageDomains`. A scoped rule compiles to a `main_frame` rule with `requestDomains`, plus a subresource rule with `topDomains` (feature-detected via `RuleConditionKeys`), falling back to `initiatorDomains`
- RO tab patterns map to hosts. Port/path parts produce a warning. A pattern that can't be expressed imports the group disabled with a reason
- Imported RO rules list all resource types, including `main_frame`
- Global off = `storage.local.enabled === false` → apply an empty rule set; the workspace is untouched
- Keep the single-rule fallback on unexplained rejections

### Consequences

- Firefox / Chrome < 145 scope subresources by initiator, so a cross-site iframe on a scoped page isn't covered. Accepted by Hamza (2026-10-06); warned about in the editor on those browsers only
- One Detour rule can cost two DNR rules toward quotas

## ADR-007 — Import provenance and the editor save model

**Status:** Accepted  
**Date:** 2026-10-06 (Hamza's answers to plan 003 questions + workspace-ui slice 2)

### Decision

- Imported groups carry `importedFrom { file, sha256 }`. A new import replaces every group whose file name **or** content hash matches, at the first such group's position. Otherwise it appends. Groups the user created never carry `importedFrom`, so imports never touch them
- Editing a group by hand doesn't clear `importedFrom`: re-importing the file deliberately overwrites it, and the import summary says how many groups were replaced
- The editor works on a draft and writes only on an explicit **Save** (validated with the same schemas as storage). Group and rule switches are part of the draft
- CI will run `pnpm e2e:chrome` once the `distribution` spec is Approved

### Consequences

- Two unrelated exports that share a file name (e.g. both `export.json`) replace each other. The summary makes this visible; matching by name is what makes "re-export after editing in RO" work
- Switch flips in the editor need a Save; the editor makes unsaved state obvious
- Amended 2026-10-06 (workspace-ui slice 4): popup group switches are the exception. They write that group's `enabled` flag immediately, the same way the global switch writes `enabled`. The editor treats the write as an external change
- Amended 2026-10-06 (Hamza): re-import keeps each group's/rule's on/off state via `importKey`. A name-only match asks (Replace / Import as new / Cancel); identical content replaces silently

## ADR-008 — Page-world engines: userScripts for user code, packaged runtimes for the rest

**Status:** Accepted  
**Date:** 2026-10-06 (page-inject + api-mock approved)

### Context

`scripting.registerContentScripts` takes only packaged file paths, and main-world content scripts are subject to the page's CSP (Chrome content-scripts doc). Chrome says `userScripts` "is required for extensions that run scripts provided by the user that cannot be shipped as part of your extension package". It needs a user toggle (Chrome) or an optional permission (Firefox 136+).

### Decision

- **Inline JS** → `userScripts.register`. If it's unavailable, refuse the rule with an actionable reason. Never `eval`, `new Function` or inline `<script>` text as a fallback (store-policy risk, and CSP-blocked anyway)
- **JS URL** → a packaged bridge inserts `<script src>`. The page loads it, page CSP applies, and failures are reported
- **CSS** → `scripting.insertCSS` from the background on the bridge's request (not subject to page CSP); URL CSS is fetched by the background
- **Mocks** → a packaged MAIN-world runtime (`registerContentScripts`, `document_start`, `allFrames`) patches fetch/XHR synchronously and gets its config from the bridge, holding early requests until the config arrives. No toggle needed
- Registrations exist only while matching enabled rules exist; nothing is registered when Detour is off
- Permissions: `scripting` + `userScripts` (Chrome `permissions`; Firefox `optional_permissions`)

### Consequences

- Inline JS needs one-time user action (toggle or permission). The editor explains it, and the rules are refused (not silently dropped) until then
- A mock wins over DNR for the same URL, because the request never leaves the page
- The page can observe the patched fetch and the mock config

---

## ADR-009 — Body override: CDP Fetch on Chromium, filterResponseData on Firefox

**Status:** Accepted  
**Date:** 2026-10-06 (engine-deep body-override slice)

### Context

MV3 Chromium cannot rewrite response bodies with blocking `webRequest`. `data:` redirects break CSP, CORS, and opaque responses (gotchas). ADR-002 already assigned body override to `chrome.debugger` and Firefox `filterResponseData`.

### Decision

- One action, `overrideBody` (inline UTF-8 body, optional content type). The DNR compiler skips it
- **Chromium:** `debugger` is an install-time permission. Chrome 154 headless denies an optional `permissions.request` for it, and reading `chrome.debugger` before the permission exists crashes the service worker. Attach protocol `1.3` per http(s) tab only while a body rule is enabled **and** `storage.local.bodyEngineConsent` is true (the Allow debugger button). CDP `Fetch` at `Response`, `fulfillRequest` to swap the body (base64), `continueResponse` otherwise. No `Fetch.getResponseBody` (we never read the original bytes)
- **Firefox:** optional `webRequest`, `webRequestBlocking`, and `webRequestFilterResponse`. The Allow button requests them and sets the same consent key. `filterResponseData` only for a matching request; others are untouched
- Install does not attach. Cancelling Chrome’s banner sticks until the body rules change
- Resource Override `fileOverride` maps to this action. Local Bridge remains a separate, unapproved module
- Do not strip Subresource Integrity in this slice

### Consequences

- Chrome shows a debugging infobar and conflicts with DevTools on that tab
- A redirect rule for the same URL can still move the request before the body is replaced
- Out-of-process iframes and Firefox service-worker script streams are not covered yet

---

## ADR-010 — Match log is session-local; DNR attribution uses the feedback API

**Status:** Accepted  
**Date:** 2026-10-06 (observability badge + match log)

### Context

Developers need to see which rule just matched. `declarativeNetRequest` does not tell the extension the request URL in a packed build. `webRequest` would, and Chrome warns that it can read browsing history. Rule bodies must never leave the device.

### Decision

- Badge: `action.setBadgeText` per tab, count of matches since that tab's last navigation. `storage.local.showBadge` (missing means on) persists. Off, or Detour off, clears the text
- Log: `storage.session` ring of 50. Each row is rule id, group id, label (group name + match pattern), URL, source. No action bodies. Map DNR ids through `applyReport.applied`
- Chromium: permission `declarativeNetRequestFeedback` (no install warning). Unpacked builds listen to `onRuleMatchedDebug` (request URL). Packed builds poll `getMatchedRules` and store the tab URL. Do not add `webRequest` for this
- Firefox has no DNR feedback API. Log page, mock, and body matches Detour already sees. The Chrome `debugger` permission is unchanged

### Consequences

- A packed Chromium log can name the rule and the tab, not the subresource
- Firefox will not badge a pure redirect until a feedback API exists
- Inline JS matches stay off the log
- The service worker's "since navigation" clock resets when the worker restarts, so the badge can briefly count older session rows

---

## ADR-011 — CI on GitHub Actions free tier; store upload stays manual

**Status:** Accepted  
**Date:** 2026-10-07 (distribution approved for CI + packaging)

### Context

Detour needs repeatable checks and store zips with **$0** recurring ops and no paid SaaS. Chrome Web Store, Edge, and AMO can be uploaded by a CLI, but that CLI wants publisher secrets. Local Bridge is still Draft, so there is no CLI artifact. The workspace has no git remote.

### Decision

- One workflow, `.github/workflows/ci.yml`, on pull requests, `main`, and `v*` tags
- Gates: `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm build:firefox`, Chrome for Testing **stable** via `@puppeteer/browsers`, `pnpm e2e:chrome`, then `pnpm zip` and `pnpm zip:firefox`
- Node 24. pnpm 12.9.1 (the `packageManager` pin), installed in CI with `pnpm/action-setup`
- A `v*` tag publishes the three zips to a GitHub Release using the automatic `GITHUB_TOKEN`
- Store submission is documented for a person to do by hand. Do not call the store APIs until Hamza adds secrets on purpose
- Do not push from this slice. Document `git remote add` and `git push -u origin main`

### Consequences

- CI does nothing until the repo is on GitHub
- Firefox UI smoke stays manual (BiDi cannot open extension pages)
- `chrome@stable` moves. 2026-10-07 it was 155, and `CI=1` e2e was 62/62. A future stable can fail the smoke test without a product change
- The installed manifest name stays `Detour`. The store listing doc uses `Detour — Resource Override`
- Amended 2026-10-07: `@detour/cli` exists and CI runs its tests. The release job still attaches extension zips only. No npm publish

---

## ADR-012 — Local Bridge is localhost HTTP with an explicit token

**Status:** Accepted  
**Date:** 2026-10-07 (local-bridge approved)

### Context

MV3 cannot read an arbitrary folder. ADR-001 called the bridge a Node CLI over loopback HTTP or WebSocket. The Draft spec required `127.0.0.1` HTTP and left the handshake open. Inline `overrideBody` already pastes a body; it is the wrong place to keep a rebuilt `dist/`.

### Decision

- **HTTP on `127.0.0.1` only.** No `--host`, no `0.0.0.0`, no `::`. WebSocket does not serve a response body. Native messaging needs an OS host manifest.
- **Action `serveLocal { path }`** relative to the CLI folder. The compiler emits a DNR redirect to `http://127.0.0.1:<port>/d/<token>/<base64url path>` only when `storage.local.bridgeSession` exists and `GET /health` succeeds. Otherwise the rule is refused (`bridge-not-connected` or `bridge-down`) and the production URL is unchanged.
- The token is 32 random bytes, printed by the CLI, stored only after the user connects. It is in the redirect URL so a page that merely guesses the port cannot read the folder. Refusal text and the match log do not repeat it.
- The opaque path avoids a redirect loop when the pattern is `*.js` or `*/app.js`.
- Resource Override `fileOverride` stays inline `overrideBody`. Those files are bytes in the export, not disk paths.
- Package `@detour/cli` inside the pnpm workspace. Not a service.

### Consequences

- A Content-Security-Policy that blocks `http://127.0.0.1` can reject the redirected file. [ADR-013](#adr-013--servelocal-keeps-the-url-when-response-rewriting-is-allowed) later serves that file in place when the body engine is allowed.
- The page under test can see the token in DevTools when the rule redirects. Restarting the CLI rotates it.
- `localhost` → `::1` will not connect. Use `127.0.0.1`.

---

## ADR-013 — serveLocal keeps the URL when response rewriting is allowed

**Status:** Accepted  
**Date:** 2026-10-07 (Hamza approved in-place bridge read)

### Context

ADR-012 redirects a production URL to `http://127.0.0.1`. Pages with a Content-Security-Policy that does not allow that address never run the file. Inline `overrideBody` already keeps the original URL by fulfilling the response (ADR-009). The bridge file can take the same path: the extension reads loopback, then the body engine writes those bytes onto the original request.

Detour cannot know each page’s CSP when the rule is compiled. In-place works for both strict and open policies, and it keeps the token out of the page. It needs the debugger (Chrome) or `filterResponseData` (Firefox), which the user already accepts with Allow debugger / Allow response rewriting.

### Decision

- **Prefer in-place** when `bodyEngineConsent` is true, the browser permission is present, and the bridge health check succeeded. Do not also emit the DNR redirect. Chrome `Fetch.fulfillRequest` and Firefox `filterResponseData` reuse the body-override session. The fulfilled status is 200. `Content-Type` follows the file. `Cache-Control: no-store`.
- **Redirect remains the fallback** when that consent is missing, so a page that allows loopback still works without the debugger banner.
- The extension fetches only `http://127.0.0.1` with the stored token. Path checks stay in the CLI. The token is not written to the apply report, refusal text, or the match log. The match log records the page’s URL.
- A failed read or a file over 8 MiB leaves the production response. Cancelling Chrome’s debugging banner does the same for that tab until the body plan changes.
- Not connected and bridge-down still refuse. The production URL is unchanged.
- RO `fileOverride` stays inline `overrideBody`.

### Consequences

- Strict CSP pages work after the user allows response rewriting. Until they do, those pages can still block the redirect. The rules page says so.
- Chrome shows the debugging infobar while a `serveLocal` rule is in place, same as `overrideBody`. DevTools on that tab disconnects the override.
- Amended 2026-10-07 by [ADR-014](#adr-014--matching-subresource-integrity-hashes-follow-the-override): in-place overrides update matching `integrity` hashes. This decision itself did not.
- The page does not see the token in the in-place mode. It still can when the rule falls back to a redirect.

---

## ADR-014 — Matching Subresource Integrity hashes follow the override

**Status:** Accepted  
**Date:** 2026-10-07 (Hamza approved SRI handling)

### Context

`overrideBody` and in-place `serveLocal` replace response bytes but leave the page's `integrity` attribute alone. The HTML parser copies that attribute onto the request when it prepares a script, before any page script runs, so a MAIN-world content script cannot clear a parser-inserted hash. The browser then rejects the new bytes. SRI also checks a redirected response, so the loopback fallback fails the same way, and that fallback has no document-rewrite API without the debugger or `filterResponseData`.

### Decision

- While body rules are armed, rewrite UTF-8 HTML documents (2 MiB cap). For each `<script src>` or stylesheet `<link>` whose URL matches an armed rule, set `integrity` to `sha384-` of the bytes that rule will serve. Leave every other hash alone
- Compute the hash from the same read the body engine fulfills, so the browser's check matches the file. If the read fails, leave the published hash
- Chrome adds a Fetch pattern with `resourceType: Document` and fulfills the HTML. A bare `*` pattern already pauses documents. Firefox opens `filterResponseData` on document requests from `onBeforeRequest`
- Do not rewrite documents when response rewriting is off. The redirect keeps the page's hash. Say so on the rules page
- Do not strip hashes for the whole page. The user opted into specific overrides; other resources stay protected
- JavaScript that assigns `integrity` after parse is out of this slice

### Consequences

- A matching script or stylesheet runs after Allow debugger / Allow response rewriting. The browser still enforces the new hash
- A compromised CDN file that is not overridden still has the page's hash
- If the override bytes change between the HTML rewrite and the script response, the check fails closed until the next load
- Rewriting is off for non-UTF-8 documents and documents over 2 MiB. Those pages can still reject the new file
- Chrome shows the debugging infobar whenever a body rule is armed, same as before. Document responses are paused for the duration
