# Spec: db-client

**Status:** Approved — **Slices A–D** + **Connection options** + **OS packs setup** + **partner-helper public hooks** (Hamza, 2026-10-09).  
**Last updated:** 2026-10-09 (TLS: optional JKS/PKCS12 truststore+keystore; no invent local DC; key-only allowed)  
**Approved by:** Hamza (2026-10-09) — Slices A–D; Connection options; OS packs amendment; partner-helper public hooks (“Go and approved” on closed Rogers native helper plan)  
**Build order:** 11  
**Depends on:** workspace-ui (options tabs), distribution (optional permissions / packaging notes / OS packs), `@detour/cli` package layout (Local Bridge already ships)  
**Related:** [local-bridge](local-bridge.md) (stays loopback HTTP — intentional difference), [api-client](api-client.md) (collections naming, never say “workspace”), [000-capability-map](000-capability-map.md), [ADR-027](../DECISIONS.md), [ADR-029](../DECISIONS.md), [ADR-030](../DECISIONS.md), [distribution](distribution.md)  
**Plan:** [026-db-client](../plans/026-db-client.md) (A–D Done). Connection options: [027-db-connection-options](../plans/027-db-connection-options.md) (Done). OS packs: [028-os-packs](../plans/028-os-packs.md). Partner hooks: [029-closed-rogers-native-helper](../plans/029-closed-rogers-native-helper.md).

## Product name

Options tab **Databases**, subtitle: *Connect to local or production databases, run queries, and save them*.

UI copy must **never** say “workspace” for query storage — `Workspace` already means the rules container in rule-model. Saved queries live in **query collections** with folders (same vocabulary as API Tester).

## Objective

Ship a DBeaver / TablePlus–class **database client inside Detour** with **no Detour backend**, **no account**, and **MIT / free** forever. A local helper process, started and stopped automatically through **browser native messaging**, runs open-source drivers against the user’s own local or production databases. Cassandra (all five targets below) comes first in Slice A; relational and other NoSQL engines follow in later slices. Production safety rails are required.

## Locked decisions (Hamza / plan)

- Everything free and open source (drivers MIT or Apache-2.0). Building and testing never need a cloud account (not even a free tier).
- Helper is **self-managing** via native messaging ([ADR-027](../DECISIONS.md)) — not loopback HTTP.
- Cassandra family first; every Cassandra target supported in Slice A. Other databases also ship in version 1 across slices B/C.
- Secrets only in OS keychain on the host; extension storage holds metadata only; exports never include secrets.
- Each slice may be **Approved independently**. Implementation and plan `026` work only for Approved slice(s).

## Architecture notes (planned — not built)

```
Databases tab (options)
  → optional nativeMessaging permission (first use)
  → browser.runtime.connectNative('com.detour.db') on demand
  → detour-db native host (Node / SEA)
       → driver adapters (cassandra-driver, pg, mysql2, tedious, …)
       → ssh2 tunnels
       → OS keychain (@napi-rs/keyring)
       → query collections folder (git-friendly JSON)
  → storage.local: connection metadata, open tabs, history (no secrets)
```

| Concern | Plan |
|---------|------|
| Module (extension) | Logic under `extension/src/db-client/` (protocol client, safety rails, collection export, connection metadata). UI in options entrypoints. |
| Module (host) | `cli/src/db/` — JSON-RPC host, adapters, installer, SEA build. Share `@detour/cli` package. |
| Lifecycle | Port held by options page. Close tab / Stop helper / idle (default 15 min, configurable) → disconnect → host exits on stdin end. Status pill + Restart. |
| Protocol | JSON-RPC: `hello` (handshake), `version`, `connect`, `testConnection`, `listObjects`, `describe`, `execute`, `fetchPage`, `cancel`, `close`, `saveCollection`, `readCollections`, …. Chunk results ≤ ~900 KB; paging explicit. |
| Host name | Brand-configurable `nativeHostName` (default `com.detour.db`). Partners may use a distinct name so helpers can coexist. |
| Adapter interface | `connect`, `listObjects`, `describe`, `execute`, `explain?`, `cancel`, `close` in `cli/src/db/adapters/<name>.ts`. |
| One-time setup | **Preferred:** OS pack from GitHub Releases — load unpacked `extension/`, double-click Install helper (SEA self-installs to a per-user dir). **Developers:** `detour db install` / `db uninstall` from the repo (Node launcher). Manifests for Chrome/Edge/Brave/Chromium/Firefox; Windows registry. Missing host → guided setup card (OS-aware pack link + Developers disclosure). |
| Local Bridge | Remains HTTP ([local-bridge](local-bridge.md)). Unchanged by Slice A–C. Slice D may optionally host-manage Local Bridge. |
| Stable extension id | Fixed public Chrome manifest `key` per brand (Detour committed; Rogers gitignored). Installer writes `allowed_origins` for unpacked id + known store id(s). No required `--extension-id` for pack install. Private key never in repo ([ADR-029](../DECISIONS.md)). |
| Helper install dir | macOS `~/Library/Application Support/Detour/db-host/`; Windows `%LOCALAPPDATA%\Detour\db-host\`; Linux `${XDG_DATA_HOME:-~/.local/share}/detour/db-host/`. Manifest `path` = SEA binary. |

---

## Approved scope — Slice A: Cassandra first (native host + UI core)

### User stories

- As a developer, I open **Databases**, grant optional `nativeMessaging` once, and the helper starts when I need it and stops when I leave or go idle.
- As a developer with no host installed, I see a setup card with my OS’s pack download (GitHub Releases) and install steps, then **Helper: Ready**. Developers who prefer Node still find the `pnpm` / `detour db install` path under a disclosure.
- As a developer, I save many Cassandra connections (groups, colors, Local / Staging / Production), paste a URL, configure TLS, and **Test connection**.
- As a developer, I browse keyspaces / tables / MVs / UDTs / indexes / nodes from `system_schema`, run CQL with consistency and paging, view tracing, and save queries in collections.
- As a developer on Production, connections default read-only; destructive CQL needs confirmation (typed name on production).

### Acceptance criteria

- [ ] Options tab **Databases** with subtitle above; status pill (Ready / Stopped / missing + version + open connections); **Stop helper** / **Restart helper**
- [ ] `nativeMessaging` optional; requested on first tab use; Detour usable without it (other tabs)
- [ ] `connectNative('com.detour.db')` on demand; idle timeout (default 15 min); exit when port closes / stdin ends
- [ ] Host installer: Chrome, Edge, Brave, Chromium, Firefox manifests; Windows registry; `db install` / `db uninstall`; SEA spike confirmed for Slice A drivers
- [ ] Keychain secrets; metadata-only in extension storage; export/import collections without secrets
- [ ] JSON-RPC with chunking under 1 MB and cancel by request id
- [ ] Cassandra adapter (`cassandra-driver`, Apache-2.0) for:
  - Apache Cassandra 3.x/4.x/5.x and DSE (TLS, password, contact points, local DC)
  - ScyllaDB
  - DataStax Astra (secure connect bundle + token the user already has)
  - AWS Keyspaces (TLS + Starfield CA bundled; service-specific credentials or SigV4 via `aws-sigv4-auth-cassandra-plugin`)
  - Azure Cosmos DB for Apache Cassandra (TLS, port 10350, account key)
- [ ] Connection manager: groups/folders, search, color, env label, URL paste, TLS (CA / client cert / skip-verify with warning), Test, duplicate
- [ ] Object explorer from `system_schema`; DESCRIBE-style DDL; consistency + serial consistency + page size; tracing view; ALLOW FILTERING / missing partition key / unbounded scan warnings
- [ ] CQL editor (CodeMirror): multi tabs; run statement / selection / script; params; format; cancel; timeout; default row limit 500
- [ ] Virtualized results grid: sort/filter loaded page; Load next page; copy CSV/JSON; JSON cell viewer; messages + timing
- [ ] Query collections + folders; history per connection; production read-only default with timed unlock; confirm DROP/TRUNCATE/ALTER and DELETE/UPDATE without WHERE (plus Cassandra partition/table wipe cases); typed-name confirm on production
- [ ] Keyboard accessible; no color-only status; works in Detour and Rogers brand zips

### Slice A out of scope

Relational adapters, SSH tunnels, explain plans, transactions, inline edit, Mongo/Redis/ClickHouse/ES/DynamoDB, ER diagram, table designer, schema/data compare, git folder sync, host-managed Local Bridge — Slices B–D.

---

## Approved scope — Slice B: relational (shipped)

### User stories

- As a developer, I connect to Postgres (and compatibles), MySQL/MariaDB/TiDB, SQL Server/Azure SQL, SQLite file, or Oracle thin mode.
- As a developer, I reach a DB through an SSH bastion.
- As a developer, I run explain plans, use manual transactions, edit cells with pending Commit/Discard, and export/import CSV/JSON/SQL.

### Acceptance criteria

- [ ] Adapters: `pg` (MIT), `mysql2` (MIT), `tedious` (MIT), `node:sqlite` (Node 22+), `oracledb` thin (no Instant Client)
- [ ] SSH tunnels via `ssh2` (MIT) with key or password
- [ ] Explain plan UI (visual tree Postgres/MySQL; SSMS-style SQL Server)
- [ ] Manual transaction mode Commit/Rollback
- [ ] Inline edit: pending statements preview; Commit / Discard; disabled on read-only
- [ ] Export CSV/JSON/SQL; CSV import
- [ ] Object explorer: databases, schemas, tables/views/functions/indexes/FKs
- [ ] README connection blocks for each relational engine (only after it works)

### Slice B out of scope

Mongo/Redis/ClickHouse/ES/DynamoDB; pro tools (ER, designer, compare, git sync) — C/D.

---

## Approved scope — Slice C: non-relational (shipped)

### User stories

- As a developer, I use MongoDB (documents + aggregation), Redis/Valkey (key browser + typed editors + CLI), ClickHouse, Elasticsearch/OpenSearch (query DSL), and DynamoDB (scan/query builder, PartiQL; DynamoDB Local for tests).

### Acceptance criteria

- [ ] Adapters: `mongodb` (Apache-2.0), `ioredis` (MIT), `@clickhouse/client` (Apache-2.0), official ES/OpenSearch clients (Apache-2.0), AWS SDK v3 DynamoDB (Apache-2.0)
- [ ] Type-specific editors as in Objective / plan
- [ ] README blocks only for engines that ship

### Slice C out of scope

Pro tools in Slice D; cloud warehouses out of version 1.

---

## Approved scope — Slice D: pro (shipped)

### User stories

- As a developer, I view an ER diagram from FKs, design tables with DDL preview, compare schemas or one table’s data, and sync query collections to a git folder.
- As a developer, I optionally let the native host start/stop the existing Local Bridge file server so that becomes self-managing too.

### Acceptance criteria

- [ ] ER diagram from FKs
- [ ] Table designer (create/alter UI + DDL preview)
- [ ] Schema compare → DDL diff; data compare for one table
- [ ] Git folder sync for collections (pretty JSON, secrets excluded)
- [ ] Optional: host-managed Local Bridge lifecycle (does not change HTTP protocol)

### Slice D out of scope

Anything in global Out of scope below.

---

## Connection options (Approved)

**Status of this section:** **Approved** (Hamza, 2026-10-09). Extends Slices A–D with TablePlus / DBeaver / SSMS / Compass / RedisInsight / SQL Developer–class options. Hard nos unchanged: no Detour backend, no accounts, secrets stay in the OS keychain on the host, MIT drivers only. Driver-gated limits below remain honest (do not fake unsupported Kerberos/GSSAPI).

**Plan:** [027-db-connection-options](../plans/027-db-connection-options.md).

### Objective (this amendment)

Bring every Databases-tab engine up to a full shared General / SSL / SSH / Proxy / Advanced set plus per-engine auth and driver options. Certificate and key **files are referenced by path** and read by the native host at connect time. All auth methods listed below are in product scope, including Kerberos and Entra interactive where the driver supports them; unsupported driver combinations are marked in the UI (not faked).

### User stories

- As a developer, I create a connection named **New Connection** by default, pick a database type (and variant when it applies), fill a short Basic form, and optionally expand Advanced groups for auth, TLS, SSH, proxy, and driver options.
- As a developer, I browse for CA/cert/key/wallet files via a native file picker (`pickFile` RPC); paths are stored, not file contents.
- As a developer, I use password storage **Keychain** / **Ask every time** / **Don't store**, and store TLS/SSH/proxy/wallet passphrases under separate keychain kinds.
- As a developer, I Test, Save, or Connect from the modal footer and see inline latency or a clear error.
- As a developer on an older connection, my flat `tlsEnabled` / `tlsRejectUnauthorized` / flat SSH fields migrate on load into the nested v2 shape without losing settings.

### Acceptance criteria

- [ ] Shared nested connection shape: `tls`, `ssh`, `proxy`, `advanced`, discriminated `engineOptions`, `passwordStorage`, optional `driverProperties`
- [ ] Load-time migration from flat TLS/SSH to v2; export remains secret-free; paths exported as-is
- [ ] Host expands `~`, reads file paths at connect, returns clear missing/unreadable errors; never stores file bytes in `chrome.storage`
- [ ] Extra keychain kinds: e.g. `:sslKeyPass`, `:trustStorePass`, `:keyStorePass`, `:sshKeyPass`, `:sshPass`, `:proxyPass`, `:walletPass` (plus existing password kinds)
- [ ] SSH: password / private key / agent (`SSH_AUTH_SOCK`); passphrase; keepalive; strict host-key vs `~/.ssh/known_hosts`; optional jump-host chain (`ProxyJump`)
- [ ] Proxy: none / SOCKS5 / HTTP CONNECT with host, port, user, password
- [ ] Declarative field descriptors per engine drive the form (no long if/else markup chain)
- [ ] Per-engine pure `*-config.ts` mappers (unit-tested) map connection + resolved secrets/files → driver options
- [ ] UX: default name `New Connection`; type + variant dropdowns; Basic + collapsed Advanced groups with status summaries; Import from URL; Test / Save / Connect; existing options-page tokens only (Detour + Rogers)
- [ ] `pickFile` JSON-RPC on the host; Browse beside path inputs
- [ ] Driver-gated risks documented in UI tooltips where support is missing (see below)
- [ ] Verification: unit mappers + migration + descriptors; compose TLS/SSH/SOCKS e2e; Kerberos/Entra/IAM configuration-tested only; dual zip after ship

### Architecture (planned)

```
engine field descriptors (extension) → Connection modal: Basic + collapsible Advanced
  → DbConnection v2 (no secrets) + setSecret → OS keychain via host
  → connect / testConnection RPC → native host
       → resolve paths + secrets
       → per-engine pure mapper → driver options
       → network handlers: SSH jump chain, SOCKS/HTTP proxy
```

| Concern | Plan |
|---------|------|
| Schema | `DbConnection` v2 in `extension/src/db-client/model.ts` (valibot); migrate on load |
| Field UI | Declarative descriptors in `extension/src/db-client/fields.ts` |
| Files | Absolute paths (with `~` expanded by host); host reads at connect; `pickFile` RPC |
| Mappers | `cli/src/db/adapters/*-config.ts` (pattern of existing `cassandra-config.ts`) |
| Secrets | Keychain only; kinds for password + passphrase/proxy/wallet as needed |

### UX — New Connection modal

- **Default name:** `New Connection` (not `New ${engine}`). Name does **not** change when the engine dropdown changes. If left untouched, Save may suggest `host:port` or the engine label.
- **Top row:** **Database type** dropdown; **Variant** only when applicable (Cassandra family; MySQL vs MariaDB; Elasticsearch vs OpenSearch). Changing type resets port to the engine default **only if** the port was never edited.
- **Basic (always visible):** Name; type (+ variant); Host + Port on one row (or file path / URI / region-endpoint); User; Password + storage dropdown (Keychain / Ask every time / Don't store); Database/keyspace; Environment tag + color. At most ~8 Basic fields per engine.
- **Advanced (collapsed by default):** Authentication (method dropdown reveals fields); SSL/TLS (mode dropdown; **CA / client cert / client key** and optional **Java truststore / keystore** path fields always visible under SSL — mode controls whether the host **applies** those paths, not whether the fields show; when mode is Disable the host ignores path contents); SSH tunnel (off by default); Proxy; Driver options; Advanced (timeouts, init statements, driver properties key/value). Collapsed headers show status summaries (e.g. `SSL: Verify Full`, `SSH: off`).
- **Client key passphrase:** not an inline SSL field. After Browse (or path blur) on the **client key** path only, the host `inspectPemKey` RPC reports whether the PEM is encrypted (`ENCRYPTED PRIVATE KEY` or legacy `Proc-Type: 4,ENCRYPTED`). If encrypted, show a TablePlus-style “Private key password” modal; confirm writes a draft that saves to keychain as `:sslKeyPass` on Save/Connect (same hydration as today). Unencrypted keys do not prompt. CA and client certificate Browse never ask for a passphrase. Optional “Update key passphrase…” when a key path is set. On Test/Connect with TLS applied, an encrypted key and no passphrase opens the modal before proceeding. When TLS is applied, Detour does **not** require cert+key as a pair (TablePlus docs are silent; Hamza locked key-only): pass whatever client material is present to the driver; let the server/driver error if a full pair is truly required. Cert-only is allowed the same way. Mode `disable` still ignores path bytes.
- **Java truststore / keystore (JKS or PKCS12):** optional paths `tls.trustStorePath` / `tls.keyStorePath` plus keychain passwords `:trustStorePass` / `:keyStorePass` (ephemeral UI drafts; never chrome.storage or exports). Host hydrates stores into CA / client cert+key PEMs at connect when mode ≠ Disable. **Precedence:** if truststore path is set it supplies CA material and overrides `caPath`; if keystore path is set it supplies client identity and overrides `certPath`/`keyPath`. PEM-only connections remain unchanged when store paths are empty. No hardcoded hosts, DCs, or store paths — each connection configures its own. First ship: Cassandra (and any engine that already consumes hydrated `tls.ca`/`cert`/`key`).
- **Import from URL:** small link at top; fills Basic and any advanced fields found.
- **Footer:** Test / Connect failures use `warn` + `role="alert"` with a **Connection failed** prefix and the full host message; success / progress stay muted (latency or “Testing…”).
- **Design:** existing options-page tokens/components only; two-column label/field grid; dropdowns over checkbox rows; helper text only for non-obvious choices; inline validation. No new UI library.
- **File fields:** path text input + Browse (`pickFile`) + clear. Typed paths accepted.

### Shared sections (network engines)

| Section | Fields |
|---------|--------|
| **General** | name, group, status color, tag/environment, host, port, user, password, password storage, database, read-only; Test / Save / Connect |
| **SSL/TLS** | mode picklist mapped per engine (Disable / Allow / Preferred / Required / Verify CA / Verify Full); CA path; client cert path; client key path; optional Java truststore path + `:trustStorePass`; optional Java keystore path + `:keyStorePass` (JKS/PKCS12; always shown; applied only when mode ≠ Disable; store paths override matching PEM paths); key passphrase via encrypted-key modal → `:sslKeyPass`; SNI / server-name override; minimum TLS version |
| **SSH** | enable; host; port; user; auth (Password / Private key / Agent); key path; passphrase; keepalive; strict host-key (`known_hosts`); optional jump-host chain |
| **Proxy** | none / SOCKS5 / HTTP CONNECT; host; port; user; password |
| **Advanced** | connect timeout; query timeout; keepalive; init/startup statements; auto-commit default; free-form **driver properties** (key/value); URL import/export |

SQLite and file-oriented engines omit network SSH/Proxy where meaningless; they still use Advanced timeouts / driver properties where useful.

### Per-engine options matrix

On top of shared sections (where applicable):

| Engine / variant | Extra options (summary) |
|------------------|-------------------------|
| **Cassandra / DSE / Scylla / Astra / Keyspaces / Cosmos** | Protocol version (Default, V3–V5, DSE_V1/V2); contact points; local DC; default + serial consistency; page/fetch size; request timeout; compression (none/snappy/lz4); load-balancing (DC-aware, token-aware); auth (PlainText, DSE PlainText, DSE GSSAPI/Kerberos + service name); Astra bundle path + token; Keyspaces region + SigV4 (profile / keys / default chain); Cosmos account key |
| **PostgreSQL** | sslmode set (disable → verify-full); sslrootcert/sslcert/sslkey/sslpassword; application_name; search_path; statement_timeout; target_session_attrs; multiple hosts; unix socket; “show all databases”; auth (password, `.pgpass`, AWS RDS/Aurora IAM, GSSAPI/Kerberos — see driver gates) |
| **MySQL / MariaDB** | ssl-mode (DISABLED → VERIFY_IDENTITY); CA/cert/key; allowPublicKeyRetrieval; auth plugin (caching_sha2, native, cleartext); socket; charset; timezone; multipleStatements; AWS IAM; Kerberos plugin — see driver gates |
| **SQL Server** | Server as `host\instance` or `host,port`; auth (SQL Server, Windows/NTLM + domain, Kerberos, Entra Password, Entra MFA interactive, Entra Device Code, Entra Service Principal, Entra Managed Identity, Entra Default); Encrypt (Mandatory / Optional / Strict); Trust server certificate; Host name in certificate; application intent; multi-subnet failover; packet size; application name; workstation id; Always Encrypted toggle |
| **Oracle** | Connection type (Basic SID/Service; TNS alias + TNS_ADMIN; Easy Connect / descriptor; Cloud wallet dir + wallet password); role (Default, SYSDBA, SYSOPER, SYSBACKUP, SYSDG, SYSKM); proxy user; thin vs thick (+ Instant Client path; thick for Kerberos); NLS |
| **SQLite** | File path; read-only; create if missing; busy timeout; journal mode |
| **MongoDB** | URI or form; host list / SRV; replicaSet; directConnection; authSource; mechanism (SCRAM-SHA-1/256, X.509, LDAP PLAIN, Kerberos GSSAPI, AWS IAM, OIDC); TLS on/off/default; CA; client cert/key + password; tlsInsecure; allowInvalidHostnames; readPreference; appName; compressors; retryWrites |
| **Redis / Valkey** | Host; port; ACL username; password; db index; TLS CA/cert/key + SNI; mode (standalone / cluster / sentinel + master name, sentinel nodes, sentinel password); timeout; key separator |
| **ClickHouse** | Protocol HTTP/HTTPS; db; user/password; CA/cert/key; compression; session settings key/value |
| **Elasticsearch / OpenSearch** | Node URLs; Elastic Cloud ID; auth (none, basic, API key, bearer, AWS SigV4 for OpenSearch Service); CA path or fingerprint; verify toggle |
| **DynamoDB** | Region; endpoint override; auth (default chain, named profile `~/.aws`, SSO profile, access key/secret/session, assume-role ARN + external id) |

### Files-by-path model

- Connections store **paths** (absolute preferred; host expands `~`).
- Host reads files at `connect` / `testConnection`; missing or unreadable → clear RPC error (no silent skip).
- File **contents** never enter `chrome.storage` or collection exports.
- Passphrases and passwords use keychain `secretAccount:<kind>` only.

### Data migration (v2)

- Bump stored Databases state to a **v2** connection shape: nested `tls`, `ssh`, `proxy`, `advanced`, discriminated `engineOptions`.
- On load: `tlsEnabled` + `tlsRejectUnauthorized` → `tls.mode` (`Required` / `Verify Full` as appropriate); flat `ssh` → `ssh.auth` + nested fields.
- Export/import stays secret-free; paths remain as stored strings.

### Driver-gated risks (must be honest in UI)

| Risk | Spec stance |
|------|-------------|
| **Kerberos** | Needs native `kerberos` npm module + system GSS (Heimdal macOS / MIT Linux / SSPI Windows). In scope for Mongo and Cassandra DSE GSSAPI when the module builds. |
| **node-postgres / mysql2** | `pg` has no GSSAPI; `mysql2` has no Kerberos plugin. Do **not** fake support — mark “not supported by driver” with tooltip, or ship a real auth-plugin spike later. Decide during implementation spike. |
| **Oracle Kerberos** | Requires thick mode + Instant Client path. |
| **Entra interactive** | Host uses `@azure/identity` `InteractiveBrowserCredential` into the **system** browser; token cache stays on the host only. |
| **SEA / pnpm** | New native modules (`kerberos`, possibly Azure deps) need `pnpm approve-builds` and affect the SEA build — record in gotchas when shipping. |

### Out of scope (this amendment)

- Detour-hosted secret sync or cloud vaults
- Storing certificate/key **bytes** in extension storage
- Faking Kerberos/GSSAPI on drivers that cannot do it
- Changing Local Bridge protocol
- Safari native messaging

### Verification (this amendment)

- **Unit:** every mapper (options → driver config); load-time migration; field descriptors (each engine’s sections); URL import per scheme.
- **Compose (extend `docker-compose.db.yml`):** TLS Postgres + generated CA/client certs under `cli/src/db/certs/`; OpenSSH bastion; SOCKS5 proxy; Redis with TLS. Run with `DETOUR_DB_E2E=1` covering verify-full + client cert, SSH key + passphrase, jump host, SOCKS.
- **Config-only:** Kerberos, Entra, cloud IAM — assert driver options in unit tests; no free local servers required.
- **Cleanup:** always `docker compose -f docker-compose.db.yml down` and quit Docker Desktop afterwards (standing rule).
- **Ship:** typecheck + extension/CLI tests; dual zip (Detour + Rogers); README per-engine options; KB write-back (architecture, gotchas, glossary, PROGRESS).

---

## Browser support table

| Browser | Min | Databases |
|---------|-----|-----------|
| Chrome / Edge / Brave / Chromium | 120+ | Full target (native messaging + optional permission) |
| Firefox | 128 ESR+ | Full target (native messaging host manifest) |
| Safari | — | **Out of version 1** (no compatible native messaging) |

## Limits and gotchas

- Native messaging host→browser message cap **1 MB** — chunk and page results
- SEA + native addons risk — prefer pure-JS drivers; prebuilt keyring next to binary; spike before Slice A Done
- AWS Keyspaces: TLS with bundled Starfield CA; port 9142
- Azure Cosmos Cassandra API: port **10350**
- Astra / Keyspaces / Cosmos: configuration unit-tested only (“configuration-tested”); live verify on the user’s own accounts
- One-time host install is required by browser stores; day-to-day start/stop is automatic
- Production connections default read-only
- Do not log passwords, tokens, or key material
- Connection options v2 (nested TLS/SSH/proxy, Kerberos, Entra, path-based certs): see **Connection options** above
- **OS packs / $0 unsigned:** Gatekeeper (macOS) and SmartScreen (Windows) may warn on first run; ad-hoc codesign only on macOS. Documented limitation — no paid notarization while $0 stands ([ADR-029](../DECISIONS.md), [distribution](distribution.md))
- SEA loads `@napi-rs/keyring` from `node_modules` beside the binary via `createRequire`; optional native modules (`kerberos`, oracledb thick) fail cleanly when absent

## Out of scope (all slices)

- Any Detour-hosted proxy or cloud
- Creating accounts on any provider
- Running the helper while the browser is closed
- Real-time collaboration
- Safari
- Cloud-only warehouses in version 1: Snowflake, BigQuery, Databricks
- Neo4j and InfluxDB (later)
- Changing Local Bridge away from loopback HTTP (Slice D may only manage its process)

## Verification

### Local containers (`docker-compose.db.yml`, free images, no accounts)

Cassandra 4 and 5, ScyllaDB, Postgres, MySQL, MariaDB, SQL Server Developer, Oracle Free (`gvenzl/oracle-free`), MongoDB, Redis/Valkey, ClickHouse, OpenSearch, DynamoDB Local, SSH bastion — brought online per slice that needs them.

### Host tests

- Adapter contract suite per container
- Chunking > 1 MB; cancel; idle exit; exit when stdin ends; keychain round trip
- Cloud Cassandra targets: unit tests assert driver options (bundle, TLS CA, SigV4, port 10350) — marked configuration-tested

### Extension tests

- Protocol client chunk reassembly; safety-rail statement classification; collection export without secrets
- e2e (Slice A): host installed vs Cassandra container — connect, browse keyspace, run CQL, page, save query, close tab, confirm helper exits

### CI / packaging

- SEA binaries for each OS in GitHub Actions (free for public repos)
- Dual zip (`zip` and `zip:rogers`) after each Approved slice ships

### Docs / KB (per slice)

- Root README **Connect to a database** section (plain language; OS packs first, Node path under Developers; collapsible per-database blocks only for engines that work); link from `cli/README.md` and in-app setup card
- In-pack READMEs from `cli/pack/templates/`; `extension/README-load-unpacked.md` inside plain Chrome zips
- ADR-027, ADR-029, `architecture.md`, `gotchas.md`, `PROGRESS.md`, distribution notes for host install / OS packs

---

## OS packs setup amendment (Approved Hamza, 2026-10-09)

Extends the one-time helper setup so a fresh machine needs **no Node / pnpm / repo**. Scope lives primarily in [distribution](distribution.md); product UX and install semantics for Databases are here.

### Acceptance criteria

- [x] SEA binary is a true self-contained host (`esbuild` CJS + postject); subcommands `install` / `uninstall` / `doctor` / `--version`
- [x] Pack install copies helper to the stable per-user dir (paths above); clears quarantine on macOS when feasible (`xattr`)
- [x] Native-messaging manifests point at the SEA binary; `allowed_origins` include fixed unpacked id + known store id(s); `--extension-id` optional (overrides / extras)
- [x] Databases setup card: OS/arch via `browser.runtime.getPlatformInfo()`; pack instructions + Releases link; `pnpm` under Developers
- [x] Store zips stay extension-only; OS packs are GitHub Releases / sideload artifacts only

---

## Partner-helper public hooks amendment (Approved Hamza, 2026-10-09)

Generic public MIT hooks so a **closed partner helper** (out of tree, [ADR-030](../DECISIONS.md)) can speak the same contract and build a branded extension without copying assets into this repo. **No partner trademarks or closed helper source** land in the public tree.

### Acceptance criteria

- [x] External brand directory: `DETOUR_BRAND_DIR` (absolute path) is accepted by `wxt.config.ts` in addition to `extension/brands/<slug>`
- [x] Brand field `nativeHostName` (default `com.detour.db`) is wired through Databases UI / protocol instead of a hardcoded host constant alone
- [x] Protocol `hello` returns `{ protocolVersion, hostVersion, capabilities[] }`; extension shows Helper too old/new on protocol mismatch; engine/feature UI is capability-gated from `capabilities` (not a hardcoded “all engines” assumption after handshake)
- [x] Contract tests honor `DETOUR_DB_HOST_CMD=/path/to/binary` so the same suite can verify an alternate host binary over native-messaging framing
- [x] Manifest `key` per brand remains as in OS packs (ADR-029) — required for stable partner unpacked ids

### Out of scope (this amendment)

- Closed Go/Rust helper source, partner brand assets, obfuscation, or partner OS packs (private repo / [plan 029](../plans/029-closed-rogers-native-helper.md))

## Related

- Cursor plan: Databases tab (`databases_tab_d8f52491.plan.md`); connection options parity (`db_connection_options_parity_4062430d.plan.md`); closed partner helper (`closed_rogers_native_helper_64704dd3.plan.md`)
- [api-client](api-client.md) — collections vocabulary
- [local-bridge](local-bridge.md) — intentional protocol contrast
- [PRODUCT.md](../PRODUCT.md) — Developer workbench scope
- Plan [027](../plans/027-db-connection-options.md) — implementation checklist after Connection options Approval
