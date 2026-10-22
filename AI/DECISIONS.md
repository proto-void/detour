# Decisions (ADRs)

**Last verified:** 2026-10-09 (ADR-028 Slice C amend; ADR-027 Databases native host)

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
| **AMO** | **Partial conflict** — “Detour” (`detour-proxy`) is a Firefox **proxy switcher** (unrelated). Also “triglavis-detour”. Resource-override niche appears free; listing short description should clarify resource overriding vs the proxy. |
| **Domains** | `detour.com`, `detour.dev`, `detour.app`, `getdetour.com` resolve (taken/parked). `usedetour.com` and `detou.dev` had no A records at check time (not a purchase confirmation). |

### Decision

Keep product name **Detour**. Use scoped npm names and a short description that clarifies resource overriding. Domain TBD — do not block development.

### Consequences

- Document store listing copy early in `distribution` spec
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

**Status:** Accepted (Amended 2026-10-08)  
**Date:** 2026-10-06 (Hamza's answers to plan 003 questions + workspace-ui slice 2)

### Decision

- Imported groups carry `importedFrom { file, sha256 }`. A new import replaces every group whose file name **or** content hash matches, at the first such group's position. Otherwise it appends. Groups the user created never carry `importedFrom`, so imports never touch them
- Editing a group by hand doesn't clear `importedFrom`: re-importing the file deliberately overwrites it, and the import summary says how many groups were replaced
- The editor works on a draft. **Autosave** (on by default, `storage.local.autosave`; missing means on) writes a validated draft about 1 s after the last edit. Invalid drafts are not written and do not force field focus. Autosave pauses while the workspace changed elsewhere. Explicit **Save now** (and Ctrl/Cmd+S) still writes immediately with the existing validation-focus behavior. Discard reverts unsaved edits; a one-level Undo on the autosave toast restores the pre-autosave workspace
- Group and rule switches in the editor are part of the draft (autosaved when valid)
- CI will run `pnpm e2e:chrome` once the `distribution` spec is Approved

### Consequences

- Two unrelated exports that share a file name (e.g. both `export.json`) replace each other. The summary makes this visible; matching by name is what makes "re-export after editing in RO" work
- With autosave off, switch flips in the editor still need Save now; the editor makes unsaved state obvious
- Amended 2026-10-06 (workspace-ui slice 4): popup group switches are the exception. They write that group's `enabled` flag immediately, the same way the global switch writes `enabled`. The editor treats the write as an external change
- Amended 2026-10-06 (Hamza): re-import keeps each group's/rule's on/off state via `importKey`. A name-only match asks (Replace / Import as new / Cancel); identical content replaces silently
- Amended 2026-10-08 (Hamza): autosave on by default after idle validation; explicit Save now remains

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
- The installed manifest name and store listing title are both `Detour`. The short description clarifies resource overriding vs the unrelated AMO proxy
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
- JavaScript that assigns `integrity` after parse is [ADR-015](#adr-015--page-javascript-integrity-uses-the-same-hash)

### Consequences

- A matching script or stylesheet runs after Allow debugger / Allow response rewriting. The browser still enforces the new hash
- A compromised CDN file that is not overridden still has the page's hash
- If the override bytes change between the HTML rewrite and the script response, the check fails closed until the next load
- Rewriting is off for non-UTF-8 documents and documents over 2 MiB. Those pages can still reject the new file
- Chrome shows the debugging infobar whenever a body rule is armed, same as before. Document responses are paused for the duration

---

## ADR-015 — Page JavaScript integrity uses the same hash

**Status:** Accepted  
**Date:** 2026-10-07 (Hamza approved page-world integrity)

### Context

ADR-014 rewrites `integrity` in the HTML because the parser copies that attribute onto the request before page JavaScript runs. Bundlers do the opposite: after parse they create a script or link and set `integrity` from JavaScript (`script.integrity` or `setAttribute`). The document rewrite never sees that assignment, so the browser checks the published hash and rejects the override.

The hash has to be the same bytes the body engine will fulfill. The page must not receive the rule body or the bridge token.

### Decision

- Register a MAIN-world content script at `document_start` only while an `overrideBody` or in-place `serveLocal` rule is armed (consent and the browser permission are already required). Unregister it when they are not
- While rewriting a UTF-8 HTML document, embed the armed hash list in `<meta name="detour-sri">`. Each entry is the match, case sensitivity, resource types, site list, and `sha384-` of the bytes that rule will serve. The same read fills the body cache. A failed read is omitted. The meta contains no rule body and no bridge token
- The hook snapshots that list once. When page JavaScript assigns `integrity` on a script or a stylesheet link, and the element's URL matches an entry, set the attribute to that hash before the fetch starts. Any other assignment is written through unchanged
- Never clear `integrity`. A missing list, a failed read, or a URL that does not match leaves the page's value
- Do not register the hook, and do not embed the list, when response rewriting is off

### Consequences

- A bundler that sets `integrity` before the element is fetched runs the override. A sibling it sets with a bad hash still fails that check
- The page can read which URL patterns are overridden and the SHA-384 of the replacement. It cannot read the source text from this list. The match log and apply report stay free of bodies
- The page can edit the meta before the snapshot. A forged entry can only substitute a SHA-384. The wrong hash blocks the script. It cannot make the browser accept a file the body engine is not already replacing, because the hook does not remove `integrity`
- Amended 2026-10-07 by [ADR-016](#adr-016--markup-insertion-uses-the-same-integrity-hash): `innerHTML` and `insertAdjacentHTML` are hooked. Documents that are not rewritten (rewriting off, non-UTF-8, over 2 MiB) do not get the list, so a markup string on those pages keeps the page's hash
- Open pages keep a hook that was installed before the rule was turned off until the next load

---

## ADR-016 — Markup insertion uses the same integrity hash

**Status:** Accepted  
**Date:** 2026-10-07 (Hamza approved markup integrity)

### Context

ADR-015 substitutes `integrity` when page JavaScript assigns the attribute. Bundlers also build a tag as a markup string and pass it to `innerHTML` or `insertAdjacentHTML`. The HTML fragment parser copies `integrity` from that string onto the element. It does not call the property setter, so the page's hash stays and the browser can reject the override. A stylesheet inserted this way is fetched and checked. A script element inserted this way is marked already started and does not run by itself.

The hash list is already in `<meta name="detour-sri">`. This slice does not add a second list or a second content script.

### Decision

- While the MAIN-world hook from ADR-015 is installed, rewrite a string assigned to `Element.innerHTML` or passed to `Element.insertAdjacentHTML` before the original method runs
- Use the same tag scan as the document rewrite. On a script or stylesheet tag whose URL matches a snapshotted entry, set `integrity` to that `sha384-`. Leave every other hash in the string as written. Do not inject the meta tag into the fragment
- Pass a non-string value through unchanged. TrustedHTML is not turned into a string, so this hook does not bypass Trusted Types
- A string with no `integrity`, an empty list, a missing meta, or a string longer than 2 MiB is left unchanged
- Do not hook `outerHTML`, `setAttributeNS`, `ShadowRoot.innerHTML`, `Range.createContextualFragment`, or `setHTMLUnsafe` in this slice. Amended 2026-10-07 by [ADR-017](#adr-017--script-running-markup-uses-the-same-integrity-hash): `createContextualFragment` and `setHTMLUnsafe` with `runScripts: true` are hooked

### Consequences

- A matching tag in that markup carries Detour's hash after the browser parses it. A sibling tag in the same string keeps the page's hash
- The fragment parser still does not execute those scripts. A page that copies the parsed attributes onto a new script element, without going through the integrity setter, runs the override only when this rewrite happened
- Amended 2026-10-07 by [ADR-017](#adr-017--script-running-markup-uses-the-same-integrity-hash): `createContextualFragment` and `setHTMLUnsafe({ runScripts: true })` rewrite the string before those scripts run
- The substituted value is a publishable SHA-384. It cannot break out of the attribute, and it cannot remove a hash the page set

---

## ADR-017 — Script-running markup uses the same integrity hash

**Status:** Accepted  
**Date:** 2026-10-07 (Hamza approved script-running markup)

### Context

ADR-016 rewrites `integrity` in a string passed to `innerHTML` or `insertAdjacentHTML`. The HTML fragment parser marks those scripts already started, so they do not run from that insertion. Two other calls parse a string and can execute the script while still copying `integrity` from that string:

- `Range.createContextualFragment` invokes the fragment parsing algorithm with scripting mode Fragment. Inserting the fragment runs the scripts. [HTML: createContextualFragment](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-range-createcontextualfragment)
- `Element.setHTMLUnsafe` and `ShadowRoot.setHTMLUnsafe` run scripts only when `SetHTMLUnsafeOptions.runScripts` is true. The default is false, which stays inert, the same as `innerHTML`. [setHTMLUnsafe](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-element-sethtmlunsafe)

The hash list is already in `<meta name="detour-sri">`. This slice does not add a second list or a second content script.

### Decision

- While the MAIN-world hook from ADR-015 is installed, rewrite a string passed to `Range.createContextualFragment` before the original method runs
- Rewrite a string passed to `Element.setHTMLUnsafe` or `ShadowRoot.setHTMLUnsafe` only when the options object's `runScripts` member is strictly `true`. Omitted options, `false`, or any other value are passed through unchanged. Amended 2026-10-07 by [ADR-019](#adr-019--sethtmlunsafe-rewrites-integrity-even-when-scripts-are-off): every options value rewrites the string
- Use the same tag scan as ADR-016. On a script or stylesheet tag whose URL matches a snapshotted entry, set `integrity` to that `sha384-`. Leave every other hash in the string as written. Do not inject the meta tag into the fragment
- Pass a non-string value through unchanged, including when `runScripts` is true. TrustedHTML is not turned into a string, so this hook does not bypass Trusted Types. The native method still applies the page's Trusted Types policy to a string
- A string with no `integrity`, an empty list, a missing meta, or a string longer than 2 MiB is left unchanged
- Do not hook `outerHTML`, `setAttributeNS`, `ShadowRoot.innerHTML`, `Document.parseHTMLUnsafe`, or the safe `setHTML` methods in this slice. `parseHTMLUnsafe` creates a document with scripting disabled. Amended 2026-10-07 by [ADR-018](#adr-018--inert-markup-uses-the-same-integrity-hash): `outerHTML`, `ShadowRoot.innerHTML`, and `setAttributeNS` for `integrity` are hooked

### Consequences

- A matching script inserted through `createContextualFragment`, or through `setHTMLUnsafe` with `runScripts: true`, carries Detour's hash and can run. A sibling tag in the same string keeps the page's hash
- `setHTMLUnsafe` with scripts off does not execute scripts. This slice left that string's hashes alone, so a stylesheet in that inert call could still be checked against the page's hash. Amended 2026-10-07 by [ADR-019](#adr-019--sethtmlunsafe-rewrites-integrity-even-when-scripts-are-off)
- The substituted value is a publishable SHA-384. It cannot break out of the attribute, and it cannot remove a hash the page set
- Amended 2026-10-07 by [ADR-018](#adr-018--inert-markup-uses-the-same-integrity-hash): `outerHTML` and `ShadowRoot.innerHTML` rewrite the string before the fragment parser runs. They still do not execute scripts

---

## ADR-018 — Inert markup uses the same integrity hash

**Status:** Accepted  
**Date:** 2026-10-07 (Hamza approved inert markup)

### Context

ADR-016 rewrites `integrity` in a string passed to `innerHTML` or `insertAdjacentHTML`. ADR-017 covers markup that can execute scripts. Three other calls still leave the page's hash in place:

- `Element.outerHTML` parses a string with the HTML fragment parsing algorithm and replaces the element. Scripts in that fragment do not run. A stylesheet is fetched and checked. [outerHTML](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-element-outerhtml)
- `ShadowRoot.innerHTML` is a separate setter from `Element.innerHTML`. It parses the same way. A stylesheet in the shadow tree is fetched and checked. [ShadowRoot innerHTML](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-shadowroot-innerhtml)
- `Element.setAttributeNS` does not call `setAttribute`. Page code that copies attributes the parser wrote uses `setAttributeNS(namespaceURI, name, value)`. For an HTML `integrity` attribute, `namespaceURI` is null. The property hook never sees that call, so the page's hash is what the browser checks. [setAttributeNS](https://dom.spec.whatwg.org/#dom-element-setattributens)

The hash list is already in `<meta name="detour-sri">`. This slice does not add a second list or a second content script.

### Decision

- While the MAIN-world hook from ADR-015 is installed, rewrite a string assigned to `Element.outerHTML` or `ShadowRoot.innerHTML` before the original setter runs
- Use the same tag scan as ADR-016. On a script or stylesheet tag whose URL matches a snapshotted entry, set `integrity` to that `sha384-`. Leave every other hash in the string as written. Do not inject the meta tag into the fragment
- Pass a non-string value through unchanged. TrustedHTML is not turned into a string, so this hook does not bypass Trusted Types
- A string with no `integrity`, an empty list, a missing meta, or a string longer than 2 MiB is left unchanged
- When `Element.setAttributeNS` sets `integrity` on a script or stylesheet link, substitute the same hash the `setAttribute` hook would write, then do not call the original method with the page's value. This applies when the namespace is null, omitted, empty, or `http://www.w3.org/1999/xhtml`, and when the qualified name is `integrity` or a prefixed name whose local part is `integrity`
- Setting `src` or `href` through `setAttributeNS` in that same namespace re-resolves a hash the page already assigned, then the original method sets the URL. A copy can set the hash before the URL
- An attribute in any other namespace is passed to the original method unchanged, including one whose local name is `integrity`. The hook does not clear `integrity`
- Do not hook `Document.parseHTMLUnsafe` or the safe `setHTML` methods. Amended 2026-10-07 by [ADR-019](#adr-019--sethtmlunsafe-rewrites-integrity-even-when-scripts-are-off): `setHTMLUnsafe` rewrites the string when `runScripts` is not strictly `true`

### Consequences

- A matching tag in `outerHTML` or a shadow root's `innerHTML` carries Detour's hash after the browser parses it. A sibling tag in the same string keeps the page's hash. Those scripts still do not run from the insertion alone. A stylesheet is fetched and checked
- A script or stylesheet link whose `integrity` was copied with `setAttributeNS` carries Detour's hash when its URL matches. A copy that does not match keeps the page's hash
- The substituted value is a publishable SHA-384. It cannot break out of the attribute, and it cannot remove a hash the page set
- A namespaced attribute that is not HTML `integrity` is not rewritten, so this hook cannot alter SVG or XML attributes that share the local name

---

## ADR-019 — setHTMLUnsafe rewrites integrity even when scripts are off

**Status:** Accepted  
**Date:** 2026-10-07 (Hamza approved setHTMLUnsafe with scripts off)

### Context

ADR-017 rewrites `integrity` in a string passed to `Element.setHTMLUnsafe` or `ShadowRoot.setHTMLUnsafe` only when `runScripts` is strictly `true`. The HTML default is false. That call does not execute scripts, but a stylesheet in the string is still fetched and checked against the page's hash. The browser can reject the override. [setHTMLUnsafe](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-element-sethtmlunsafe)

The hash list is already in `<meta name="detour-sri">`. This slice does not add a second list or a second content script.

### Decision

- While the MAIN-world hook from ADR-015 is installed, rewrite a string passed to `Element.setHTMLUnsafe` or `ShadowRoot.setHTMLUnsafe` before the original method runs, for every options value: omitted, `false`, `true`, or any other value
- Pass the options object through unchanged. This slice does not set `runScripts` and does not turn scripts on. Scripts still run only when that member is strictly `true`
- Use the same tag scan as ADR-016. On a script or stylesheet tag whose URL matches a snapshotted entry, set `integrity` to that `sha384-`. Leave every other hash in the string as written. Do not inject the meta tag into the fragment
- Pass a non-string value through unchanged. TrustedHTML is not turned into a string, so this hook does not bypass Trusted Types. The native method still applies the page's Trusted Types policy to a string
- A string with no `integrity`, an empty list, a missing meta, or a string longer than 2 MiB is left unchanged
- Do not hook `Document.parseHTMLUnsafe` or the safe `setHTML` methods. Amended 2026-10-07 by [ADR-020](#adr-020--parsehtmlunsafe-uses-the-same-integrity-hash): `parseHTMLUnsafe` rewrites the string. Safe `setHTML` stays unhooked

### Consequences

- A stylesheet inserted through `setHTMLUnsafe` with scripts off carries Detour's hash and can be accepted. A sibling tag in the same string keeps the page's hash
- A matching script in that string also carries Detour's hash. It still does not run unless `runScripts` is strictly `true`
- The substituted value is a publishable SHA-384. It cannot break out of the attribute, and it cannot remove a hash the page set

---

## ADR-020 — parseHTMLUnsafe uses the same integrity hash

**Status:** Accepted  
**Date:** 2026-10-07 (Hamza approved `Document.parseHTMLUnsafe`)

### Context

ADR-019 rewrites `integrity` in markup the page inserts into a live tree. `Document.parseHTMLUnsafe` does not insert. It parses a string into a new document that has no browsing context, so scripting is disabled. The HTML parser still copies `integrity` from that string onto the elements. A page that later moves those nodes into a live document (`adoptNode`, or an insertion that adopts) keeps the page's hash, and a stylesheet is fetched and checked. A script parsed this way still does not run from the parse. [parseHTMLUnsafe](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-document-parsehtmlunsafe)

`DOMParser.parseFromString` with type `text/html` is the historical form of that same parse. The spec says the new document has no browsing context, so scripting is disabled, and names `Document.parseHTMLUnsafe` as the modern alternative. Leaving that type unhooked would keep the same adoption gap. The XML types use a different parser. [DOMParser](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#domparser)

The hash list is already in `<meta name="detour-sri">`. This slice does not add a second list or a second content script.

### Decision

- While the MAIN-world hook from ADR-015 is installed, rewrite a string passed to `Document.parseHTMLUnsafe` before the original method runs
- Pass the options object through unchanged. This slice does not set a sanitizer and does not turn scripting on. The document that call creates still has scripting disabled
- Use the same tag scan as ADR-016. On a script or stylesheet tag whose URL matches a snapshotted entry, set `integrity` to that `sha384-`. Leave every other hash in the string as written. Do not inject the meta tag into the parsed document
- Pass a non-string value through unchanged. TrustedHTML is not turned into a string, so this hook does not bypass Trusted Types. The native method still applies the page's Trusted Types policy to a string
- A string with no `integrity`, an empty list, a missing meta, or a string longer than 2 MiB is left unchanged
- Rewrite a string passed to `DOMParser.parseFromString` only when the type is exactly `text/html`. Any other type, including `text/xml`, `application/xml`, `application/xhtml+xml`, and `image/svg+xml`, is passed through unchanged
- Do not hook the safe `setHTML` methods or `Document.parseHTML`. Those calls sanitize
- Nodes moved from the parsed document into a live document carry the `integrity` the parser copied from the rewritten string. The hook does not clear that attribute

### Consequences

- A stylesheet parsed by `Document.parseHTMLUnsafe`, or by `DOMParser.parseFromString` with `text/html`, carries Detour's hash after it is moved into a live document, and the browser can accept it. A sibling tag in the same string keeps the page's hash
- A script in that document still does not run from the parse. Scripting stays disabled
- An XML parse from `DOMParser` keeps the page's hashes
- The substituted value is a publishable SHA-384. It cannot break out of the attribute, and it cannot remove a hash the page set

---

## ADR-021 — setAttributeNode uses the same integrity hash

**Status:** Accepted  
**Date:** 2026-10-07 (Hamza approved `setAttributeNode` / `setAttributeNodeNS`)

### Context

ADR-018 hooks `Element.setAttributeNS` because copying a parser-written attribute does not go through `setAttribute`. `Element.setAttributeNode` and `Element.setAttributeNodeNS` are a third path. The DOM spec implements both as "set an attribute" given an `Attr` and the element. They do not call `setAttribute` or `setAttributeNS`. A page that creates an `integrity` Attr, sets the page's hash on it, and moves it onto a script with `setAttributeNode` keeps that hash. The browser then checks the production bytes against it and blocks the override. [setAttributeNode](https://dom.spec.whatwg.org/#dom-element-setattributenode), [setAttributeNodeNS](https://dom.spec.whatwg.org/#dom-element-setattributenodens)

`document.createAttribute('integrity')` yields `namespaceURI === null`. That is the same HTML attribute `setAttributeNS` already treats as in scope, along with the empty namespace and `http://www.w3.org/1999/xhtml`. The local name is `integrity`. A prefixed qualified name still has that local name.

The hash list is already in `<meta name="detour-sri">`. This slice does not add a second list or a second content script.

### Decision

- While the MAIN-world hook from ADR-015 is installed, wrap `Element.setAttributeNode` and `Element.setAttributeNodeNS`
- When the argument is an Attr whose namespace is null, empty, or the HTML namespace, and whose local name is `integrity`, on a script or stylesheet link whose URL matches a snapshotted entry, set that Attr's value to the entry's `sha384-` before the original method runs
- Leave the Attr's value unchanged when the URL does not match, the namespace is any other value, or the local name is not `integrity`. Do not clear `integrity`
- When the Attr's local name is `src` or `href` under those same namespace rules, re-resolve a hash already assigned, including when the integrity Attr was set first. Then call the original method
- Pass a value that is not an Attr through to the original method
- Write a new value onto the Attr only when it is a publishable SHA-384. The page's string is never replaced with an empty string
- Amended 2026-10-07 by [ADR-022](#adr-022--setnameditem-and-attrvalue-use-the-same-integrity-hash): `NamedNodeMap.setNamedItem`, `setNamedItemNS`, and a later write to `Attr.value`, `nodeValue`, or `textContent` are hooked

### Consequences

- A script or stylesheet whose `integrity` Attr is moved with `setAttributeNode` or `setAttributeNodeNS` carries Detour's hash, and the browser can accept the override. A sibling whose URL does not match keeps the page's hash
- An Attr in another namespace keeps the value the page set
- The substituted value is a publishable SHA-384. It cannot remove a hash the page set on a resource that does not match

---

## ADR-022 — setNamedItem and Attr.value use the same integrity hash

**Status:** Accepted  
**Date:** 2026-10-07 (Hamza approved `NamedNodeMap.setNamedItem` / `setNamedItemNS` and `Attr.value`)

### Context

ADR-021 hooks `Element.setAttributeNode` and `setAttributeNodeNS`. Two more DOM entry points write the same attribute without calling those methods.

`NamedNodeMap.setNamedItem` and `setNamedItemNS` both return the result of setting an attribute given the Attr and the map's element. They do not call `setAttributeNode`. A page reaches that map through `Element.attributes`. [setNamedItem](https://dom.spec.whatwg.org/#dom-namednodemap-setnameditem)

`Attr.value`, `nodeValue`, and `textContent` each set an existing attribute value. They do not call one another or `setAttribute`. If the Attr's element is null, the string is only stored on the node. If the Attr is already on the element, the attribute changes in place, so a later assignment puts the page's hash back after an adopt hook had substituted Detour's. [Attr.value](https://dom.spec.whatwg.org/#dom-attr-value), [set an existing attribute value](https://dom.spec.whatwg.org/#set-an-existing-attribute-value)

The hash list is already in `<meta name="detour-sri">`. This slice does not add a second list or a second content script.

### Decision

- While the MAIN-world hook from ADR-015 is installed, wrap `NamedNodeMap.setNamedItem` and `NamedNodeMap.setNamedItemNS`
- Remember the element when page code reads `Element.attributes`. Use that element for the same substitution ADR-021 applies to `setAttributeNode`: HTML `integrity` (namespace null, empty, or `http://www.w3.org/1999/xhtml`) on a matching script or stylesheet becomes the entry's `sha384-` before the original method adopts the Attr
- A map that was not read through that getter is passed to the original method unchanged. Do not guess an owner from a property on the map
- Leave the Attr unchanged when the URL does not match, the namespace is any other value, or the local name is not `integrity`. Do not clear `integrity`
- When the Attr's local name is `src` or `href` under those same namespace rules, re-resolve a hash already assigned, then call the original method
- Wrap `Attr.value` on `Attr.prototype`. Chrome 155 does not put `nodeValue` or `textContent` on `Attr.prototype`; those setters live on `Node.prototype`. Hook the Node setters only when the receiver is an Attr (`instanceof Attr`, or node type 2). An element's `textContent` is passed through
- When `ownerElement` is a script or stylesheet link and the Attr is HTML `integrity` whose URL matches, write the publishable SHA-384 instead of the page's string. Remember the page's string so a later `src` or `href` change can re-resolve
- When `ownerElement` is null, pass the write through. The adopt hooks see that stored value later
- A non-matching URL, a foreign namespace, and any other local name are passed through. Assigning an attached `src` or `href` Attr re-resolves a hash already assigned
- Write a new value only when it is a publishable SHA-384. The page's string is never replaced with an empty string
- Do not hook `document.write`, `document.writeln`, or `iframe` `srcdoc`. Amended 2026-10-07 by [ADR-023](#adr-023--documentwrite-uses-the-same-integrity-hash): `document.write` and `document.writeln` are hooked. Amended the same day by [ADR-024](#adr-024--iframesrcdoc-uses-the-same-integrity-hash): `iframe` `srcdoc` is hooked

### Consequences

- A script or stylesheet whose `integrity` Attr is adopted with `setNamedItem` or `setNamedItemNS` carries Detour's hash. A later write to that Attr's `value`, `nodeValue`, or `textContent` keeps Detour's hash when the URL still matches. A sibling whose URL does not match keeps the page's hash
- An Attr that is not on an element yet keeps the page's string until an adopt hook runs
- An Attr in another namespace keeps the value the page set
- The substituted value is a publishable SHA-384. It cannot remove a hash the page set on a resource that does not match

---

## ADR-023 — document.write uses the same integrity hash

**Status:** Accepted
**Date:** 2026-10-07 (Hamza approved `document.write` / `document.writeln`)

### Context

ADR-016 through ADR-022 rewrite `integrity` when page JavaScript inserts markup or writes an attribute. `document.write` and `document.writeln` are another path. The HTML parser inserts the concatenated string into the input stream. During parsing, a script in that string runs, and the parser copies `integrity` from the string onto the element. Those methods do not go through `innerHTML` or `createContextualFragment`. [document write steps](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#document-write-steps)

The spec builds one string: each argument that is TrustedHTML contributes its data, and every other argument is converted to a string. `writeln` then appends U+000A. A tag split across string arguments is not a complete tag in any one argument, so rewriting each argument alone would leave the page's hash.

The hash list is already in `<meta name="detour-sri">`. This slice does not add a second list or a second content script.

### Decision

- While the MAIN-world hook from ADR-015 is installed, wrap `Document.prototype.write` and `Document.prototype.writeln`
- When every argument is a string, concatenate them with no separator, rewrite that string with the same tag scan as ADR-016, and call the original method with the one rewritten string. `writeln` still appends its line feed
- On a script or stylesheet tag whose URL matches a snapshotted entry, set `integrity` to that `sha384-`. Leave every other hash in the string as written. Do not inject the meta tag into the written markup
- When any argument is not a string, pass the original arguments through unchanged. Do not stringify TrustedHTML
- A string with no `integrity`, an empty list, a missing meta, or a string longer than 2 MiB is left unchanged. The hook does not clear `integrity`
- Do not hook `iframe` `srcdoc`. Amended 2026-10-07 by [ADR-024](#adr-024--iframesrcdoc-uses-the-same-integrity-hash): `iframe` `srcdoc` is hooked. Do not change the implicit `document.open` that `document.write` performs after the document has finished loading

### Consequences

- A script inserted with `document.write` or `document.writeln` during parsing carries Detour's hash when its URL matches, and the browser can run the override. A sibling in that same string whose URL does not match keeps the page's hash and stays blocked
- A call that mixes a string with TrustedHTML or any other non-string keeps every argument as the page passed it
- The substituted value is a publishable SHA-384. It cannot remove a hash the page set on a resource that does not match
- After the document has finished loading, `document.write` can still replace the document. This slice only rewrites the string that reaches the parser

---

## ADR-024 — iframe srcdoc uses the same integrity hash

**Status:** Accepted  
**Date:** 2026-10-07 (Hamza approved `iframe` `srcdoc`)

### Context

ADR-016 through ADR-023 rewrite `integrity` when page JavaScript inserts markup or writes an attribute on the same document. An iframe `srcdoc` string is parsed as a separate document. Those hooks never see it. The frame's HTML parser copies `integrity` onto the request when it prepares a script, before a content script in that frame can change the attribute. [srcdoc](https://html.spec.whatwg.org/multipage/iframe-embed-object.html#attr-iframe-srcdoc)

`HTMLIFrameElement.srcdoc` reflects the content attribute. `setAttribute` and `setAttributeNS` can set that attribute without going through the other markup hooks. A relative URL in the srcdoc document resolves against the document that set `srcdoc`.

The hash list is already in the parent's `<meta name="detour-sri">`. This slice does not add a second list, a second content script, or a meta tag inside the srcdoc string.

### Decision

- While the MAIN-world hook from ADR-015 is installed, wrap `HTMLIFrameElement.srcdoc`
- When the assigned value is a string, rewrite it with the same tag scan as ADR-016, then call the original setter. On a script or stylesheet tag whose URL matches a snapshotted entry, set `integrity` to that `sha384-`. Leave every other hash in the string as written
- Wrap `Element.setAttribute` and `Element.setAttributeNS` when the receiver is an iframe and the attribute is HTML `srcdoc` (namespace null, empty, or `http://www.w3.org/1999/xhtml`, including a prefixed name). Rewrite a string the same way. `srcdoc` on any other element, and `srcdoc` in any other namespace, is passed through
- When the value is not a string, pass it through unchanged. Do not stringify TrustedHTML
- A string with no `integrity`, an empty list, a missing meta, or a string longer than 2 MiB is left unchanged. The hook does not clear `integrity`
- Do not change `sandbox`. Do not inject the hash-list meta into the srcdoc string

### Consequences

- A script in an iframe `srcdoc` string carries Detour's hash when its URL matches, and the browser can run the override inside that frame. A sibling in that same string whose URL does not match keeps the page's hash and stays blocked
- A `sandbox` without `allow-scripts` still blocks scripts in the frame. Without `allow-same-origin` the frame's origin is opaque. The rewrite still happens in the parent, before the child parses the string
- A value that is not a string keeps the value the page passed
- The substituted value is a publishable SHA-384. It cannot remove a hash the page set on a resource that does not match

---

## ADR-025 — overrideBody delivery: DNR data: redirect by default, in-place opt-in

**Status:** Accepted  
**Date:** 2026-10-08 (Hamza approved body redirect delivery)

### Context

Resource Override 2.0 (mv3) compiles `fileOverride` to a DNR redirect to a `data:` URL. That path does not use the debugger, so it works with DevTools open. Detour's ADR-009 `overrideBody` uses CDP Fetch via `chrome.debugger` (and Firefox `filterResponseData`). Only one debugger client can own a tab, so DevTools and Detour fight. Consent is also required before anything runs.

ADR-009 correctly avoided `data:` as the only strategy (CSP `connect-src` / `script-src`, CORS, SRI). Same-origin JSON and other assets without SRI are the case `data:` handles well. Offering both modes matches RO when users need DevTools, and keeps the URL-preserving path for CSP/SRI pages.

### Decision

- `overrideBody` gains `delivery`: `redirect` (default) or `inPlace`
- **`redirect`:** engine-core emits a DNR redirect to `data:<mime>;charset=UTF-8;base64,…` (UTF-8 body). MIME is `contentType` when set, else inferred from the match URL's extension (`.json` → `application/json`, also `.js`, `.css`, `.html`, `.svg`), else `text/plain`. No debugger, no consent banner. Rules saved without the field load as `redirect`
- **`inPlace`:** ADR-009 engines (Chrome debugger Fetch / Firefox filterResponseData). Consent, SRI hash rewrite, and DevTools conflict stay as today
- RO `fileOverride` imports with `delivery: 'redirect'`
- `workspaceHasBodyRules` and `planBody` count only `inPlace` (plus in-place `serveLocal` as before)
- Redirect delivery does not rewrite document `integrity` hashes

### Consequences

- Default body rules work with DevTools open and match RO 2.0 URL→File for JSON and similar assets
- Pages whose CSP blocks `data:`, or that use SRI, need **Replace in place**
- Network shows a `data:` response for redirect delivery
- Existing workspaces without `delivery` behave like RO (redirect), not like the former debugger-only default

---

## ADR-026 — Build-time brand flavors; private brands stay out of git

**Status:** Accepted  
**Date:** 2026-10-09 (Hamza: Rogers white-label + dual-zip DoD)

### Context

Internal partners (e.g. Rogers) need a separately themed extension zip. The public MIT repository must remain Detour-branded and must never ship partner marks. Long partner product titles (e.g. “Rogers Dev Override”) are too long for the toolbar and lockup.

### Decision

- Brands live under `extension/brands/<slug>/` (`brand.ts`, `tokens.css`, `icon.svg`, optional `logo.svg` / `mark.svg` / `partner-logo.svg` / `fonts/`)
- `DETOUR_BRAND` (default `detour`) selects the flavor in `wxt.config.ts`; missing brands fail the build clearly
- Manifest name / short_name / description / action title, zip slug, outDir (`.output/<slug>`), icons (`@wxt-dev/auto-icons`), and CSS tokens (`virtual:brand-tokens`) come from the brand
- **Display name is always Detour** for partner flavors (Rogers included). Partner identity is theme, tokens, icons, and optional partner logo — not a different product title. `DETOUR_BRAND_NAME` can still override when needed
- Zip/outDir slug stays distinct (Rogers: `rogers`) so artifacts do not collide with Detour
- Co-brand lockup: `Detour | [partner]` when `partner-logo.svg` is present
- `import.meta.env.BRAND` exposes `{ name, shortName, slug, defaultTheme }` to the UI; user-facing copy uses `brandName`
- **Committed:** `brands/detour/`, `brands/_template/`
- **Gitignored:** `brands/rogers/` and any other private partner trees
- Scripts: `zip` / `build` = Detour; `zip:rogers` / `build:rogers` = `DETOUR_BRAND=rogers`
- **Delivery DoD:** produce both Detour and Rogers zips unless Hamza requests a single flavor
- No change to rules, engine, or storage keys across flavors

### Consequences

- Public clones build Detour only; Rogers requires a local `brands/rogers/` tree
- Storage and exports stay Detour-schema compatible across flavors
- Official partner logos are optional drop-ins; agents must not recreate trademarked marks

---

## ADR-027 — Databases helper: native messaging (not loopback HTTP)

**Status:** Accepted (architecture decision for Draft [db-client](specs/db-client.md); implementation waits for spec Approval)  
**Date:** 2026-10-09

### Context

Browsers cannot open raw TCP sockets to database protocols (CQL 9042, Postgres 5432, TDS 1433, and the rest). A local helper running open-source Node drivers is the only no-server option. Hamza requires the helper to be **self-managing**: the extension starts it when needed and kills it when idle or when the tab closes, with no day-to-day terminal command.

The existing Local Bridge ([local-bridge](specs/local-bridge.md), ADR-012) is a **loopback HTTP** file server. The page (or the extension) can see a token on redirected requests; the process stays up until the user stops it. That model fits serving files. It is a poor fit for a database client: an open port and a token are attack surface, and the browser does not own the process lifecycle.

### Decision

- The Databases tab talks to a native host named `com.detour.db` via **`browser.runtime.connectNative`**
- The browser spawns the host and kills it when the native messaging port closes (tab close, **Stop helper**, or idle timeout). The host exits when stdin ends and closes every database connection and tunnel
- Protocol is **JSON-RPC** over native messaging, with host→browser messages chunked under the **1 MB** native-messaging cap (~900 KB payloads) and explicit paging / cancel
- Secrets (passwords, tokens, private keys, Astra bundles) live **only** in the host’s OS keychain (`@napi-rs/keyring`). Extension `storage.local` keeps connection metadata only
- `nativeMessaging` is an **optional** permission, requested on first use of the Databases tab
- Ship the host as Node **SEA** binaries (macOS arm64/x64, Windows x64, Linux x64) plus `npx @detour/cli db install` for users who already have Node. Browser stores cannot register native hosts; one-time install is unavoidable
- Prefer pure-JS drivers and `node:sqlite` (Node 22+) so SEA stays viable; spike the SEA bundle before Slice A ends
- **Local Bridge stays loopback HTTP.** This ADR does not change it. Slice D may optionally let the native host start/stop the file bridge later; that is optional and separate

### Alternatives considered

| Option | Why not |
|--------|---------|
| Loopback HTTP helper (like Local Bridge) | Open port + token; browser does not kill the process on tab close; pages can observe redirected traffic patterns |
| WebSocket to a long-running daemon | Same lifecycle and port problems; more moving parts |
| Detour-hosted proxy | Violates hard nos (backend, accounts, ops cost) |
| In-extension WASM drivers | No raw TCP from the extension page for these protocols; incomplete coverage |

### Consequences

- One-time host registration per OS/browser (Chrome/Edge/Brave/Chromium manifests; Firefox; Windows registry)
- Safari is out of Databases v1 (no compatible native messaging)
- Databases UI must show helper status (Ready / Stopped / missing) and a guided setup card when `connectNative` fails
- Docs and gotchas must cover the 1 MB message cap, SEA + native addons, and cloud Cassandra TLS quirks (Keyspaces CA, Cosmos port 10350)
- Implementation of host, adapters, and UI requires **Approved** [db-client](specs/db-client.md) and plan `026` — not this ADR alone

---

## ADR-028 — API Tester: extension-page fetch, simulated rules, separate storage

**Status:** Accepted  
**Date:** 2026-10-09 (Hamza Approved api-client Slice A)

### Context

Detour’s options **Tester** only resolved which rule wins. Developers also need a Postman-class client (send real HTTP including localhost, collections, cURL/Postman, environments, scripts) with **no Detour backend**.

### Decision

- Product surface renamed **API Tester**; internal `#tester` hash stays
- Pure logic under `extension/src/api-client/`; UI in options (`ApiTester.svelte`)
- Storage keys `apiCollections`, `apiEnvironments`, `apiHistory`, `apiSettings` — never reuse rules `workspace`
- Send via extension-page `fetch` (`host_permissions: <all_urls>` already granted)
- **Apply Detour rules** is **dual-scope** (Hamza mid-flight, 2026-10-09):
  - **Global** default in `apiSettings.applyDetourRules` (boolean, **on by default**) — API Tester–wide, not mixed into rules `workspace`
  - **Per-request** `applyDetourRules`: `inherit` | `on` | `off` (default `inherit`) on each saved request and open tab
  - Resolve with `resolveApplyDetourRules`: explicit per-request wins; else global
  - When effective on: `resolveProbe` (`resourceType: xmlhttprequest`) as a **simulation** (redirect/block/headers/mock); UI label “Detour rules applied (simulated)”
- Forbidden fetch headers (`Cookie`, `Origin`, `Referer`, `User-Agent`, `Host`) via short-lived DNR **session** rules (`urlFilter`), always cleaned up
- Scripts: sandboxed page (`api-script-sandbox.html`) + `postMessage` + chai-compatible `expect`
- UI copy never calls collections “workspace”

### Slice B amend (Hamza “Continue B”, 2026-10-09)

- Shared send path `executeApiRequest` for UI, runner, load test, and scheduled alarms (dual-scope Apply Detour)
- Storage: `apiRuns` (cap 50) + schedules in `apiSettings`; `alarms` permission; `notifications` optional on first notify-on-fail
- Background `alarms.onAlarm` runs collections with **scripts skipped** (SW has no sandbox iframe); options Runner runs scripts + `setNextRequest`
- Detour synergy: save-as-mock / redirect-to-localhost insert rules and switch to Rules tab
- Codegen, response diff, OpenAPI/HAR import, docs Markdown/HTML — pure modules under `api-client/`

### Slice C amend (Hamza “Continue C”, 2026-10-09)

- OAuth 2.0: auth-code + PKCE via optional `identity` + `chrome.identity.launchWebAuthFlow` (Chrome); Firefox opens authorize URL + manual code exchange; client-credentials / password + refresh in `prepareHttpAsync`
- AWS SigV4 (Web Crypto) and Digest (401 challenge-response) in send path
- Optional `cookies` permission for cookie jar (first use); never label UI “workspace”
- GraphQL body mode + introspection docs; WebSocket / SSE clients; `pm.visualizer.set` → sandboxed Visualize tab
- Folder sync: File System Access (pretty JSON, secrets excluded); Firefox → Export / Import
- Capture: DevTools + match log **Send to API Tester** → `session` `apiCapturePending` → new API Tester tab

### Consequences

- Slices A+B+C ship (plan 025 Done)
- Rule-match panel in the response pane is **Which rules apply**
- Reload Rogers (and Detour) after installing the new zip

---

## ADR-029 — OS packs: self-install SEA helper, unsigned $0, stable extension id

**Status:** Accepted  
**Date:** 2026-10-09 (Hamza Approved plan “Go, approved”)

### Context

Databases needs a native messaging host (ADR-027). Store zips cannot register that host. Shipping only a Node/`pnpm` install path forces every user to install a toolchain. We want one download per OS that includes the extension and a self-contained helper, still at **$0** recurring and without a Detour backend.

Browsers never allow an extension to register its own native host, so one local install step remains.

### Decision

- Ship **OS packs** on GitHub Releases (`windows-x64`, `macos-arm64`, `macos-x64`, `linux-x64`): unpacked Chromium extension + SEA `detour-db-host` + install/uninstall scripts + READMEs. Store zips stay **extension-only**.
- The SEA binary is truly self-contained (esbuild-bundled CJS + postject). Platform `@napi-rs/keyring` packages live beside the binary and load via `module.createRequire` from `dirname(process.execPath)/node_modules/`.
- The helper **installs itself** (`install` / `uninstall` / `doctor` / `--version`) into a stable per-user directory:
  - macOS: `~/Library/Application Support/Detour/db-host/`
  - Windows: `%LOCALAPPDATA%\Detour\db-host\`
  - Linux: `${XDG_DATA_HOME:-~/.local/share}/detour/db-host/`
  Manifest `path` points at the SEA binary (no Node launcher).
- **Stable Chromium extension id** via a fixed public manifest `key` per brand (Detour in-repo; Rogers in gitignored brand files). Installer writes `allowed_origins` for the unpacked id and known store id(s). **Public key only** — private `.pem` never in the repo.
- **Signing at $0:** no Apple notarization ($99/yr) and no Windows Authenticode while the hard no stands. After postject on macOS, ad-hoc `codesign --sign -`. Pack READMEs document Gatekeeper (right-click Open / clear quarantine) and SmartScreen (More info → Run anyway).

### Alternatives considered

| Option | Why not |
|--------|---------|
| Require Node + `detour db install` only | Too heavy for non-contributor users |
| Paid notarization / code signing | Breaks $0 recurring ops |
| Embed private key for id stability | Secret in repo — forbidden |
| Loopback HTTP DB helper | Rejected in ADR-027 |

### Consequences

- Pack size ~90–130 MB (Node runtime) — acceptable for Releases, not for stores
- First-run OS warnings are expected and documented
- CI needs a four-target SEA matrix including an Intel macOS runner label
- Developers keep the Node install path under a disclosure; pack path is the default UX
- Specs: [distribution](specs/distribution.md), [db-client](specs/db-client.md); plan [028](plans/028-os-packs.md)

---

## ADR-030 — Partner native helpers may be closed and out of tree; public helper stays MIT

**Status:** Accepted  
**Date:** 2026-10-09 (Hamza Approved closed Rogers native helper plan — “Go and approved”)

### Context

Some partners need a **compiled, obfuscated** Databases helper (no Node, no readable JS) and an obfuscated sideload extension. Shipping that source in the public MIT repo would either force open-sourcing the partner helper or pollute the free Detour tree with closed assets. The public Detour SEA/Node helper (ADR-027 / ADR-029) must remain MIT and usable without any partner repo.

### Decision

- **Public MIT repo** keeps the Node/SEA `com.detour.db` helper and only adds **generic** hooks:
  - `DETOUR_BRAND_DIR` for external brand trees
  - brand `nativeHostName` (default `com.detour.db`)
  - protocol `hello` + `capabilities[]` + protocol-version mismatch UX
  - `DETOUR_DB_HOST_CMD` for portable contract tests against any conforming binary
  - per-brand manifest `key` (already ADR-029)
- **Partner helpers** (e.g. a Go native host) and partner brand assets live in a **private repo** (submodule pin of this public tree). Nothing Rogers-specific beyond ADR-026 notes goes into the public KB or source.
- Accepted limit (record in the private partner spec): extension JS on the user’s machine can still be inspected after deobfuscation; the bar is casual/moderate reverse engineering, not impossibility.

### Alternatives considered

| Option | Why not |
|--------|---------|
| Closed helper inside public repo | Breaks MIT / free-forever posture for core |
| Force all partners onto Node SEA only | Fails partner “no readable JS / no Node” requirement |
| Fork the entire public tree privately | Duplicates maintenance; hooks + submodule are enough |

### Consequences

- Public dual-zip DoD unchanged; partner closed packs are private-repo artifacts
- Distinct `nativeHostName` lets Detour and partner helpers install side by side
- Specs: [db-client](specs/db-client.md), [distribution](specs/distribution.md); plan [029](plans/029-closed-rogers-native-helper.md)
