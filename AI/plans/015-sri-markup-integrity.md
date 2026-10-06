# 015 — Markup integrity

**Status:** In progress  
**Date:** 2026-10-07  
**Spec:** [engine-deep](../specs/engine-deep.md) — markup slice Approved (Hamza, 2026-10-07)

## Goal

When page JavaScript assigns `innerHTML` or calls `insertAdjacentHTML` with a string that contains a script or stylesheet tag whose URL matches an armed `overrideBody` or in-place `serveLocal` rule, that tag's `integrity` becomes a SHA-384 of the bytes Detour will serve before the browser parses the string. Other hashes in the string stay. The hook does not clear hashes.

## Design

See the Approved spec and [ADR-016](../DECISIONS.md).

The document rewrite (ADR-014) and the property hook (ADR-015) stay. This slice uses the same `<meta name="detour-sri">` list and the same content script:

- The string is scanned with the same tag rules as the document (comments and script text are skipped)
- Only a matching script or stylesheet tag's `integrity` is replaced. The meta tag is not copied into the fragment
- A non-string value is passed to the original method unchanged, so TrustedHTML is not stringified
- The HTML fragment parser marks inserted scripts already started, so they do not run from the insertion alone. The Chrome check copies the parser-written attributes with `setAttributeNS`, which this slice does not hook. A production hash would still block that script

## Tasks

- [x] T1 Spec Approved, this plan, ADR-016
- [ ] T2 Pure rewrite: matching script, sibling hash, comment, script text, over the 2 MiB cap, empty list
- [ ] T3 Hook: `innerHTML` and `insertAdjacentHTML` rewrite before the native call; a non-string is passed through; no list leaves the page hash
- [ ] T4 Rules-page copy
- [ ] T5 Unit tests, typecheck, Chrome + Firefox builds
- [ ] T6 Chrome e2e: `insertAdjacentHTML` with a production hash runs the override; a non-matching sibling stays blocked
- [ ] T7 KB write-back

## Out of scope

npm publish, store upload, git push, `outerHTML`, `setAttributeNS`, `ShadowRoot.innerHTML`, `Range.createContextualFragment`, `setHTMLUnsafe`, rewriting documents when response rewriting is off, non-UTF-8 HTML, documents over 2 MiB.

## Verification

`pnpm --filter @detour/extension test`, `pnpm --filter @detour/extension typecheck`, `pnpm --filter @detour/extension build`, `pnpm --filter @detour/extension build:firefox`, `CHROME=… pnpm --filter @detour/extension e2e:chrome`
