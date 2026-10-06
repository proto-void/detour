# 017 — Inert markup integrity

**Status:** In progress  
**Date:** 2026-10-07  
**Spec:** [engine-deep](../specs/engine-deep.md) — inert markup slice Approved (Hamza, 2026-10-07)

## Goal

When page JavaScript assigns a string to `Element.outerHTML` or `ShadowRoot.innerHTML`, or sets `integrity` with `Element.setAttributeNS`, a script or stylesheet whose URL matches an armed `overrideBody` or in-place `serveLocal` rule gets a SHA-384 `integrity` of the bytes Detour will serve. Other hashes stay. The hook does not clear hashes.

## Design

See the Approved spec and [ADR-018](../DECISIONS.md).

The document rewrite (ADR-014), the property hook (ADR-015), the inert markup hook (ADR-016), and the script-running markup hook (ADR-017) stay. This slice uses the same `<meta name="detour-sri">` list and the same content script:

- `outerHTML` and `ShadowRoot.innerHTML` rewrite a string with the same tag scan as `innerHTML`. The fragment parser does not execute those scripts. A stylesheet is fetched and checked
- A non-string value is passed through, so TrustedHTML is not stringified and a Trusted Types policy is not bypassed
- A string with no `integrity`, an empty list, a missing meta, or a string longer than 2 MiB is left unchanged
- `setAttributeNS` substitutes the hash when the attribute is HTML `integrity` on a script or stylesheet link: null, omitted, or empty namespace, the HTML namespace, or a prefixed name whose local part is `integrity`. Setting `src` or `href` that way re-resolves a hash already assigned. Any other namespace is passed through
- The hook does not clear `integrity`

## Tasks

- [x] T1 Spec Approved, this plan, ADR-018
- [ ] T2 Hook: `outerHTML` and `ShadowRoot.innerHTML` rewrite before the native setter; a non-string is passed through; no list leaves the page hash
- [ ] T3 Hook: `setAttributeNS` substitutes `integrity` on a matching script or stylesheet link; a non-matching URL and a foreign namespace stay
- [ ] T4 Rules-page copy
- [ ] T5 Unit tests, typecheck, Chrome + Firefox builds
- [ ] T6 Chrome e2e: at least one of these paths runs the override or accepts a stylesheet; a non-matching resource stays blocked
- [ ] T7 KB write-back

## Out of scope

npm publish, store upload, git push, `Document.parseHTMLUnsafe`, safe `setHTML`, `setHTMLUnsafe` when `runScripts` is not strictly true, rewriting documents when response rewriting is off, non-UTF-8 HTML, documents over 2 MiB.

## Verification

`pnpm --filter @detour/extension test`, `pnpm --filter @detour/extension typecheck`, `pnpm --filter @detour/extension build`, `pnpm --filter @detour/extension build:firefox`, `CHROME=… pnpm --filter @detour/extension e2e:chrome`
