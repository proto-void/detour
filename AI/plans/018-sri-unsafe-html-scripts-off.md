# 018 — setHTMLUnsafe integrity when scripts are off

**Status:** In progress  
**Date:** 2026-10-07  
**Spec:** [engine-deep](../specs/engine-deep.md) — setHTMLUnsafe with scripts off Approved (Hamza, 2026-10-07)

## Goal

When page JavaScript passes a string to `Element.setHTMLUnsafe` or `ShadowRoot.setHTMLUnsafe`, a script or stylesheet whose URL matches an armed `overrideBody` or in-place `serveLocal` rule gets a SHA-384 `integrity` of the bytes Detour will serve. That rewrite happens when `runScripts` is omitted, `false`, `true`, or any other value. Other hashes stay. The options object is passed through, so scripts still run only when `runScripts` is strictly `true`. The hook does not clear hashes.

## Design

See the Approved spec and [ADR-019](../DECISIONS.md).

The document rewrite (ADR-014) and the earlier MAIN-world hooks (ADR-015 through ADR-018) stay. This slice uses the same `<meta name="detour-sri">` list and the same content script:

- `setHTMLUnsafe` rewrites a string with the same tag scan as `innerHTML`, for every options value
- The options object is forwarded unchanged. This slice does not turn scripts on
- A non-string value is passed through, so TrustedHTML is not stringified and a Trusted Types policy is not bypassed
- A string with no `integrity`, an empty list, a missing meta, or a string longer than 2 MiB is left unchanged
- The hook does not clear `integrity`

## Tasks

- [x] T1 Spec Approved, this plan, ADR-019
- [ ] T2 Hook: `Element.setHTMLUnsafe` and `ShadowRoot.setHTMLUnsafe` rewrite a string whenever a body rule is armed, including when `runScripts` is omitted, false, or any value other than true. Options are forwarded. A non-string is passed through. A sibling hash stays
- [ ] T3 Rules-page copy
- [ ] T4 Unit tests, typecheck, Chrome + Firefox builds
- [ ] T5 Chrome e2e: `setHTMLUnsafe` without `runScripts` (or with `false`) inserts a stylesheet whose production integrity still applies the override; a non-matching sibling stays blocked. The existing `runScripts: true` script check stays green
- [ ] T6 KB write-back

## Out of scope

npm publish, store upload, git push, `Document.parseHTMLUnsafe`, safe `setHTML`, rewriting documents when response rewriting is off, non-UTF-8 HTML, documents over 2 MiB.

## Verification

`pnpm --filter @detour/extension test`, `pnpm --filter @detour/extension typecheck`, `pnpm --filter @detour/extension build`, `pnpm --filter @detour/extension build:firefox`, `CHROME=… pnpm --filter @detour/extension e2e:chrome`
