# Plan 030 — SSL TablePlus UX (always-visible paths + encrypted-key modal)

**Status:** Done (2026-10-09)  
**Spec:** [db-client](../specs/db-client.md) (Approved; SSL UX amend 2026-10-09)  
**Source:** Cursor plan `ssl_tableplus_ux_a6129060.plan.md` (Hamza “Go”)

## Goal

Align Databases SSL UX with TablePlus: CA / client cert / client key always visible under SSL (mode controls application, not visibility); prompt for key passphrase only when the client key PEM is encrypted.

## Locked decisions

- **1A:** Always show CA / client cert / client key (including Disable). Host ignores paths when mode is `disable`.
- **Key-only / cert-only (amend 2026-10-09):** TablePlus docs do **not** require cert+key together. Detour must **not** IncompletePair-fail when TLS is on and only key (or only cert) is set — pass material present to the driver; let server/driver error if a full pair is required. (Previously out of scope; Hamza locked key-only in scope.)
- **2B:** Passphrase modal only for encrypted client keys (`inspectPemKey`); not for CA/cert or unencrypted keys.

## Checklist

- [x] Amend `AI/specs/db-client.md` SSL UX; this plan + `AI/plans/README.md` index
- [x] `fields.ts`: one always-visible CA; always-visible cert/key; remove inline key passphrase; update `fields.test.ts`
- [x] Node `inspectPemKey` helper + host RPC + capability; unit tests
- [x] Go helper `inspectPemKey` + capability + tests (parity)
- [x] `Databases.svelte`: encrypted-key modal on key Browse/blur; Update link; pre-Test/Connect guard
- [x] Optional Node Cassandra IncompletePair parity (later **removed** — see key-only amend)
- [x] Unit tests; dual zip; Go test + `pack:all`/`pack:verify` if helper changed; write-back gotchas / PROGRESS
- [x] **Amend:** drop IncompletePair host gate (Go + Node); key-only / cert-only allowed; tests + gotchas + `db-client.md` (2026-10-09)

## Out of scope

- Java truststore/keystore
- Passphrase prompts for CA or client certificate

## Verification

- Field visibility at `disable` / `required` / `verify-full`
- PEM inspect: encrypted / plaintext / garbage
- Key-only + TLS on: no IncompletePair; material reaches driver
- Dual-zip DoD only if extension copy changes; Rogers pack refresh when Go helper changes
