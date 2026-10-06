# Spec: engine-core

**Status:** Approved (by Hamza, 2026-10-06)  
**Last updated:** 2026-10-06  
**Build order:** 2  
**Depends on:** rule-model  
**Plan:** [002-rule-model-engine-core](../plans/002-rule-model-engine-core.md)

## Objective

Compile and apply Core DNR rules (redirect, modifyHeaders, block) with **urlFilter-first** matching, batched updates, deterministic priority, and clear errors when Chrome's regex ceiling or invalid patterns block application.

## User stories

- As a developer, I can redirect a production asset URL to localhost or another origin.
- As a developer, I can add/remove request or response headers for matched URLs.
- As a developer, I can block matched requests.
- As a developer, I see which rules failed to install and why (syntax, regex ceiling).

## Acceptance criteria

- [ ] RuleCompiler maps supported Core actions → `declarativeNetRequest` dynamic rules
- [ ] Prefer `urlFilter` for glob/simple patterns; use `regexFilter` only when required
- [ ] Single batched `updateDynamicRules` apply path; coalesce overlapping refreshes
- [ ] Priority respects group + rule order
- [ ] Over-ceiling regex sets apply what fits and surface failures (no silent zero-rules)
- [ ] Disable group/rule removes corresponding DNR ids

## Browser support table

| Browser | Min | Core DNR |
|---------|-----|----------|
| Chrome / Edge / Brave | 120+ | Full target |
| Firefox | 128 ESR+ | DNR as supported; document gaps |
| Safari | 17+ | Subset TBD |

## Limits and gotchas

- ~1000 dynamic regex rules on Chrome — see `intelligence/gotchas.md`
- `data:` redirects discouraged as primary file strategy
- CORS/preflight interactions on redirects
- Resource types must be explicit where needed

## Out of scope

- Response body rewrite (engine-deep / FF body)
- Page inject and fetch mocks
- Local Bridge serving

## Verification

- Unit tests: glob→urlFilter/regex decisions; priority ordering; batching
- Manual: redirect script on a sample page in Chrome + Firefox
- Ceiling stress: >1000 regex-requiring rules shows UI/errors (once UI exists)
