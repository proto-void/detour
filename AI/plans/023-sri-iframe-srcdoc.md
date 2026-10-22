# 023 — iframe srcdoc integrity

**Status:** Done  
**Date:** 2026-10-08  
**Spec:** [engine-deep](../specs/engine-deep.md) — `iframe` `srcdoc` Approved (Hamza, 2026-10-07)

## Goal

When page JavaScript sets an iframe's `srcdoc`, and a script or stylesheet tag in that string matches an armed `overrideBody` or in-place `serveLocal` rule, that tag's `integrity` becomes a SHA-384 of the bytes Detour will serve. Other hashes stay. The hook does not clear hashes.

## Design

See the Approved spec and [ADR-024](../DECISIONS.md).

The document rewrite (ADR-014) and the earlier MAIN-world hooks (ADR-015 through ADR-023) stay. This slice uses the same `<meta name="detour-sri">` list and the same content script:

- `srcdoc` is parsed as the frame's document. The parent's `innerHTML` hook does not run for a property assignment, and the frame's parser copies `integrity` before a content script in the frame can change it
- A string assigned to `HTMLIFrameElement.srcdoc`, or passed to `setAttribute` / `setAttributeNS` as HTML `srcdoc` on an iframe, is rewritten with the same tag scan
- A non-string is passed through. TrustedHTML is not stringified
- `srcdoc` on an element that is not an iframe, and `srcdoc` in another namespace, stays as written
- A non-matching tag, a string with no list, and a string longer than 2 MiB stay as written
- The hook does not clear `integrity` and does not change `sandbox`

## Tasks

- [x] T1 Spec Approved, this plan, ADR-024
- [x] T2 Hook: `HTMLIFrameElement.srcdoc`, `setAttribute('srcdoc')`, and `setAttributeNS` for HTML `srcdoc` rewrite matching `integrity`. A non-matching hash stays. A non-string is passed through
- [x] T3 Rules-page copy: an iframe `srcdoc` string is covered
- [x] T4 Unit tests, typecheck, Chrome + Firefox builds
- [x] T5 Chrome e2e: an iframe `srcdoc` with a production integrity hash runs the override inside the frame. A non-matching sibling stays blocked
- [x] T6 KB write-back

## Results (2026-10-08)

- 397 extension tests; typecheck clean; chrome-mv3 and firefox-mv3 builds clean (`content-scripts/sri-main.js` in both)
- Chrome for Testing 155: `pnpm e2e:chrome` 127/127. `*:8001/sri-srcdoc.js` ran `window.SRI_SRCDOC = "LOCAL"` inside the frame after the page set `iframe.srcdoc` with the production hash. The live `integrity` was the override SHA-384. A sibling in that string stayed blocked and kept the page's hash
- A non-string assigned to `srcdoc` is passed through, so TrustedHTML is not stringified. `srcdoc` on an element that is not an iframe, and `srcdoc` in another namespace, stays as written
- A `sandbox` without `allow-scripts` still blocks scripts in the frame. This slice does not change sandbox flags
- Firefox document rewrite is unit-tested. BiDi still cannot open extension pages
- Not pushed

## Out of scope

npm publish, store upload, git push, changing `sandbox` flags, replacing a hooked setter on one element, rewriting documents when response rewriting is off, non-UTF-8 HTML, documents over 2 MiB.

## Verification

`pnpm --filter @detour/extension test`, `pnpm --filter @detour/extension typecheck`, `pnpm --filter @detour/extension build`, `pnpm --filter @detour/extension build:firefox`, `CHROME=… pnpm --filter @detour/extension e2e:chrome`
