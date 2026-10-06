# Spec: api-mock

**Status:** Draft  
**Last updated:** 2026-10-06  
**Build order:** 4  
**Depends on:** rule-model

## Objective

Mock HTTP APIs by intercepting `fetch` and `XMLHttpRequest` in the page world so developers can return status, headers, and body without a full response-body network engine.

## User stories

- As a developer, I can mock a JSON API endpoint with a fixed body and status while using production frontend.
- As a developer, I can delay a mock response to simulate latency.
- As a developer, I can limit mocks to matching URL patterns and methods.

## Acceptance criteria

- [ ] Mock rules specify match (URL/method), status, headers, body, optional delay
- [ ] Intercepts both `fetch` and `XHR` for matched requests
- [ ] Unmatched traffic passes through unchanged
- [ ] Toggle off restores native behavior without reload when possible
- [ ] Clear conflict policy when Core DNR also redirects the same URL (document winner)

## Browser support table

| Browser | Min | Mock |
|---------|-----|------|
| Chrome / Edge / Brave | 120+ | Page-world inject |
| Firefox | 128 ESR+ | Page-world inject |
| Safari | 17+ | Verify page-world inject |

## Limits and gotchas

- Service Workers / native modules may bypass page patches
- Cross-origin isolation and credentialed requests need careful header mocks
- Not a substitute for Deep body rewrite of arbitrary subresources

## Out of scope

- GraphQL-aware mocking UI (raw body only for V1)
- Record/playback traffic proxy

## Verification

- Page fixture calling fetch + XHR against mock rules
- Method mismatch does not mock
- Disable rule → real network (or documented failure if SW caches)
