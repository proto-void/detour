# 026 — Databases (db-client Slices A–D)

**Status:** Done (live docker e2e needs local Docker daemon)  
**Date:** 2026-10-09  
**Spec:** [db-client](../specs/db-client.md) — Approved (Hamza, 2026-10-09).

## Goal

Ship the options **Databases** tab with a self-managing native-messaging helper (`com.detour.db`), all Approved engines (Cassandra → relational → NoSQL), pro tools, docker contract suite, SEA CI spike, and README.

## Checklist

### Gate

- [x] Spec Approved; indexes updated; this plan created
- [x] ADR-027 recorded

### Slice A — Cassandra + host + UI core

- [x] JSON-RPC native messaging, install/uninstall, keychain, Cassandra five targets, Databases tab

### Slice B — relational

- [x] `pg`, `mysql2`, `tedious`, `node:sqlite`, `oracledb` thin
- [x] SSH tunnels (`ssh2`)
- [x] Explain / transactions / applyEdits / CSV export
- [x] Object explorer + README blocks

### Slice C — NoSQL

- [x] MongoDB, Redis/Valkey, ClickHouse, Elasticsearch/OpenSearch, DynamoDB adapters + type-specific execute paths
- [x] README blocks

### Slice D — pro

- [x] ER diagram RPC, table designer DDL, schema/data compare, git folder sync, host-managed Local Bridge start/stop/status
- [x] Pro tools panel in Databases UI

### Verify

- [x] Unit tests (CLI + extension)
- [x] `docker-compose.db.yml` + `contract.e2e.test.ts` (skipped unless `DETOUR_DB_E2E=1`)
- [x] SEA spike script + CI `sea-db-host` matrix job
- [x] README Connect to a database (all shipped engines)
- [x] KB write-back
- [x] Dual zip

## Blockers / notes

- **Live docker e2e:** Docker daemon was not running in the agent environment. Framing/chunk tests always run; live adapters require `docker compose -f docker-compose.db.yml up -d …` then `DETOUR_DB_E2E=1 pnpm --filter @detour/cli test:db-e2e`.
- **SEA:** Local spike writes `cli/.sea/` without `postject` injection; CI installs `postject` and builds per OS. Day-to-day install remains `detour db install` (Node launcher). `ssh2` / `oracledb` native builds may need `pnpm approve-builds` on fresh clones.
- **No commit** unless Hamza asks.

## Verification

- `corepack pnpm --filter @detour/cli test`
- `corepack pnpm --filter @detour/extension test` + `typecheck`
- Dual zip paths under `extension/.output/{detour,rogers}/`
