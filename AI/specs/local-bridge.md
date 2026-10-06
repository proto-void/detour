# Spec: local-bridge

**Status:** Draft  
**Last updated:** 2026-10-06  
**Build order:** 6  
**Depends on:** rule-model, engine-core

## Objective

Ship an optional **Node CLI Local Bridge** that serves a local folder (or file map) over loopback so Detour rules can point production URLs at on-disk builds — addressing RO #54/#2 without paste-into-extension.

## User stories

- As a developer, I can run `detour bridge ./dist` and map `https://cdn.example.com/app.js` → local file.
- As a developer, I can use my external editor on disk; refresh picks up changes (with sensible cache headers).
- As a developer, I can work without the Bridge using pure Core rules.

## Acceptance criteria

- [ ] CLI starts loopback HTTP server (bind `127.0.0.1` default)
- [ ] Extension can discover/connect to Bridge (token or ephemeral port handshake TBD)
- [ ] Rule type or target URI scheme for Bridge-backed files
- [ ] Path traversal protection — cannot read outside allowed root
- [ ] Clear error when Bridge is down but rules require it
- [ ] npm package name scoped (e.g. `@detour/cli`) — unscoped `detour` taken

## Browser support table

| Browser | Min | Bridge consumer |
|---------|-----|-----------------|
| Chrome / Edge / Brave | 120+ | Redirect/fetch to loopback |
| Firefox | 128 ESR+ | Same |
| Safari | 17+ | Verify loopback + ATS |

## Limits and gotchas

- Mixed content: HTTPS page → `http://127.0.0.1` may be blocked; may need HTTPS local cert strategy or extension redirect tricks
- CORS on loopback responses
- Do not expose Bridge on `0.0.0.0` by default

## Out of scope

- Cloud file sync
- Replacing Proxyman/Charles MITM
- Remote (non-loopback) bridge in V1

## Verification

- CLI serves fixture file; curl localhost succeeds
- Path traversal attempts return 403/404
- Extension rule hits local file when Bridge up; actionable error when down
