# Domain glossary

**Last verified:** 2026-10-09 (plan 029 partner hooks / ADR-030; Databases + API Tester)

| Term | Meaning |
|------|---------|
| **Rule** | User-defined match + action (redirect, headers, file override, inject, mock, …) |
| **Rule group** | Named collection of rules; order/priority matters |
| **RuleCompiler** | Transforms rules into engine-specific instructions (DNR, scripts, mocks, …) |
| **Core DNR** | `declarativeNetRequest` path — redirect / modifyHeaders / block |
| **urlFilter** | DNR string match (preferred; higher ceiling than regex) |
| **regexFilter** | DNR regex match (scarce: ~1000 dynamic regex rules on Chrome) |
| **Inject** | Page JS/CSS insertion via extension scripting APIs |
| **Mock** | Intercept fetch/XHR in page world to return synthetic responses |
| **Deep engine** | Chromium `chrome.debugger` / CDP Fetch, and Firefox `filterResponseData`, for `overrideBody` with `delivery: inPlace` and in-place `serveLocal` |
| **overrideBody** | Replace a response body. `delivery: redirect` (default) is a DNR `data:` URL (RO 2.0 parity); Network shows the original URL as 307 Internal Redirect, then a `data:` request. Match log labels those hits "Body replaced (redirect)". `delivery: inPlace` keeps the URL via the deep engine. Inline UTF-8 text, optional content type. While in-place rules are armed, matching script and stylesheet `integrity` hashes become SHA-384 of those bytes (document rewrite + page-world hooks; see architecture) |
| **SRI hash update** | Document rewrite plus a MAIN-world hook that sets `integrity` to the hash of an armed override, including inside markup strings (`setHTMLUnsafe` with scripts on or off, `Document.parseHTMLUnsafe`, `DOMParser` `text/html`), on HTML `integrity` copied with `setAttributeNS`, on an HTML `integrity` Attr moved with `setAttributeNode` or `setAttributeNodeNS`, adopted with `setNamedItem` or `setNamedItemNS`, or written with `Attr.value` once that attribute is on the element, or passed to `document.write` or `document.writeln`, or set as an iframe's `srcdoc`. Nodes adopted from `parseHTMLUnsafe` keep that hash. Other resources keep the page's hashes. Requires body-engine consent. The page-world list has no rule body |
| **Body consent** | `storage.local.bodyEngineConsent`. Set only by Allow debugger / Allow response rewriting. Absent means do not attach or filter |
| **Local Bridge** | Optional Node CLI. Serves one folder on `127.0.0.1` after the user pastes its token. Not a remote server. Loopback HTTP — not the Databases helper |
| **serveLocal** | Rule action `{ path }` relative to that folder. In-place body replace when response rewriting is allowed; otherwise a DNR redirect while the bridge is up. Refused when the bridge is down or disconnected |
| **Recipe** | Built-in starter group (localhost / Vite, CORS headers, SPA fallback). It becomes a normal group; there is no separate recipe file |
| **Rule tester** | Options-page UI: paste a URL (optional method, resource type, page) and see which rule wins, using engine precedence. Successor surface: **API Tester** ([api-client](../specs/api-client.md) Slice A Approved) |
| **API Tester** | Options tab (rename from Tester): Postman-class API client in-extension, no backend. Collections with folders (not “workspace”). Slice A Approved; B/C Draft |
| **Databases** | Options tab: DBeaver-class DB client via native-messaging helper (brand `nativeHostName`, default `com.detour.db`) ([db-client](../specs/db-client.md) Approved, ADR-027/030). Slices A–D + Connection options + `hello`/capabilities. Query collections with folders (not “workspace”) |
| **detour-db / DB host** | Native messaging host (default `com.detour.db`) started by `connectNative`; `hello` handshake; multi-engine adapters; SSH/proxy tunnels; `pickFile`; secrets in OS keychain (memory fallback in tests); auto-exits when the port closes. Distinct from Local Bridge. Partner closed helpers may use another host name out of tree (ADR-030) |
| **DbConnection v2** | Nested connection metadata (`tls`, `ssh`, `proxy`, `advanced`, `engineOptions`) with load-time migration from flat `tlsEnabled` / flat SSH |
| **Query collection** | Saved DB (or API) queries in folders. Never called a “workspace” in UI copy |
| **RO** | Resource Override ([kylepaulsen/ResourceOverride](https://github.com/kylepaulsen/ResourceOverride)) — upstream inspiration and legacy import format only; the product name is **Detour** |
| **SDD** | Spec-driven development — Draft → Approved before implementation |
| **Workspace** | All groups the user has; stored/exported as `{ v, data }` envelope |
| **Candidate** | A compiled DNR rule before ids/priority are assigned |
| **Refusal** | A rule engine-core did not install, with a `reason` code (e.g. `regex-limit`, `browser-rejected`) |
| **Apply report** | `storage.local.applyReport` — applied DNR ids, `injected` page rules, `bodies` (armed override ids only), refusals, errors. No rule bodies |
| **Page config** | `storage.local.pageConfig` — compiled mock/CSS/script-URL entries the bridge reads. Holds mock bodies locally; not telemetry |
| **Page failure** | `storage.session.pageFailures` — last 50 runtime inject failures (origin + message, no bodies) |
| **Match log** | `storage.session.matchLog` — newest 50 matches this session (rule label + URL). Local only; dropped when the session ends |
| **showBadge** | `storage.local.showBadge`. Missing means the toolbar badge is on. Off clears the icon text and keeps the log |
| **Import key** | Stable id inside an import so re-import can keep that group or rule's on/off state |
| **User scripts** | Chrome/Firefox API for running user-supplied JS. Needs a toggle (Chrome) or optional permission (Firefox 136+) |
| **Bridge** | Detour's isolated content script: CSS requests, script-URL tags, mock config handoff |
| **Unsafe rule** | Chrome DNR term: any action besides block/allow/allowAllRequests/upgradeScheme; separate 5000 cap |
