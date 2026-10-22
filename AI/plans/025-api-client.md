# 025 — API Tester (api-client Slices A–C)

**Status:** Done  
**Date:** 2026-10-09  
**Spec:** [api-client](../specs/api-client.md) — Slices A + B + C Approved (Hamza, 2026-10-09).

## Goal

Ship the options **API Tester** (Postman-class client, no backend): A core + B power + C advanced (OAuth/SigV4/Digest, cookies, GraphQL/WS/SSE, visualizer, folder sync, capture).

## Checklist

### Gate

- [x] Spec Slice A Approved
- [x] Spec Slice B Approved (Hamza “Continue B”)
- [x] Spec Slice C Approved (Hamza “Continue C”, 2026-10-09)

### Slice A — Done

- [x] Core client (see prior checklist)

### Slice B — Done

- [x] Runner, load, schedule, codegen, diff, OpenAPI/HAR, docs, synergy

### Slice C — modules

- [x] `oauth.ts` / `pkce.ts` — auth code+PKCE, client credentials, password, refresh
- [x] `sigv4.ts` — AWS Signature V4
- [x] `digest.ts` — Digest auth
- [x] `cookie-jar.ts` — optional cookies permission + jar
- [x] `graphql.ts` — body + introspection helpers
- [x] `websocket-client.ts` / `sse-client.ts` — clients + log model
- [x] Visualizer protocol in sandbox + `visualizer.ts`
- [x] `folder-sync.ts` — File System Access; Firefox manual fallback
- [x] Capture handoff: DevTools + match log → API Tester tab

### Slice C — UI

- [x] Auth editors (OAuth/SigV4/Digest) in request Auth tab
- [x] Cookie jar panel
- [x] GraphQL body mode; WS/SSE request kinds
- [x] Visualize response tab
- [x] Folder sync controls + git-share copy
- [x] Send to API Tester from DevTools / Log

### Slice C — verify

- [x] Unit tests (SigV4 vectors, PKCE, digest, etc.) — 515 total
- [x] typecheck clean
- [x] e2e where feasible (existing suite; WS echo optional later)
- [x] KB write-back (ADR-028 C amend)
- [x] Dual zip

## Out of scope

- Accounts/cloud, hosted mocks, closed-browser monitors, gRPC, paid AI, form-data file uploads, Postman.com
- Committing unless Hamza asks

## Verification

- Unit 515 + typecheck + dual zip:
  - `extension/.output/detour/detour-0.1.0-chrome.zip`
  - `extension/.output/rogers/rogers-0.1.0-chrome.zip`
