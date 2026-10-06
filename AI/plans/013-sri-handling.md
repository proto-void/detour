# 013 — Subresource Integrity hashes

**Status:** Done  
**Date:** 2026-10-07  
**Spec:** [engine-deep](../specs/engine-deep.md) — SRI slice Approved (Hamza, 2026-10-07)

## Goal

When an `overrideBody` or in-place `serveLocal` rule is armed, a script or stylesheet tag that matches it gets a SHA-384 `integrity` of the bytes Detour will serve. The browser still checks that hash. Other tags keep the page's hashes.

## Design

See the Approved spec and [ADR-014](../DECISIONS.md).

The HTML parser copies `integrity` onto the request when it prepares a script, before page JavaScript runs. A MAIN-world hook cannot see that write. Detour rewrites the document instead:

- Chrome: Fetch pattern `resourceType: Document` (a bare `*` pattern already pauses documents). Fulfill the HTML.
- Firefox: `filterResponseData` on the document, opened from `onBeforeRequest`.
- Hash and body come from the same read. A failed read leaves the published hash.
- UTF-8 HTML only, 2 MiB cap. Rewriting off means the redirect path does not change the document.

## Tasks

- [x] T1 Spec Approved, this plan, ADR-014
- [x] T2 Pure rewrite: matching tag, sibling tag, relative URL, stylesheet, failed read, non-HTML, size cap
- [x] T3 Chrome fulfill and Firefox filter use it for documents. Script and file fulfill use the same bytes
- [x] T4 Rules-page copy: hash is updated, other files keep theirs, redirect does not rewrite
- [x] T5 Unit tests, typecheck, Chrome + Firefox builds
- [x] T6 Chrome e2e: production hash, override runs; valid sibling runs; bad sibling stays blocked. In-place file too
- [x] T7 KB write-back

## Results (2026-10-07)

- 363 extension tests; typecheck clean; chrome-mv3 and firefox-mv3 builds clean
- Chrome for Testing 155: `pnpm e2e:chrome` 72/72. `*:8001/sri.js` ran `window.SRI = "LOCAL"` even though the tag's hash was of the production file. A sibling with a valid hash ran. A sibling with a bad hash did not. In-place `sri-disk.js` ran `window.SRI_DISK = "DISK"` the same way
- Firefox document rewrite is unit-tested. BiDi still cannot open extension pages
- Not pushed

## Out of scope

npm publish, store upload, git push, JavaScript that sets `integrity` after parse, rewriting documents when response rewriting is off, non-UTF-8 HTML, documents over 2 MiB.

## Verification

`pnpm --filter @detour/extension test`, `pnpm --filter @detour/extension typecheck`, `pnpm --filter @detour/extension build`, `pnpm --filter @detour/extension build:firefox`, `CHROME=… pnpm --filter @detour/extension e2e:chrome`
