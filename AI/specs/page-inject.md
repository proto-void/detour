# Spec: page-inject

**Status:** Draft  
**Last updated:** 2026-10-06  
**Build order:** 3  
**Depends on:** rule-model

## Objective

Inject user-provided JavaScript and CSS into matched pages at configurable document lifecycle points, without relying on abandoned MV2 `webRequest` HTML rewriting.

## User stories

- As a developer, I can inject a CSS snippet to restyle a production page for debugging.
- As a developer, I can inject JS at `document_start` or after load to patch behavior.
- As a developer, I can scope inject rules to URL patterns and toggle them quickly.

## Acceptance criteria

- [ ] Rule actions for `injectJs` and `injectCss` with match patterns
- [ ] Configurable run-at / world (isolated vs MAIN where API allows)
- [ ] Failures (permissions, CSP blocked) surface in observability channel
- [ ] Disabled rules do not inject
- [ ] Document MAIN-world risks in UI copy (Draft: content requirement)

## Browser support table

| Browser | Min | Inject |
|---------|-----|--------|
| Chrome / Edge / Brave | 120+ | `scripting` API |
| Firefox | 128 ESR+ | `scripting` / tabs APIs as available |
| Safari | 17+ | Verify; may be limited |

## Limits and gotchas

- CSP may block inline/MAIN evaluation — document fallbacks
- Script order vs page scripts is racy; prefer `document_start` carefully
- Do not use deprecated mutation-event HTML rewrite as primary path

## Out of scope

- Replacing network response bodies
- Userscript marketplace / remote code fetch by default

## Verification

- Fixture page + inject CSS visibility test
- Fixture page + inject JS sets a known marker
- Permission denial path shows error, not silent fail
