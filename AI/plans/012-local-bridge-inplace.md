# 012 — Local Bridge in-place read

**Status:** Done  
**Date:** 2026-10-07  
**Spec:** [local-bridge](../specs/local-bridge.md) — Approved in-place slice (Hamza, 2026-10-07)

## Goal

A `serveLocal` rule keeps the production URL when the user has allowed response rewriting. The extension reads the file from the Local Bridge and fulfills the response in place, so a Content-Security-Policy that blocks `http://127.0.0.1` still runs the file. Without that consent, the rule stays a loopback redirect.

## Design

See the Approved spec and [ADR-013](../DECISIONS.md). Short version:

- Consent is the existing `bodyEngineConsent` (Allow debugger / Allow response rewriting). No new permission.
- Healthy bridge + consent → body engine, no DNR redirect. The service worker `GET`s `http://127.0.0.1` only. Token stays out of logs and out of the page URL.
- No consent → today’s opaque redirect.
- Not connected or bridge down → refuse, production URL unchanged.
- Fulfilled response is status 200, file `Content-Type`, `Cache-Control: no-store`. Over 8 MiB or a failed read leaves the production response.

## Tasks

- [x] T1 Spec Approved, this plan, ADR-013
- [x] T2 Read the bridge file in the extension; arm `serveLocal` on the body engine; skip the redirect when in place
- [x] T3 Chrome fulfill and Firefox filter use those bytes; consent fallback stays a redirect
- [x] T4 Rules-page copy for both modes
- [x] T5 Unit tests, typecheck, Chrome + Firefox builds
- [x] T6 Chrome e2e: CSP `script-src 'self'` on port 8001 still runs the disk script
- [x] T7 KB write-back

## Out of scope

npm publish, store upload, git push, HTTPS certificates, binding non-loopback hosts, SRI stripping, changing the RO file-override importer.

## Results (2026-10-07)

- 18 CLI tests; 351 extension tests; typecheck clean; chrome-mv3 and firefox-mv3 builds clean
- Chrome for Testing 155: `pnpm e2e:chrome` 68/68. After Allow debugger and Connect, `*:8001/bridge.js` ran `window.BRIDGE = "DISK"` and the script URL stayed on port 8001. `script-src 'self'` on that port still ran `window.CSP_BRIDGE = "DISK"` and the page did not request port 8099
- Without consent, unit tests still compile the opaque redirect. Firefox in-place is unit-tested. BiDi still cannot open extension pages
- Not pushed

## Verification

`pnpm --filter @detour/cli test`, `pnpm --filter @detour/extension test`, `pnpm --filter @detour/extension typecheck`, `pnpm --filter @detour/extension build`, `pnpm --filter @detour/extension build:firefox`, `CHROME=… pnpm --filter @detour/extension e2e:chrome`
