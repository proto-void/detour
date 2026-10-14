# 027 — DB connection options parity

**Status:** Done (live TLS/SSH/SOCKS compose e2e soft-skips when Docker/profile services are down)  
**Date:** 2026-10-09  
**Spec:** [db-client](../specs/db-client.md) — Slices A–D + **Connection options** Approved (Hamza, 2026-10-09).  
**Cursor plan source:** `db_connection_options_parity_4062430d.plan.md`

## Goal

Ship nested DbConnection v2, host path/SSH/proxy/secret support, per-engine config mappers, declarative connection modal UX, compose e2e for TLS/SSH/SOCKS, and README/KB/dual-zip.

## Gate

- [x] Hamza Approves **Connection options** in `AI/specs/db-client.md`
- [x] Spec Status flipped; implementation started

## Checklist

### Model

- [x] `DbConnection` v2: nested `tls` / `ssh` / `proxy` / `advanced` / `engineOptions` / `passwordStorage` / `driverProperties`
- [x] Load-time migration from flat `tlsEnabled` / `tlsRejectUnauthorized` / flat SSH
- [x] Unit tests for schema + migration

### Host networking

- [x] Path resolver (`~` expand, read, clear missing/unreadable errors)
- [x] Extra keychain kinds (`:sslKeyPass`, `:sshKeyPass`, `:sshPass`, `:proxyPass`, `:walletPass`, …)
- [x] SSH agent / passphrase / `known_hosts` / jump chain
- [x] SOCKS5 / HTTP CONNECT proxy
- [x] `pickFile` JSON-RPC

### Mappers

- [x] Per-engine pure `*-config.ts` for all engines
- [x] Wire Kerberos / Entra / AWS IAM-SigV4 markers where in scope (config-tested; no fake drivers)
- [x] Mark driver-unsupported combos honestly (`pg` GSSAPI, `mysql2` Kerberos)
- [x] Unit tests per mapper

### UI

- [x] Declarative field descriptors (`fields.ts`)
- [x] Modal UX per Approved Connection options
- [x] Existing options tokens only (Detour + Rogers)

### E2E

- [x] Extend `docker-compose.db.yml`: TLS Postgres, OpenSSH bastion, SOCKS, TLS Redis (+ cert generator)
- [x] `DETOUR_DB_E2E` cases added (soft-skip when services/certs absent); compose down + quit Docker when used

### Docs / ship

- [x] README per-engine / connection-options sections
- [x] KB write-back
- [x] Typecheck + unit tests
- [x] Dual zip (Detour + Rogers)

## Out of scope

- Faking Kerberos on drivers that cannot support it
- Storing cert/key bytes in extension storage
- Detour-hosted secret sync

## Verification

Unit mappers/migration/descriptors green; compose TLS/SSH/SOCKS soft-skip when Docker down; dual zip under `extension/.output/{detour,rogers}/`.

## Notes

- No commit unless Hamza asks.
- Live docker e2e still needs a running Docker daemon + `--profile tls` for the new services.
