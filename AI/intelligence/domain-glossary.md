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
| **Rule tester** | UI that shows which rule matches a pasted URL |
| **RO** | Resource Override (kylepaulsen) — upstream inspiration |
| **SDD** | Spec-driven development — Draft → Approved before implementation |
| **Workspace** | All groups the user has; stored/exported as `{ v, data }` envelope |
| **Candidate** | A compiled DNR rule before ids/priority are assigned |
| **Refusal** | A rule engine-core did not install, with a `reason` code (e.g. `regex-limit`, `browser-rejected`) |
| **Apply report** | `storage.local.applyReport` — what was applied/refused on the last refresh (ids only) |
| **Unsafe rule** | Chrome DNR term: any action besides block/allow/allowAllRequests/upgradeScheme; separate 5000 cap |
