# Cassandra connect failure — investigation handoff (Detour)

| Field | Value |
| --- | --- |
| **Public repo** | [proto-void/detour](https://github.com/proto-void/detour) |
| **Product site** | [https://detour.dev](https://detour.dev) |
| **Branch** | `main` |
| **Access model** | **GitHub-only** — this handoff is self-contained; the receiving agent has no local checkout or private repos |
| **Purpose** | Diff why Detour fails to connect to Cassandra while another client (e.g. TablePlus, cqlsh, DataStax Studio) succeeds |

**Do not request or store secrets.** Diff config shape, TLS/SNI, ports, local DC, and auth *mechanism* only. Passwords, tokens, and PEM/JKS contents stay out of chat and this file.

---

## 1. Goal

Find the **configuration or driver-wiring gap** between:

1. A **working** Cassandra/Scylla/Keyspaces/Cosmos client (user-provided, redacted), and
2. **Detour’s public stack**: Chrome extension → native messaging host → Node `cassandra-driver`.

Deliver a root-cause note and (if code) a minimal fix plus unit test. No secrets in the write-up.

---

## 2. Scope note (public vs private)

| Surface | In public `proto-void/detour`? | Stack |
| --- | --- | --- |
| Extension UI + `db-client` | Yes | TypeScript / Svelte |
| Native host `com.detour.db` | Yes — under `cli/` | **Node** + `cassandra-driver` |
| Rogers / Detour **Go** helper | **No** — private `rogers-detour` only | Go `gocql` / TLS helpers |

**Investigate the public Node path first.** Do not assume Go helper behavior unless the reporter confirms they installed a Rogers OS pack. Private Go source is out of scope for a GitHub-only agent.

---

## 3. Architecture

```text
┌─────────────────────────────┐
│  Extension (options UI)     │
│  Databases.svelte           │
│  buildHostConfig(conn)      │
└─────────────┬───────────────┘
              │ chrome.runtime.connectNative("com.detour.db")
              │ JSON-RPC (db.connect / db.execute / …)
              ▼
┌─────────────────────────────┐
│  Native host (Node, cli/)   │
│  host.ts → adapters         │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  cassandra-driver Client    │
│  Client.connect()           │
│  SELECT release_version     │
│    FROM system.local        │
└─────────────────────────────┘
```

High-level product architecture: [AI/intelligence/architecture.md](https://github.com/proto-void/detour/blob/main/AI/intelligence/architecture.md).

---

## 4. Canonical links (start here)

- Architecture: https://github.com/proto-void/detour/blob/main/AI/intelligence/architecture.md  
- README (DB URL examples, install helper): https://github.com/proto-void/detour/blob/main/README.md  
- Spec: https://github.com/proto-void/detour/blob/main/AI/specs/db-client.md  

---

## 5. Public files to open (blob URLs on `main`)

Open these in order when tracing a connect failure:

| Area | File |
| --- | --- |
| Host config from UI | https://github.com/proto-void/detour/blob/main/extension/src/db-client/url.ts (`buildHostConfig`) |
| Databases UI | https://github.com/proto-void/detour/blob/main/extension/src/entrypoints/options/Databases.svelte |
| Native messaging / JSON-RPC | https://github.com/proto-void/detour/blob/main/extension/src/db-client/protocol.ts |
| Connection model | https://github.com/proto-void/detour/blob/main/extension/src/db-client/model.ts |
| Field defs / labels | https://github.com/proto-void/detour/blob/main/extension/src/db-client/fields.ts |
| Host entry / connect pipeline | https://github.com/proto-void/detour/blob/main/cli/src/db/host.ts |
| TLS path hydrate + **SNI rename** | https://github.com/proto-void/detour/blob/main/cli/src/db/paths.ts (`serverName` → `servername`) |
| Shared TLS flatten | https://github.com/proto-void/detour/blob/main/cli/src/db/adapters/tls-from-config.ts |
| Driver option builder | https://github.com/proto-void/detour/blob/main/cli/src/db/adapters/cassandra-config.ts |
| Adapter connect / probe | https://github.com/proto-void/detour/blob/main/cli/src/db/adapters/cassandra.ts |
| Adapter registry | https://github.com/proto-void/detour/blob/main/cli/src/db/adapters/registry.ts |
| Unit tests (options / TLS / auth) | https://github.com/proto-void/detour/blob/main/cli/src/db/cassandra-config.test.ts |
| Known traps | https://github.com/proto-void/detour/blob/main/AI/intelligence/gotchas.md |
| Local DB compose (optional) | https://github.com/proto-void/detour/blob/main/docker-compose.db.yml |

---

## 6. `buildHostConfig` JSON shape

Built in [`url.ts`](https://github.com/proto-void/detour/blob/main/extension/src/db-client/url.ts). Sent as `params.config` on connect (plus separate `secretAccount`).

Relevant Cassandra fields (illustrative; omit empties in real payloads):

```json
{
  "target": "apache",
  "host": "10.0.0.1",
  "contactPoints": ["10.0.0.1"],
  "port": 9042,
  "localDataCenter": "DC1",
  "username": "cassandra",
  "keyspace": "my_keyspace",
  "tls": {
    "enabled": true,
    "mode": "verify-full",
    "caPath": "/path/to/ca.pem",
    "certPath": "/path/to/client.crt",
    "keyPath": "/path/to/client.key",
    "trustStorePath": null,
    "keyStorePath": null,
    "serverName": "cassandra.example.com",
    "minVersion": null,
    "rejectUnauthorized": true
  },
  "ssh": {
    "enabled": true,
    "host": "bastion.example.com",
    "port": 22,
    "username": "ubuntu",
    "auth": "password"
  },
  "proxy": {
    "type": "socks5",
    "host": "127.0.0.1",
    "port": 1080
  }
}
```

**Password is not in `config`.** The extension stores credentials in the OS keychain under `secretAccount` (e.g. `db-<id>`). The host loads them via `applySecrets(config, secretAccount)` before connecting.

`target` values for Cassandra family: `apache` | `dse` | `scylla` | `astra` | `keyspaces` | `cosmos`.

---

## 7. Host pipeline (`cli/src/db/host.ts` → adapter)

On `db.connect` (names may vary slightly; follow `host.ts`):

1. **`applySecrets(config, secretAccount)`** — password, SSH key/pass, TLS key passphrase, JKS passwords, proxy password from keychain into the in-memory config.
2. **`hydrateTls` / `resolveTlsFiles`** ([`paths.ts`](https://github.com/proto-void/detour/blob/main/cli/src/db/paths.ts)) — read CA/cert/key (or JKS), map **`tls.serverName` → `tls.servername`**, set `rejectUnauthorized` / `minVersion`.
3. **SSH / proxy rewrite** — if enabled, tunnel and rewrite `host` / `contactPoints` toward the local listener (often `127.0.0.1`).
4. **`buildCassandraOptions(config)`** ([`cassandra-config.ts`](https://github.com/proto-void/detour/blob/main/cli/src/db/adapters/cassandra-config.ts)).
5. **`Client.connect()`** via [`cassandra.ts`](https://github.com/proto-void/detour/blob/main/cli/src/db/adapters/cassandra.ts).
6. **Probe:** `SELECT release_version FROM system.local`.

---

## 8. Driver behavior (public Node path)

From `buildCassandraOptions` / `toDriverOptions`:

- **Contact points:** split on commas, semicolons, and whitespace; trim; require at least one.
- **Local DC:** set only if non-blank. **Do not invent `datacenter1`.** Wrong/missing DC breaks DC-aware load balancing on many clusters.
- **Auth:** username+password → `PlainTextAuthProvider` when the driver exposes it; Astra may use token; Keyspaces may use SigV4 plugin.
- **TLS:** for apache/dse/scylla, `sslOptions` only if `tls.enabled`. Cosmos/Keyspaces force TLS-oriented options.
- **Default ports:** Apache/Scylla `9042`; Azure Cosmos Cassandra API `10350`; AWS Keyspaces `9142`.
- **Astra:** requires `secureConnectBundle` path (cloud secure connect bundle); not the same as PEM/SNI apache TLS.

---

## 9. Critical gap: SNI (`serverName`) never reaches `sslOptions`

**Observed wiring:**

1. Extension sends `tls.serverName` (camelCase) in `buildHostConfig`.
2. [`paths.ts` `resolveTlsFiles`](https://github.com/proto-void/detour/blob/main/cli/src/db/paths.ts) maps `tls.serverName` → **`servername`** on the hydrated TLS object.
3. [`cassandra-config.ts`](https://github.com/proto-void/detour/blob/main/cli/src/db/adapters/cassandra-config.ts) builds `sslOptions` with `rejectUnauthorized`, `ca`, `cert`, `key`, `passphrase` — **but does not copy `servername` / SNI**.
4. [`cassandra.ts` `toDriverOptions`](https://github.com/proto-void/detour/blob/main/cli/src/db/adapters/cassandra.ts) assigns `opts.sslOptions = built.sslOptions` — still **no SNI**.

**Why it matters:** Connecting with **verify-full** to an **IP** (or via SSH rewrite to `127.0.0.1`) while the cert is issued for a hostname requires Node TLS **`servername`** (SNI). Other clients that set SNI succeed; Detour’s Node path can fail with certificate hostname / handshake errors even when CA + client cert/key are correct.

Compare: Redis adapter in the same host **does** pass `servername` into TLS options. Cassandra does not (as of this handoff).

**Hypothesis to prove or refute first** when the working client uses TLS + IP + Server Name (SNI).

---

## 10. Failure modes checklist

| Mode | Symptom / clue | Where to look |
| --- | --- | --- |
| **SNI dropped** | Works in TablePlus with “Server name”; fails in Detour to IP/`127.0.0.1` with TLS | §9; `paths.ts` vs `cassandra-config.ts` |
| **Local DC wrong/blank** | Driver policy / “no host was tried” / DC-aware errors | `localDataCenter`; do not assume `datacenter1` |
| **TLS mode / JKS** | Mode `disable` vs `verify-full`; trust/key store paths; passphrase keychain | `hydrateTls`, JKS load in `paths.ts` |
| **Auth / keychain** | Auth fail though UI has username; password never in config | `secretAccount` + `applySecrets`; confirm host can read keychain |
| **Port / target** | Wrong `target` (cosmos vs apache) or port 9042 vs 10350 vs 9142 | `target`, `protocolOptions.port` |
| **Stale helper** | Code fixed but installed native host old | Reinstall/reload host per README; “Reload extension” alone is insufficient for host binary changes |

Also skim: https://github.com/proto-void/detour/blob/main/AI/intelligence/gotchas.md (Cassandra / TLS / helper install notes).

---

## 11. Investigation steps

1. **Capture redacted parity** — Working client: host/IP, port, local DC, TLS on/off, CA present?, client cert?, **SNI/server name**, SSH/proxy. Detour: same fields from UI + exact error string. Confirm which native host is installed (public Node vs Rogers Go pack).
2. **Trace config** — Follow `buildHostConfig` → JSON-RPC → `applySecrets` → `hydrateTls` → SSH rewrite → `buildCassandraOptions` → `sslOptions` / `contactPoints` / `localDataCenter`.
3. **Prove SNI** — If working client sets SNI: confirm Detour’s final `sslOptions` lacks `servername`. If not TLS/SNI, skip to DC/port/auth.
4. **Reproduce locally** — Optional: `docker-compose.db.yml` or a known cluster; unit-test `buildCassandraOptions` with `tls.servername` expectation.
5. **Isolate non-SNI causes** — Blank/wrong `localDataCenter`, missing keychain password, wrong `target`/port, Astra bundle path, Keyspaces SigV4 region.
6. **Fix + unit test** — Prefer putting `servername` into Cassandra `sslOptions` (and any other proven gap). Add/extend tests in `cli/src/db/cassandra-config.test.ts` (and/or `paths` / adapter tests). Do not commit secrets.

---

## 12. Example URLs (from README)

Public examples (placeholders only):

```text
cassandra://cassandra:cassandra@127.0.0.1:9042/my_keyspace?localDc=datacenter1
scylla://127.0.0.1:9042/ks?localDc=datacenter1
keyspaces://USER:PASS@cassandra.us-east-1.amazonaws.com:9142/?region=us-east-1
cosmos://myaccount:ACCOUNT_KEY@myaccount.cassandra.cosmos.azure.com:10350/
```

Source: https://github.com/proto-void/detour/blob/main/README.md  

URL → draft mapping lives in `connectionFromUrl` in the same `url.ts` as `buildHostConfig`.

---

## 13. Out of scope

- **Rogers private Go helper** (`rogers-detour` / OS packs): not in this GitHub repo. If the reporter only uses a Rogers-installed helper, say so and stop; do not invent Go fixes from public Node code alone.
- Storing or requesting live passwords, account keys, PEM/JKS bodies, or Astra tokens.
- Changing unrelated engines (Postgres, MySQL, etc.) unless needed as a pattern reference (e.g. Redis SNI).

---

## 14. Attach when sending this handoff

Please include (redacted):

1. **Working client parameters** — host/contact points, port, local DC, TLS mode, whether SNI/server name is set (value can be the hostname only), SSH/proxy yes/no, target flavor (apache/scylla/keyspaces/cosmos/astra).
2. **Detour error string** — full message from UI or host log (no secrets).
3. **Which host is installed** — public Node `com.detour.db` from Detour CLI/zip, vs Rogers OS pack Go helper; OS (macOS/Windows) and approximate install date if known.

---

*Handoff for external GitHub-only investigation. Overwrite this file when the investigation brief changes.*
