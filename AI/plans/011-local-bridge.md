# 011 — Local Bridge

**Status:** Done  
**Date:** 2026-10-07  
**Spec:** [local-bridge](../specs/local-bridge.md) — Approved (Hamza, 2026-10-07)

## Goal

An optional Node process serves a folder on `127.0.0.1`. A `serveLocal` rule redirects a production URL at one file in that folder after the user connects with the token the CLI prints. Inline `overrideBody` is unchanged.

## Design

See the Approved spec and [ADR-012](../DECISIONS.md). Short version:

- Protocol is localhost HTTP (the spec’s acceptance criteria). No WebSocket, no native messaging, no public bind.
- `detour bridge <folder> [--port 47321]` in `@detour/cli`. Root `pnpm-workspace.yaml` (ADR-004).
- Opaque file URL `http://127.0.0.1:<port>/d/<token>/<base64url path>` so `*.js` patterns do not loop.
- Extension key `bridgeSession` only after `/health` succeeds. Down or disconnected → refusal, no redirect.
- RO `fileOverride` stays `overrideBody`.

## Tasks

- [x] T1 Spec Approved, this plan, ADR-012
- [x] T2 CLI server, path jail, tests, workspace wiring
- [x] T3 `serveLocal` schema, compiler, connect UI, background probe
- [x] T4 Unit tests, typecheck, Chrome + Firefox builds
- [x] T5 Chrome e2e of one bridge-backed script; note the Firefox gap
- [x] T6 KB write-back

## Out of scope

In-place body reads from the bridge, HTTPS certificates, npm publish, binding non-loopback hosts, changing the RO file-override importer.

## Results (2026-10-07)

- 18 CLI tests (`node --test`); 342 extension tests; typecheck clean; chrome-mv3 and firefox-mv3 builds clean
- Chrome for Testing 155: `pnpm e2e:chrome` 65/65. After Connect, `*:8001/bridge.js` ran `window.BRIDGE = "DISK"` from the CLI folder
- Firefox: same DNR redirect, no extra permission. BiDi still cannot open extension pages, so the connect button was not driven there
- Deviation: none on protocol. In-place body fulfill (keep the original URL under a strict CSP) is left as a follow-up

## Verification

`pnpm --filter @detour/cli test`, `pnpm --filter @detour/extension test`, `pnpm --filter @detour/extension typecheck`, `pnpm --filter @detour/extension build`, `pnpm --filter @detour/extension build:firefox`, `CHROME=… pnpm --filter @detour/extension e2e:chrome`
