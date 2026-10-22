# 022 — document.write integrity

**Status:** Done  
**Date:** 2026-10-07  
**Spec:** [engine-deep](../specs/engine-deep.md) — `document.write` / `document.writeln` Approved (Hamza, 2026-10-07)

## Goal

When page JavaScript passes markup to `document.write` or `document.writeln`, and a script or stylesheet tag in that markup matches an armed `overrideBody` or in-place `serveLocal` rule, that tag's `integrity` becomes a SHA-384 of the bytes Detour will serve. String arguments are concatenated first, so a tag split across arguments is still rewritten. Other hashes stay. The hook does not clear hashes.

## Design

See the Approved spec and [ADR-023](../DECISIONS.md).

The document rewrite (ADR-014) and the earlier MAIN-world hooks (ADR-015 through ADR-022) stay. This slice uses the same `<meta name="detour-sri">` list and the same content script:

- `document.write` and `document.writeln` do not go through `innerHTML` or `createContextualFragment`. During parsing, a script in the written string runs
- When every argument is a string, concatenate with no separator, rewrite with the same tag scan, and call the original method with that one string. `writeln` still appends its line feed
- A call that includes a non-string is passed through. TrustedHTML is not stringified
- A non-matching tag, a string with no list, and a string longer than 2 MiB stay as written
- The hook does not clear `integrity`. `iframe` `srcdoc` stays unhooked

## Tasks

- [x] T1 Spec Approved, this plan, ADR-023
- [x] T2 Hook: `Document.prototype.write` and `writeln` rewrite matching `integrity` after string arguments are concatenated. A non-matching hash stays. A non-string call is passed through
- [x] T3 Rules-page copy: markup passed to `document.write` or `document.writeln` is covered
- [x] T4 Unit tests, typecheck, Chrome + Firefox builds
- [x] T5 Chrome e2e: `document.write` with a production integrity hash runs the override. A non-matching sibling stays blocked
- [x] T6 KB write-back

## Results (2026-10-07)

- 395 extension tests; typecheck clean; chrome-mv3 and firefox-mv3 builds clean (`content-scripts/sri-main.js` in both)
- Chrome for Testing 155: `pnpm e2e:chrome` 122/122. `*:8001/sri-write.js` ran `window.SRI_WRITE = "LOCAL"` after `document.write` with the production hash split across string arguments. The live `integrity` was the override SHA-384. A sibling inserted with `document.writeln` stayed blocked and kept the page's hash
- A call that includes a non-string is passed through, so TrustedHTML is not stringified. `writeln` still appends its own line feed
- Firefox document rewrite is unit-tested. BiDi still cannot open extension pages
- Not pushed

## Out of scope

npm publish, store upload, git push, `iframe` `srcdoc`, replacing a hooked method on one document, rewriting documents when response rewriting is off, non-UTF-8 HTML, documents over 2 MiB.

## Verification

`pnpm --filter @detour/extension test`, `pnpm --filter @detour/extension typecheck`, `pnpm --filter @detour/extension build`, `pnpm --filter @detour/extension build:firefox`, `CHROME=… pnpm --filter @detour/extension e2e:chrome`
