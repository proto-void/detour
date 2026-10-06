# 016 — Script-running markup integrity

**Status:** Done  
**Date:** 2026-10-07  
**Spec:** [engine-deep](../specs/engine-deep.md) — script-running markup slice Approved (Hamza, 2026-10-07)

## Goal

When page JavaScript passes a string to `Range.createContextualFragment`, or to `Element.setHTMLUnsafe` / `ShadowRoot.setHTMLUnsafe` with `runScripts: true`, a script or stylesheet tag in that string whose URL matches an armed `overrideBody` or in-place `serveLocal` rule gets a SHA-384 `integrity` of the bytes Detour will serve, before the browser parses the string. Other hashes in the string stay. The hook does not clear hashes. A call that does not run scripts is left unchanged.

## Design

See the Approved spec and [ADR-017](../DECISIONS.md).

The document rewrite (ADR-014), the property hook (ADR-015), and the inert markup hook (ADR-016) stay. This slice uses the same `<meta name="detour-sri">` list and the same content script:

- `createContextualFragment` always rewrites a string. The HTML spec parses that call with scripting mode Fragment, so inserted scripts run
- `setHTMLUnsafe` rewrites a string only when `options.runScripts === true`. The spec default is false, which stays inert
- The string is scanned with the same tag rules as `innerHTML` (comments and script text are skipped). The meta tag is not copied into the fragment
- A non-string value is passed through, so TrustedHTML is not stringified and a Trusted Types policy is not bypassed
- `outerHTML` and `ShadowRoot.innerHTML` stay unhooked. They do not execute scripts

## Tasks

- [x] T1 Spec Approved, this plan, ADR-017
- [x] T2 Hook: `createContextualFragment` rewrites before the native call; a non-string is passed through; no list leaves the page hash
- [x] T3 Hook: `Element.setHTMLUnsafe` and `ShadowRoot.setHTMLUnsafe` rewrite only when `runScripts` is true; other calls pass the string through
- [x] T4 Rules-page copy
- [x] T5 Unit tests, typecheck, Chrome + Firefox builds
- [x] T6 Chrome e2e: markup that runs a script with a production hash runs the override; a non-matching sibling stays blocked
- [x] T7 KB write-back

## Results (2026-10-07)

- 384 extension tests; typecheck clean; chrome-mv3 and firefox-mv3 builds clean (`content-scripts/sri-main.js` in both)
- Chrome for Testing 155: `pnpm e2e:chrome` 85/85. `*:8001/sri-exec.js` ran `window.SRI_EXEC = "LOCAL"` after `createContextualFragment` with the production hash. A sibling in that fragment stayed blocked. `*:8001/sri-unsafe.js` ran `window.SRI_UNSAFE = "LOCAL"` after `setHTMLUnsafe` with `runScripts: true`. A sibling in that call stayed blocked
- Firefox document rewrite is unit-tested. BiDi still cannot open extension pages
- Not pushed

## Out of scope

npm publish, store upload, git push, `outerHTML`, `setAttributeNS`, `ShadowRoot.innerHTML`, `Document.parseHTMLUnsafe`, safe `setHTML`, `setHTMLUnsafe` when `runScripts` is not strictly true, rewriting documents when response rewriting is off, non-UTF-8 HTML, documents over 2 MiB.

## Verification

`pnpm --filter @detour/extension test`, `pnpm --filter @detour/extension typecheck`, `pnpm --filter @detour/extension build`, `pnpm --filter @detour/extension build:firefox`, `CHROME=… pnpm --filter @detour/extension e2e:chrome`
