# 019 — parseHTMLUnsafe integrity

**Status:** In progress  
**Date:** 2026-10-07  
**Spec:** [engine-deep](../specs/engine-deep.md) — `Document.parseHTMLUnsafe` Approved (Hamza, 2026-10-07)

## Goal

When page JavaScript passes a string to `Document.parseHTMLUnsafe`, a script or stylesheet whose URL matches an armed `overrideBody` or in-place `serveLocal` rule gets a SHA-384 `integrity` of the bytes Detour will serve, before the browser parses the string. The document that call creates still has scripting disabled. A node later moved into a live document carries that hash. Other hashes stay. The options object is passed through. The hook does not clear hashes.

`DOMParser.parseFromString` with type `text/html` is the same parse, so that string is rewritten too. Any other type is left unchanged.

## Design

See the Approved spec and [ADR-020](../DECISIONS.md).

The document rewrite (ADR-014) and the earlier MAIN-world hooks (ADR-015 through ADR-019) stay. This slice uses the same `<meta name="detour-sri">` list and the same content script:

- `Document.parseHTMLUnsafe` rewrites a string with the same tag scan as `innerHTML`. Options are forwarded. Scripting stays off
- `DOMParser.parseFromString` rewrites a string only when the type is exactly `text/html`
- A non-string value is passed through, so TrustedHTML is not stringified and a Trusted Types policy is not bypassed
- A string with no `integrity`, an empty list, a missing meta, or a string longer than 2 MiB is left unchanged
- The hook does not clear `integrity`
- Adopting or otherwise moving the parsed nodes into a live document carries the rewritten attribute. A stylesheet is fetched then. A script parsed this way still does not run

## Tasks

- [ ] T1 Spec Approved, this plan, ADR-020
- [ ] T2 Hook: `Document.parseHTMLUnsafe` rewrites a string whenever a body rule is armed. Options are forwarded. A non-string is passed through. A sibling hash stays. `DOMParser.parseFromString` rewrites only `text/html`
- [ ] T3 Rules-page copy: adoptees carry Detour's hash
- [ ] T4 Unit tests, typecheck, Chrome + Firefox builds
- [ ] T5 Chrome e2e: `parseHTMLUnsafe` with a production integrity hash, then adopt the nodes into the live document, so the stylesheet override applies. A non-matching sibling stays blocked
- [ ] T6 KB write-back

## Out of scope

npm publish, store upload, git push, safe `setHTML`, `Document.parseHTML`, `DOMParser` XML types, `setAttributeNode` / `setAttributeNodeNS`, rewriting documents when response rewriting is off, non-UTF-8 HTML, documents over 2 MiB.

## Verification

`pnpm --filter @detour/extension test`, `pnpm --filter @detour/extension typecheck`, `pnpm --filter @detour/extension build`, `pnpm --filter @detour/extension build:firefox`, `CHROME=… pnpm --filter @detour/extension e2e:chrome`
