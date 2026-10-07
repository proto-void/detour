# 020 — setAttributeNode integrity

**Status:** In progress  
**Date:** 2026-10-07  
**Spec:** [engine-deep](../specs/engine-deep.md) — `setAttributeNode` Approved (Hamza, 2026-10-07)

## Goal

When page JavaScript moves an `Attr` onto a script or stylesheet with `Element.setAttributeNode` or `Element.setAttributeNodeNS`, and that Attr is HTML `integrity` for a URL that matches an armed `overrideBody` or in-place `serveLocal` rule, the Attr's value becomes a SHA-384 of the bytes Detour will serve. Other Attrs stay. The hook does not clear hashes.

## Design

See the Approved spec and [ADR-021](../DECISIONS.md).

The document rewrite (ADR-014) and the earlier MAIN-world hooks (ADR-015 through ADR-020) stay. This slice uses the same `<meta name="detour-sri">` list and the same content script:

- `setAttributeNode` and `setAttributeNodeNS` do not call `setAttribute` or `setAttributeNS`. Both take an `Attr`
- Substitute when `namespaceURI` is null, empty, or the HTML namespace, and the local name is `integrity`, on a script or stylesheet link whose URL matches. The Attr's value is set to the publishable SHA-384 before the original method adopts it
- A non-matching URL, a foreign namespace, and any other local name are passed through
- Setting an `src` or `href` Attr the same way re-resolves a hash already assigned, including when integrity was set first
- A value that is not an Attr is passed to the original method
- The hook does not clear `integrity`

## Tasks

- [x] T1 Spec Approved, this plan, ADR-021
- [ ] T2 Hook: `setAttributeNode` and `setAttributeNodeNS` substitute HTML `integrity` on a matching script or stylesheet. A non-matching URL and a foreign namespace stay. `src` / `href` re-resolves
- [ ] T3 Rules-page copy: moving an Attr that way is covered
- [ ] T4 Unit tests, typecheck, Chrome + Firefox builds
- [ ] T5 Chrome e2e: `setAttributeNode` with a production integrity hash runs the override. A non-matching sibling stays blocked
- [ ] T6 KB write-back

## Out of scope

npm publish, store upload, git push, `NamedNodeMap.setNamedItem`, `NamedNodeMap.setNamedItemNS`, assigning `Attr.value` after the node is on the element, rewriting documents when response rewriting is off, non-UTF-8 HTML, documents over 2 MiB.

## Verification

`pnpm --filter @detour/extension test`, `pnpm --filter @detour/extension typecheck`, `pnpm --filter @detour/extension build`, `pnpm --filter @detour/extension build:firefox`, `CHROME=… pnpm --filter @detour/extension e2e:chrome`
