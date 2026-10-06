# Capability map

**Status:** Draft  
**Last updated:** 2026-10-07

`local-bridge` is Approved (Hamza, 2026-10-07): a Node CLI on `127.0.0.1`, not a backend. See [local-bridge](local-bridge.md) and ADR-012.

## Product intent

Detour lets developers **point production at their code** via rules compiled into the least-privilege engine.

## Module matrix

| Module | Capabilities | Engines |
|--------|--------------|---------|
| rule-model | Schema, groups, priority, valibot, import/export, RO import shape | — |
| engine-core | Redirect, modifyHeaders, block; urlFilter-first DNR apply | Core DNR |
| page-inject | Inject JS/CSS at document stages | Inject |
| api-mock | Mock fetch/XHR JSON/text/status | Mock |
| engine-deep | Body override via debugger (Chromium) | Deep |
| local-bridge | Serve local folder; map URL → file | Bridge CLI |
| workspace-ui | Popup, workspace, recipes, rule tester, dark default | — |
| observability | Badge, match log, compile errors | — |
| distribution | Stores, permissions copy, CI artifacts | — |

## Non-goals (global)

- Detour-hosted backend / accounts
- Full MITM desktop proxy replacement
- Shipping rule bodies as telemetry

## Dependencies (build order)

`rule-model` → `engine-core` → (`page-inject` ∥ `api-mock`) → `engine-deep` → `local-bridge` → `workspace-ui` → `observability` → `distribution`

UI may prototype against mocks earlier, but production wiring follows Approved specs in order.

`distribution` is Approved for CI and packaging only (Hamza, 2026-10-07). `local-bridge` is Approved for the localhost file CLI (Hamza, 2026-10-07). npm publish of `@detour/cli` is still out of scope.
