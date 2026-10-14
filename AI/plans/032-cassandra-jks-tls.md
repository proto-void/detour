# Plan 032 — Java truststore/keystore (JKS/PKCS12) TLS

**Status:** Done (2026-10-09)  
**Spec:** [db-client](../specs/db-client.md) (Approved; JKS amend 2026-10-09)  
**Source:** Hamza — general dynamic solution (Spring YAML is reference only; no hardcoded hosts/DC/secrets)

## Goal

Let any Databases connection use optional **Java truststore** and **keystore** (JKS or PKCS12) paths + store passwords in the OS keychain, alongside existing PEM CA/cert/key. Host hydrates stores into PEM/`tls.Config` material when SSL mode ≠ Disable. Ship Cassandra-first; hydrate is shared so other engines reuse the same fields later.

## Locked decisions

- **No presets:** never hardcode contact points, datacenter, keyspace, or store paths/passwords.
- **Precedence (when mode ≠ disable):** truststore path (if set) supplies CA material and **overrides** `caPath`; keystore path (if set) supplies client cert+key and **overrides** `certPath`/`keyPath`. PEM paths remain valid when the corresponding store path is empty.
- **Passwords:** keychain kinds `:trustStorePass` and `:keyStorePass` (never chrome.storage / exports).
- **Blank local datacenter:** do not invent `datacenter1`.
- **Formats:** JKS and PKCS12 (`.jks` / `.keystore` / `.truststore` / `.p12` / `.pfx`).

## Checklist

- [x] Amend `AI/specs/db-client.md` SSL section + this plan + `AI/plans/README.md`
- [x] Model + fields: `tls.trustStorePath` / `tls.keyStorePath`; secret kinds; UI drafts
- [x] Node: `jks-js` + `resolveTlsFiles` store hydrate + tests
- [x] Go: keystore loader (JKS via keystore-go + PKCS12) in `HydrateTLS` + tests
- [x] RPC secret hydration `:trustStorePass` / `:keyStorePass` (Node + Go)
- [x] Stop inventing `datacenter1` (mapper + new-connection default)
- [x] Unit tests; dual zip; `extract-windows-helper-scripts` + `install:helper:local`; write-back gotchas

## Out of scope

- Per-alias picker when a keystore has multiple private keys (use first usable entry; document)
- Separate key password vs store password (use store password for both; PEM `:sslKeyPass` unchanged)
- Hardcoded Spring / Rogers QA connection presets

## Verification

- Blank local DC stays empty in Go/Node builders
- JKS truststore → CA PEMs; JKS keystore → cert+key; PKCS12 round-trip in unit tests (synthetic fixtures, no real secrets)
- Mode `disable` ignores store paths
- Dual zip + Windows extract + Mac `install:helper:local`
