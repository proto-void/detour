# Spec: observability

**Status:** Draft  
**Last updated:** 2026-10-06  
**Build order:** 8  
**Depends on:** engine-core, workspace-ui

## Objective

Make Detour's effects visible and debuggable via badge counts, match logs, and compile/apply errors — without exfiltrating rule bodies or file contents.

## User stories

- As a developer, I see a badge when rules match on the active tab (RO #28).
- As a developer, I can open a log of recent matches and errors.
- As a privacy-conscious user, I am never opted into uploading my rules.

## Acceptance criteria

- [ ] Optional badge: count or dot for matches on current tab
- [ ] In-extension match log (ring buffer) with rule id/name + URL
- [ ] Compile/apply errors visible in workspace
- [ ] Telemetry default **off**; if ever added, never includes rule bodies/files
- [ ] Badge setting persists

## Browser support table

| Browser | Min | Badge / log |
|---------|-----|-------------|
| Chrome / Edge / Brave | 120+ | `action.setBadge*` |
| Firefox | 128 ESR+ | browserAction/action badge |
| Safari | 17+ | Verify badge APIs |

## Limits and gotchas

- Match attribution under DNR is coarser than webRequest — may need heuristics / declarativeNetRequest feedback APIs where available
- High-traffic sites can flood logs — rate limit / ring buffer

## Out of scope

- Hosted error tracking that uploads page contents
- Full network panel clone

## Verification

- Enable badge; load matched page; badge updates
- Disable badge; no badge text
- Log contains match entries; export of log does not require network
