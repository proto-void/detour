# Spec: engine-deep

**Status:** Draft  
**Last updated:** 2026-10-06  
**Build order:** 5  
**Depends on:** rule-model, engine-core

## Objective

Provide a Chromium **Deep** path using `chrome.debugger` / CDP to override response bodies when Core DNR cannot (avoiding fragile `data:` redirects as the primary strategy).

## User stories

- As a developer, I can replace a remote JS/CSS file body with my content when DNR redirect is insufficient.
- As a developer, I am clearly warned that Deep mode attaches the debugger and may pause other DevTools workflows.
- As a developer, I can turn Deep off and fully detach.

## Acceptance criteria

- [ ] Explicit user opt-in per rule or session before debugger attach
- [ ] Body override for matched requests via CDP (Fetch/Network domain strategy TBD in plan)
- [ ] Detach on disable / browser shutdown paths
- [ ] Coexist with Core rules: compiler routes only eligible actions to Deep
- [ ] Document DevTools conflict behavior

## Browser support table

| Browser | Min | Deep |
|---------|-----|------|
| Chrome / Edge / Brave | 120+ | Target |
| Firefox | 128 ESR+ | Use FF `filterResponseData` path instead (sibling capability) |
| Safari | 17+ | Out for Deep |

## Limits and gotchas

- Debugger attach banner / store policy scrutiny
- Only one debugger client often — conflicts with DevTools
- Performance overhead vs Core
- Firefox body rewrite is a separate implementation behind the same rule actions where possible

## Out of scope

- Full CDP multipurpose toolkit (profiling, etc.)
- Android WebView

## Verification

- Manual Chrome: override a script body; page executes replaced code
- Opt-in required; no attach on install
- Firefox: equivalent body action uses filter path or shows unsupported
