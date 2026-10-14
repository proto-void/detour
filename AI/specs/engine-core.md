# Spec: engine-core

**Status:** Approved (by Hamza, 2026-10-06); body redirect delivery (Hamza, 2026-10-08)  
**Last updated:** 2026-10-08  
**Build order:** 2  
**Depends on:** rule-model  
**Plan:** [002-rule-model-engine-core](../plans/002-rule-model-engine-core.md), [024-body-redirect-delivery](../plans/024-body-redirect-delivery.md)

## Objective

Compile and apply Core DNR rules (redirect, modifyHeaders, block, and `overrideBody` with `delivery: redirect`) with **urlFilter-first** matching, batched updates, deterministic priority, and clear errors when Chrome's regex ceiling or invalid patterns block application.

## User stories

- As a developer, I can redirect a production asset URL to localhost or another origin.
- As a developer, I can add/remove request or response headers for matched URLs.
- As a developer, I can block matched requests.
- As a developer, I see which rules failed to install and why (syntax, regex ceiling).

## Acceptance criteria

- [x] RuleCompiler maps supported Core actions → `declarativeNetRequest` dynamic rules
- [x] Prefer `urlFilter` for glob/simple patterns; use `regexFilter` only when required
- [x] Single batched `updateDynamicRules` apply path; coalesce overlapping refreshes
- [x] Priority respects group + rule order
- [x] Over-ceiling regex sets apply what fits and surface failures (no silent zero-rules)
- [x] Disable group/rule removes corresponding DNR ids
- [x] `overrideBody` with `delivery: redirect` (default) compiles to a DNR redirect to a `data:` URL (UTF-8 base64; MIME from `contentType` or match extension). `delivery: inPlace` is skipped here (engine-deep)

## Browser support table

| Browser | Min | Core DNR |
|---------|-----|----------|
| Chrome / Edge / Brave | 120+ | Full target |
| Firefox | 128 ESR+ | DNR as supported; document gaps |
| Safari | 17+ | Subset TBD |

## Limits and gotchas

- ~1000 dynamic regex rules on Chrome — see `intelligence/gotchas.md`
- `data:` redirects can be blocked by CSP (`connect-src` / `script-src`) and do not satisfy SRI — use in-place delivery for those pages ([ADR-025](../DECISIONS.md))
- CORS/preflight interactions on redirects
- Resource types must be explicit where needed

## Out of scope

- In-place response body rewrite (engine-deep / FF body)
- Page inject and fetch mocks
- Local Bridge serving (except compiling `serveLocal` redirect when the bridge is up and in-place is off)

## Verification

- Unit tests: glob→urlFilter/regex decisions; priority ordering; batching
- Manual: redirect script on a sample page in Chrome + Firefox
- Ceiling stress: >1000 regex-requiring rules shows UI/errors (once UI exists)
