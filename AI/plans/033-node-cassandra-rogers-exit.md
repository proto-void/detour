---
name: Node Cassandra Rogers Exit
overview: "Delete the entire Rogers product (private rogers-detour repo + local tree + public Detour Rogers hooks), keep a single Node native host on MIT Detour, fix Cassandra TLS wiring in Node only, and reject Java migration."
todos:
  - id: phase-a0-delete-rogers-detour
    content: "Delete entire rogers-detour product: local checkout, GitHub repo HamzaKhan-Rogers/rogers-detour, Cursor workspace/multi-root refs, installed Rogers helper on this Mac if present"
    status: completed
  - id: phase-a1-public-rogers-scrub
    content: "Scrub public Detour of all Rogers product hooks (brand scripts, dual-zip DoD, extension-ids, AGENTS/rules/gotchas/PROGRESS pointers to rogers-detour)"
    status: completed
  - id: phase-b-node-sni
    content: "Node: forward servername+minVersion in cassandra-config; preserve in Keyspaces sslOptions rebuild"
    status: completed
  - id: phase-b-errors
    content: "Node: safe innerErrors summary in testConnection"
    status: completed
  - id: phase-b-tests-kb
    content: Unit tests + gotchas (SNI; no Java; Node helper reinstall; Rogers product gone)
    status: completed
  - id: phase-c-verify
    content: cli tests; Detour-only zip; reinstall Node helper; live smoke DC1+truststore
    status: completed
isProject: false
---

# Node Cassandra + full Rogers product exit

**Plan file when executing:** [`AI/plans/033-node-cassandra-rogers-exit.md`](AI/plans/033-node-cassandra-rogers-exit.md) (next number after 032)  
**Sources:** [`AI/research/cassandra-connect-handoff.md`](AI/research/cassandra-connect-handoff.md), investigation §15, Hamza direction 2026-10-23

## Decision lock (do not reopen in implementation)

### Runtime: Node only — no Java for Cassandra, no full Java migration

| Approach | Verdict |
|----------|---------|
| **Keep Node host + fix Cassandra TLS wiring** | **Chosen.** Public `com.detour.db` stays Node/`cassandra-driver`. Fix confirmed gaps (SNI, minVersion, Keyspaces merge, safer errors). |
| **Node host + Java Cassandra sidecar** | **Rejected.** Second runtime (JRE), dual install paths, worse UX for MIT OSS; does not fix Detour’s actual wiring bugs. |
| **Migrate entire DB host Node → Java** | **Rejected.** Multi-engine host already works in Node; Java rewrite is huge, forces JRE on every user, conflicts with thin SEA/native-messaging model. |

**MIT compliance:** Staying on Node + Apache-2.0 `cassandra-driver` keeps the public tree MIT-clean. A Java driver would be license-OK as a dependency but still fails the product bar. Do **not** add Java for connectivity. Post-fix cipher issues → OpenSSL/server TLS follow-up, not a language rewrite.

### Partner: delete the **entire Rogers product** — not only Go DB code

This plan removes the **Rogers Detour product end-to-end**, not a subset of `helper-go` Cassandra adapters.

**Rogers product includes (all gone):**

- Private repo **`https://github.com/HamzaKhan-Rogers/rogers-detour`** (entire project)
- Local checkout **`/Users/hamzakhan/rogers-detour`** (entire tree: `helper-go/`, `brand/rogers/`, pack scripts, `dist/`, private `AI/`, Go skills, install helpers, pickfile, minify extension pipeline, everything)
- Public Detour **Rogers integration surface** (dual-zip DoD, `zip:rogers`, brand=rogers install paths, docs/rules pointing agents at `rogers-detour`, gotchas for `install:helper:local` / `extract-windows-helper-scripts`)
- Cursor / multi-root workspace wiring that lists `rogers-detour` as a project root (if present)
- Live installed Rogers-built native host on developer machines (uninstall / replace with public Node helper so Databases does not keep talking to a deleted product’s binary)

**Explicitly not enough:** deleting only Cassandra/`gocql` files inside `helper-go/`, or “stop using Go for DB.” The product and repo go away.

## Phase A0 — Delete private Rogers product (`rogers-detour`)

Execute with Hamza confirmation before irreversible remote delete:

1. **Inventory** — Confirm remote `HamzaKhan-Rogers/rogers-detour`, local path, any clones, CI, submodule pins from public Detour (expect none required).
2. **Uninstall local helper** if Application Support / `%LOCALAPPDATA%` still has a Rogers-built `detour-db-host` — run public Detour uninstall or delete host registration so Chrome does not keep launching a dead product.
3. **Delete local tree** — remove `/Users/hamzakhan/rogers-detour` (entire directory).
4. **Delete GitHub repo** — `gh repo delete HamzaKhan-Rogers/rogers-detour` (or GitHub UI) after Hamza OK; no archive-required unless he asks to archive instead of delete.
5. **Workspace cleanup** — remove `rogers-detour` from Cursor multi-root / `.code-workspace` / agent rules that load that repo; drop always-on Rogers AGENTS pointers from sessions that assumed that root.
6. **Do not** merge Go source into public Detour. Do not keep a stub repo.

## Phase A1 — Scrub public MIT Detour of Rogers product hooks

Strip partner product plumbing so Detour is Detour-only:

- Extension/scripts: remove `zip:rogers` / `build:rogers`, root `pack:os:rogers`, Rogers branches in [`cli/src/db/extension-ids.ts`](cli/src/db/extension-ids.ts), [`cli/src/cli.ts`](cli/src/cli.ts) / [`cli/src/db/install.ts`](cli/src/db/install.ts) `--brand=rogers`.
- Simplify brand system to Detour-only if `DETOUR_BRAND=rogers` has no remaining purpose; otherwise keep generic brand hook without any Rogers slug.
- **AGENTS.md** / `.cursor/rules`: dual-zip Rogers DoD → **Detour zip only**; delete instructions that require `DETOUR_PUBLIC_DIR` + `pnpm install:helper:local` / `extract-windows-helper-scripts` from `rogers-detour`.
- KB: update [`AI/intelligence/architecture.md`](AI/intelligence/architecture.md), [`AI/intelligence/gotchas.md`](AI/intelligence/gotchas.md), [`AI/PROGRESS.md`](AI/PROGRESS.md), [`AI/research/cassandra-connect-handoff.md`](AI/research/cassandra-connect-handoff.md) so agents never open `rogers-detour`.
- [`AI/DECISIONS.md`](AI/DECISIONS.md): ADR-026/029/030 remain as **historical** closed decisions (“Rogers product retired”); mark plan [029](AI/plans/029-closed-rogers-native-helper.md) abandoned for delivery.
- Gitignored `extension/brands/rogers/` if present locally: delete; ensure it is not required for builds.
- Leave historical plan bodies in place; do not rewrite old checklist prose into fake “still shipping.”

## Phase B — Node Cassandra TLS fix (public Detour only)

Confirmed gaps in public Node path:

1. [`cli/src/db/adapters/cassandra-config.ts`](cli/src/db/adapters/cassandra-config.ts) — forward hydrated `tls.servername` and `tls.minVersion` into `sslOptions` (apache/dse/scylla, cosmos, keyspaces).
2. [`cli/src/db/adapters/cassandra.ts`](cli/src/db/adapters/cassandra.ts) — Keyspaces `sslOptions` rebuild must merge those fields (not only CA + rejectUnauthorized).
3. Same file — `testConnection`: safe per-node summaries from driver `innerErrors` (no secrets/config dumps).
4. Tests in [`cli/src/db/cassandra-config.test.ts`](cli/src/db/cassandra-config.test.ts) (+ Keyspaces assembly coverage).
5. Gotcha: SNI must reach driver; reinstall **public Node** helper after host change.

Smoke shape (redacted): contacts, `9042`, `DC1`, truststore/CA only, no client keystore unless required; Server name when connecting by IP.

## Phase C — Verify

- `corepack pnpm --filter @detour/cli test` + typecheck for touched files.
- Detour-only zip: `corepack pnpm --filter @detour/extension zip` (Rogers zip scripts gone / must fail if invoked).
- Confirm `rogers-detour` path and GitHub repo are gone; public tree has no active “use Rogers pack” DoD.
- Reinstall public Node helper; Test connection against QA cluster.
- If still failing: cipher/OpenSSL note + next plan — **not** Java, **not** resurrecting Rogers/Go.

## Out of scope

- Keeping any slice of `rogers-detour` (helper-only, brand-only, packs-only).
- Porting Go code into public Detour.
- Java runtime / Java driver / Node+Java hybrid.
- Cipher-suite UI until post-fix live failure proves need.
- Inventing `datacenter1`.

## Multitask-proof

- **Stream A0:** delete private product (repo + local + workspace) — exclusive ownership of `rogers-detour` lifecycle; no public Detour code edits until A0 inventory done.
- **Stream A1:** public Detour Rogers scrub (scripts/rules/docs/ids) — no Cassandra adapter edits.
- **Stream B:** `cli/src/db/adapters/cassandra*.ts` + tests only — after or parallel to A1 if file disjoint.
- **Verify last.** Shared: `PROGRESS.md` append-only.
- Leave alone: unrelated Detour modules; do not delete `proto-void/detour` or `detour-web`.
