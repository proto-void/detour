# 024 — overrideBody redirect delivery (RO 2.0 parity)

**Status:** Done  
**Date:** 2026-10-08  
**Spec:** [engine-deep](../specs/engine-deep.md), [engine-core](../specs/engine-core.md) — body redirect delivery Approved (Hamza, 2026-10-08)

## Goal

Add `overrideBody.delivery`: `redirect` (default, DNR `data:` URL like Resource Override 2.0 URL→File) and `inPlace` (existing CDP/filter path). Redirect works with DevTools open and needs no debugger consent. In place stays for CSP/SRI pages.

## Design

See the Approved specs and [ADR-025](../DECISIONS.md).

- Schema default `redirect`; rules without the field load as redirect
- engine-core compiles redirect delivery to `data:<mime>;charset=UTF-8;base64,…`
- engine-deep arms only `inPlace` (plus in-place `serveLocal`)
- RO `fileOverride` imports with `delivery: 'redirect'`
- Editor Delivery select; consent-aware in-place CTA via `bodyRewriteAllowed`

## Tasks

- [x] T1 ADR-025 + spec amendments; Approved (Hamza, 2026-10-08)
- [x] T2 Schema + tests
- [x] T3 Compile DNR data: URL + MIME inference + tests
- [x] T4 planBody / permissions / tester / report-view
- [x] T5 RO import
- [x] T6 BodyFields UI + prop drill
- [x] T7 Unit tests, typecheck, e2e redirect-JSON case, zip
- [x] T8 KB write-back

## Out of scope

npm publish, store upload, git push, binary bodies, changing SRI series behavior for in-place rules.

## Results (2026-10-08)

- 404 extension tests; typecheck clean
- Chrome for Testing 155: `pnpm e2e:chrome` 132/132 — redirect-delivery `switch.json` returns overridden JSON with no Allow debugger; default redirect replaces a script with DevTools/Puppeteer attached; in-place SRI series still passes after Delivery = in place + Allow debugger
- Zip: `extension/.output/detour-0.1.0-chrome.zip`
- Not pushed

## Verification

`pnpm --filter @detour/extension test`, `typecheck`, `e2e:chrome`, `zip`
