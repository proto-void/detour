# Spec: api-mock

**Status:** Approved (by Hamza, 2026-10-06)  
**Last updated:** 2026-10-06  
**Build order:** 4  
**Depends on:** rule-model, page-inject machinery  
**Plan:** [005-page-inject-api-mock](../plans/005-page-inject-api-mock.md)

## Objective

Mock HTTP APIs by intercepting `fetch` and `XMLHttpRequest` in the page world so developers can return status, headers, and body without a full response-body network engine.

## User stories

- As a developer, I can mock a JSON API endpoint with a fixed body and status while using production frontend.
- As a developer, I can delay a mock response to simulate latency.
- As a developer, I can limit mocks to matching URL patterns and methods.

## Acceptance criteria

- [x] Rule action `mock { method, status, headers[], body, delayMs }`. The rule's `match` is the **request URL** (absolute, resolved against the page). `method` is `ANY` or one HTTP method
- [x] Intercepts both `fetch` and `XMLHttpRequest` (async) for matched requests in top and child frames. The first matching mock in workspace order wins
- [x] Unmatched traffic passes through to the native implementation unchanged, with the same arguments
- [x] Switching a rule off (or Detour off) takes effect without reload: open pages get the new config and pass through
- [x] Conflict policy: a mock answers **inside the page**, so the request never reaches the network and DNR redirect/block/header rules for that URL don't apply. **Mock wins**
- [x] `status` 200–599 (Fetch `Response` limits). 204/205/304 get no body. `delayMs` 0–30000, and the delay respects `AbortSignal`

## Mechanism (verified 2026-10-06)

- A packaged MAIN-world runtime is registered with `scripting.registerContentScripts({ world: 'MAIN', runAt: 'document_start', allFrames: true })` (Chrome 102+, Firefox 128+) only while at least one enabled mock exists. It patches `fetch` / `XMLHttpRequest` synchronously before page scripts run
- Config comes from the isolated bridge (it reads `storage.local`) over a DOM `CustomEvent` with a JSON string. Requests made before the config arrives are held (up to 1 s), then mocked or passed through
- No `userScripts` needed: mocks work without the user-scripts toggle

## Browser support table

| Browser | Min | Mock |
|---------|-----|------|
| Chrome / Edge / Brave | 120+ | Page-world inject |
| Firefox | 128 ESR+ | Page-world inject |
| Safari | 17+ | Verify page-world inject |

## Limits and gotchas

- Service Workers, Web Workers and `navigator.sendBeacon` bypass page patches
- Synchronous XHR made before config arrives passes through (it can't wait)
- The page can see the patched `fetch` (`window.fetch !== native`) and the mock config; mocks are a dev tool, not a security boundary
- Cross-origin isolation and credentialed requests need careful header mocks
- Not a substitute for Deep body rewrite of arbitrary subresources

## Out of scope

- GraphQL-aware mocking UI (raw body only for V1)
- Record/playback traffic proxy
- Mocking network errors (status 0); later

## Verification

- Page fixture calling fetch + XHR against mock rules (status, headers, body)
- Method mismatch does not mock; a non-matching fetch passes through to the server
- Disable rule → real network on the next request, without reload
