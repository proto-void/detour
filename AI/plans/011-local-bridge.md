# 011 — Local Bridge

**Status:** In progress  
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

- [ ] T1 Spec Approved, this plan, ADR-012
- [ ] T2 CLI server, path jail, tests, workspace wiring
- [ ] T3 `serveLocal` schema, compiler, connect UI, background probe
- [ ] T4 Unit tests, typecheck, Chrome + Firefox builds
- [ ] T5 Chrome e2e of one bridge-backed script; note the Firefox gap
- [ ] T6 KB write-back

## Out of scope

In-place body reads from the bridge, HTTPS certificates, npm publish, binding non-loopback hosts, changing the RO file-override importer.

## Verification

`pnpm --filter @detour/cli test`, `pnpm --filter @detour/extension test`, `pnpm --filter @detour/extension typecheck`, `pnpm --filter @detour/extension build`, `pnpm --filter @detour/extension build:firefox`, `CHROME=… pnpm --filter @detour/extension e2e:chrome`
