# Capability map

**Status:** Draft  
**Last updated:** 2026-10-09

`local-bridge` is Approved (Hamza, 2026-10-07): a Node CLI on `127.0.0.1`, not a backend. In-place fulfill (keep the original URL) is Approved the same day when response rewriting is allowed. See [local-bridge](local-bridge.md), ADR-012, and ADR-013.

`api-client` **Slices A + B + C** are Approved (Hamza, 2026-10-09; B/C via “Continue B/C”): options **API Tester** — Postman-class client, no backend. See [api-client](api-client.md) and plan [025](../plans/025-api-client.md).

`db-client` is **Approved** for Slices A–D + **Connection options** (Hamza, 2026-10-09): options **Databases** — native-messaging DB helper ([ADR-027](../DECISIONS.md)). See [db-client](db-client.md), plans [026](../plans/026-db-client.md) (Done) and [027](../plans/027-db-connection-options.md) (In Progress).

## Product intent

Detour lets developers **point production at their code** via rules compiled into the least-privilege engine. A **Developer workbench** (API Tester + Databases) extends that with free, local, account-free tools — see [PRODUCT.md](../PRODUCT.md).

## Module matrix

| Module | Capabilities | Engines |
|--------|--------------|---------|
| rule-model | Schema, groups, priority, valibot, import/export, RO import shape | — |
| engine-core | Redirect, modifyHeaders, block; urlFilter-first DNR apply | Core DNR |
| page-inject | Inject JS/CSS at document stages | Inject |
| api-mock | Mock fetch/XHR JSON/text/status | Mock |
| engine-deep | Body override via debugger (Chromium). Matching SRI hashes while that engine is armed, including integrity assigned from page JavaScript, carried in markup (`innerHTML`, `outerHTML`, shadow `innerHTML`, `insertAdjacentHTML`, `setHTMLUnsafe` with or without scripts, `Document.parseHTMLUnsafe`, `DOMParser` `text/html`), copied with `setAttributeNS`, moved with `setAttributeNode` / `setAttributeNodeNS`, adopted with `setNamedItem` / `setNamedItemNS`, or written with `Attr.value` once that attribute is on the element, carried in `document.write` / `document.writeln` markup (string arguments concatenated first), carried in an iframe's `srcdoc`, or carried in `createContextualFragment` markup that runs scripts. Nodes moved out of a `parseHTMLUnsafe` document keep that hash | Deep |
| local-bridge | Serve local folder; map URL → file. In-place when rewriting is allowed, else loopback redirect | Bridge CLI + Deep |
| workspace-ui | Popup, workspace, recipes, rule tester, dark default | — |
| observability | Badge, match log, compile errors | — |
| distribution | Stores, permissions copy, CI artifacts | — |
| api-client | API Tester A–C: send, collections, runner/load, OAuth/SigV4/Digest, cookies, GraphQL/WS/SSE, visualizer, folder sync, capture | Extension page fetch + DNR session headers |
| db-client | Databases: native host + adapters (A–D); Connection options v2 (Approved; plan 027) | Native messaging host (`com.detour.db`) |

## Non-goals (global)

- Detour-hosted backend / accounts
- Full MITM desktop proxy replacement
- Shipping rule bodies as telemetry

## Dependencies (build order)

`rule-model` → `engine-core` → (`page-inject` ∥ `api-mock`) → `engine-deep` → `local-bridge` → `workspace-ui` → `observability` → `distribution` → `api-client` (A–C Approved) → `db-client` (A–D via `026`; Connection options via `027`)

UI may prototype against mocks earlier, but production wiring follows Approved specs in order.

`distribution` is Approved for CI and packaging only (Hamza, 2026-10-07). `local-bridge` is Approved for the localhost file CLI and in-place fulfill (Hamza, 2026-10-07). npm publish of `@detour/cli` is still out of scope. `api-client` Slices A–C may implement (`025`). `db-client` A–D shipped (`026`); Connection options Approved — implement via `027`.
