# Domain glossary

**Last verified:** 2026-10-06

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
| **Deep engine** | Chromium `chrome.debugger` / CDP path for body-level overrides |
| **Local Bridge** | Optional Node CLI serving local files to the extension over loopback |
| **Recipe** | Shareable starter pack of rules for a scenario (e.g. Vite) |
| **Rule tester** | Options-page UI: paste a URL (optional method, resource type, page) and see which rule wins, using engine precedence |
| **RO** | Resource Override (kylepaulsen) — upstream inspiration |
| **SDD** | Spec-driven development — Draft → Approved before implementation |
| **Workspace** | All groups the user has; stored/exported as `{ v, data }` envelope |
| **Candidate** | A compiled DNR rule before ids/priority are assigned |
| **Refusal** | A rule engine-core did not install, with a `reason` code (e.g. `regex-limit`, `browser-rejected`) |
| **Apply report** | `storage.local.applyReport` — applied DNR ids, `injected` page rules, refusals, errors. No rule bodies |
| **Page config** | `storage.local.pageConfig` — compiled mock/CSS/script-URL entries the bridge reads. Holds mock bodies locally; not telemetry |
| **Page failure** | `storage.session.pageFailures` — last 50 runtime inject failures (origin + message, no bodies) |
| **Import key** | Stable id inside an import so re-import can keep that group or rule's on/off state |
| **User scripts** | Chrome/Firefox API for running user-supplied JS. Needs a toggle (Chrome) or optional permission (Firefox 136+) |
| **Bridge** | Detour's isolated content script: CSS requests, script-URL tags, mock config handoff |
| **Unsafe rule** | Chrome DNR term: any action besides block/allow/allowAllRequests/upgradeScheme; separate 5000 cap |
