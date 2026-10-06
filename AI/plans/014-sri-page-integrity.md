# 014 — Page-world integrity

**Status:** Done  
**Date:** 2026-10-07  
**Spec:** [engine-deep](../specs/engine-deep.md) — page-world slice Approved (Hamza, 2026-10-07)

## Goal

When page JavaScript assigns `integrity` to a script or stylesheet link whose URL matches an armed `overrideBody` or in-place `serveLocal` rule, the browser checks a SHA-384 of the bytes Detour will serve. Assignments that do not match keep the page's value. The hook does not clear hashes.

## Design

See the Approved spec and [ADR-015](../DECISIONS.md).

The HTML parser path (ADR-014) still rewrites tags in the document. This slice covers assignments after parse:

- The document rewrite embeds the hash list in `<meta name="detour-sri">`. The hash comes from the same read the body engine fulfills. The list has no rule body and no bridge token
- A MAIN-world content script at `document_start` is registered only while those rules are armed. It hooks `integrity` setters and `setAttribute`, and reapplies the value before `src` / `href` or insertion starts a fetch
- It snapshots the meta once. Later edits by the page are ignored. A forged hash can only make the check fail
- Rewriting off does not register the hook and does not embed the list

## Tasks

- [x] T1 Spec Approved, this plan, ADR-015
- [x] T2 Pure list: encode without the body, matching URL, sibling URL, failed read, off-site page
- [x] T3 Hook: property and `setAttribute`, reapply before fetch, no list means the page value stays
- [x] T4 Chrome fulfill and Firefox filter embed the list. Register the content script only while armed
- [x] T5 Rules-page copy
- [x] T6 Unit tests, typecheck, Chrome + Firefox builds
- [x] T7 Chrome e2e: page sets `integrity` after parse; override runs; non-matching sibling with a bad hash stays blocked
- [x] T8 KB write-back

## Results (2026-10-07)

- 376 extension tests; typecheck clean; chrome-mv3 and firefox-mv3 builds clean (`content-scripts/sri-main.js` in both)
- Chrome for Testing 155: `pnpm e2e:chrome` 77/77. `*:8001/sri-js.js` ran `window.SRI_JS = "LOCAL"` after the page set `integrity` from JavaScript. A sibling script whose hash that page set, and which did not match, did not run. The meta list was present and did not contain the override source
- Firefox document rewrite, including the hash list, is unit-tested. BiDi still cannot open extension pages
- Not pushed

## Out of scope

npm publish, store upload, git push, rewriting documents when response rewriting is off, non-UTF-8 HTML, documents over 2 MiB, `innerHTML` / `insertAdjacentHTML` / `setAttributeNS`.

## Verification

`pnpm --filter @detour/extension test`, `pnpm --filter @detour/extension typecheck`, `pnpm --filter @detour/extension build`, `pnpm --filter @detour/extension build:firefox`, `CHROME=… pnpm --filter @detour/extension e2e:chrome`
