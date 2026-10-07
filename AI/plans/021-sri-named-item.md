# 021 — setNamedItem and Attr.value integrity

**Status:** In progress  
**Date:** 2026-10-07  
**Spec:** [engine-deep](../specs/engine-deep.md) — `setNamedItem` and `Attr.value` Approved (Hamza, 2026-10-07)

## Goal

When page JavaScript adopts an HTML `integrity` Attr with `NamedNodeMap.setNamedItem` or `setNamedItemNS`, and the element is a script or stylesheet whose URL matches an armed `overrideBody` or in-place `serveLocal` rule, the Attr's value becomes a SHA-384 of the bytes Detour will serve. Once that Attr is already on the element, a write to `value`, `nodeValue`, or `textContent` is rewritten the same way. An Attr that is not attached yet keeps the page's string until an adopt hook runs. Other Attrs stay. The hook does not clear hashes.

## Design

See the Approved spec and [ADR-022](../DECISIONS.md).

The document rewrite (ADR-014) and the earlier MAIN-world hooks (ADR-015 through ADR-021) stay. This slice uses the same `<meta name="detour-sri">` list and the same content script:

- `setNamedItem` and `setNamedItemNS` do not call `setAttributeNode`. Both take an Attr and the map's element
- The element is the one recorded when page code reads `Element.attributes`. A map that did not come from that getter is passed through
- Substitute on the same HTML `integrity` rules as `setAttributeNode`. A non-matching URL, a foreign namespace, and any other local name stay
- Setting an `src` or `href` Attr the same way re-resolves a hash already assigned
- `Attr.value`, `nodeValue`, and `textContent` do not call one another. When the Attr is already HTML `integrity` on a matching script or stylesheet, the write becomes the publishable SHA-384. An unattached Attr is stored as written
- The hook does not clear `integrity`

## Tasks

- [x] T1 Spec Approved, this plan, ADR-022
- [ ] T2 Hook: `setNamedItem` and `setNamedItemNS` substitute HTML `integrity` on a matching script or stylesheet. A non-matching URL and a foreign namespace stay. `src` / `href` re-resolves
- [ ] T3 Hook: `Attr.value`, `nodeValue`, and `textContent` rewrite a write when that Attr is already HTML `integrity` on a matching script or stylesheet. An unattached Attr and a non-matching URL stay
- [ ] T4 Rules-page copy: adopting an Attr that way, or writing `Attr.value` after it is on the element, is covered
- [ ] T5 Unit tests, typecheck, Chrome + Firefox builds
- [ ] T6 Chrome e2e: `setNamedItem` with a production integrity hash runs the override, and a later `Attr.value` write still does. A non-matching sibling stays blocked
- [ ] T7 KB write-back

## Out of scope

npm publish, store upload, git push, `document.write`, `document.writeln`, `iframe` `srcdoc`, replacing a hooked setter on one element, rewriting documents when response rewriting is off, non-UTF-8 HTML, documents over 2 MiB.

## Verification

`pnpm --filter @detour/extension test`, `pnpm --filter @detour/extension typecheck`, `pnpm --filter @detour/extension build`, `pnpm --filter @detour/extension build:firefox`, `CHROME=… pnpm --filter @detour/extension e2e:chrome`
