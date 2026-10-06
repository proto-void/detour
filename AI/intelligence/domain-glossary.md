# Domain glossary

**Last verified:** 2026-10-07

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
| **Deep engine** | Chromium `chrome.debugger` / CDP Fetch, and Firefox `filterResponseData`, for `overrideBody` |
| **overrideBody** | Replace a response’s bytes in place. Inline UTF-8 text, optional content type. Not a DNR rule |
| **Body consent** | `storage.local.bodyEngineConsent`. Set only by Allow debugger / Allow response rewriting. Absent means do not attach or filter |
| **Local Bridge** | Optional Node CLI. Serves one folder on `127.0.0.1` after the user pastes its token. Not a remote server |
| **serveLocal** | Rule action `{ path }` relative to that folder. Compiles to a DNR redirect while the bridge is up; otherwise refused |
| **Recipe** | Built-in starter group (localhost / Vite, CORS headers, SPA fallback). It becomes a normal group; there is no separate recipe file |
| **Rule tester** | Options-page UI: paste a URL (optional method, resource type, page) and see which rule wins, using engine precedence |
| **RO** | Resource Override (kylepaulsen) — upstream inspiration |
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
