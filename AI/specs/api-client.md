# Spec: api-client

**Status:** Approved — **Slices A + B + C** (Hamza, 2026-10-09; B/C via “Continue B/C”).  
**Last updated:** 2026-10-21 (UX: autosaveRequests, Collection v2.1 naming, History groups/search/clear)  
**Build order:** 10  
**Depends on:** rule-model, workspace-ui (rule tester / `resolveProbe`), engine-core (DNR session rules for forbidden headers), api-mock (save-as-mock)  
**Plan:** [025-api-client](../plans/025-api-client.md) (A+B+C Done)

## Product name

The options **Tester** tab is renamed to **API Tester**, with subtitle: *Send requests to any API, including localhost, and see which Detour rules apply*.

User-facing rename covers the options tab, the popup Tester control, the DevTools panel link, e2e selectors, and docs. Internal anchors such as `#tester` may stay for compatibility.

The existing “which rule wins” result becomes a response-pane panel named **Which rules apply**.

## Objective

Ship a full-featured API client **inside Detour** with **no Detour backend**, **no account**, and **MIT / free** forever. The client sends real HTTP (and later WebSocket/SSE) from the extension page — including `localhost` — pastes or imports cURL into pre-filled fields, organizes requests in **collections with folders**, and shows which Detour rules would apply via a simulated probe (`resolveProbe`).

“Premium” in this document means **paid-tier API-client feature parity** that can run fully in the browser — not a paid Detour tier.

## Locked decisions (Hamza)

- **Organization:** collections with folders only. UI copy must **never** say “workspace” for API Tester storage — `Workspace` already means the rules container in rule-model.
- **Apply Detour rules** is **dual-scope**: a **global** API Tester default (persisted in api-client storage, **on by default**) plus a **per-request** override (`Use global` | `On` | `Off`, default inherit). Explicit per-request wins; otherwise use the global default.
- All slices stay free, MIT, no account, no Detour-hosted server.
- Version 1 targets **Slice A**; Slices B and C are power/advanced API-client features that still need no backend.
- **Each slice may be Approved independently.** Implementation and `025` plan work only for Approved slice(s).

## Architecture notes (Slice A as built)

```
API Tester UI
  → resolve {{variables}}
  → pre-request script (sandbox iframe)
  → auth helpers (Basic/Bearer/API key; OAuth2 / SigV4 / Digest in later slices)
  → Apply Detour rules? → resolveProbe (resourceType: xmlhttprequest)
  → fetch / WebSocket / EventSource from extension page
  → test script (sandbox iframe)
  → response viewer + Which rules apply
```

| Concern | Plan |
|---------|------|
| Module | Pure logic under `extension/src/api-client/` (valibot models, curl, variables, send, apply-rules, storage, importers, scripts protocol). UI in options entrypoints. |
| Storage keys | Separate from rules `workspace`: e.g. `apiCollections`, `apiEnvironments`, `apiHistory`, `apiRuns` in `storage.local`. History cap 100; stored bodies truncated (~256 KB); runs cap 50. |
| Host access | Existing `host_permissions: ['<all_urls>']` — extension-page `fetch` bypasses CORS and reaches localhost. |
| Apply rules | Dual-scope: global default in `apiSettings.applyDetourRules` + per-request `applyDetourRules: inherit\|on\|off`. Resolve with `resolveApplyDetourRules`. When effective on, reuse `resolveProbe` (xmlhttprequest). Redirect → rewrite URL; block → “Blocked by rule X”; headers → modify request; mock → return mock without network. Label UI: “Detour rules applied (simulated)”. |
| Forbidden headers | Browsers block setting `Cookie`, `Origin`, `Referer`, `User-Agent`, `Host` on `fetch`. Short-lived DNR **session** rule scoped to extension initiator + exact URL sets the header; removed after send. |
| Scripts | Manifest `sandbox.pages`; null origin; no extension APIs; `postMessage` + hard timeout. `pm` API subset + bundled chai (MIT). |
| No backend | WebCrypto for secrets/PKCE/SigV4; File System Access for optional folder sync; `chrome.alarms` for scheduled runs while browser is open; `chrome.identity.launchWebAuthFlow` for OAuth (Chrome). |

---

## Approved scope — Slice A: core (version 1)

### User stories

- As a developer, I open **API Tester** and send a real request to any URL, including localhost, from Detour.
- As a developer, I paste a `curl …` string into the URL field (or Import) and get method, URL, params, headers, body, and auth filled in.
- As a developer, I organize requests in collections and folders, open multiple tabs, and save with Cmd/Ctrl+S.
- As a developer, I pick an environment and use `{{var}}` in URL, headers, and body.
- As a developer, I run pre-request and test scripts and see pass/fail results.
- As a developer, I set a **global** Apply Detour rules default (on by default) and optionally override it **per request** (Use global / On / Off), and see **Which rules apply** for the probe.
- As a developer, I import/export Collection v2.1 JSON and copy a request as cURL.

### Acceptance criteria

- [x] Options tab renamed **API Tester** (subtitle as above); popup / DevTools / e2e / docs use the new name where user-facing
- [x] Left sidebar: collections tree with folders (new, rename, duplicate, delete, import, export); history list; environments entry
- [x] Top bar: active environment picker
- [x] Request tabs: multiple open; unsaved indicator; Cmd/Ctrl+S saves
- [x] Request bar: method, URL with `{{var}}` highlighting / hover values, Send, Save
- [x] Paste starting with `curl ` into the URL field populates method, URL, params, headers, body, and auth
- [x] Import dialog accepts cURL or Collection v2.1 JSON
- [x] Request sub-tabs: Params (two-way with URL), Auth (None / Basic / Bearer / API key), Headers (rows with on/off), Body (none / raw JSON|text CodeMirror / urlencoded / form-data **text** fields), Scripts (pre-request + tests)
- [x] Response pane: status, time, size; Body Pretty / Raw / Preview (sandboxed iframe); Headers; Test results (pass/fail text); **Which rules apply**
- [x] **Apply Detour rules** dual-scope: global default **on**; per-request Use global / On / Off (default inherit); send path uses effective value → `resolveProbe` simulation as in Architecture notes
- [x] Environments: initial + current values; secret vars masked in UI, omitted from exports by default, optional passphrase encryption (WebCrypto AES-GCM)
- [x] Variable resolution order: environment → collection → globals; dynamic vars `{{$guid}}`, `{{$timestamp}}`, `{{$randomInt}}`
- [x] Collection v2.1 import **and** export (schema URL retained for interchange); **Copy as cURL**
- [x] History capped (100); bodies truncated in storage; keys do not collide with rules `workspace`
- [x] History UX: date groups (Today / Yesterday / Earlier), search, clear-all, per-row delete; optional display `name` on entries
- [x] **Autosave requests**: `apiSettings.autosaveRequests` (missing = **on**); header toggle; ~1 s idle on the **active** dirty tab → save; separate from rules workspace autosave (`AUTOSAVE_KEY`)
- [x] Forbidden request headers use short-lived DNR session rules then cleanup
- [x] Scripts run only in sandbox page; timeout enforced; no extension API access from script context
- [x] Dark (and light if theme exists) keyboard accessible; no color-only pass/fail

### Slice A out of scope

Collection runner, load test, scheduled runs, codegen panel, response diff, save-as-mock/redirect, OpenAPI/HAR, docs export, OAuth2/SigV4/Digest, cookie jar, GraphQL/WebSocket/SSE, visualizer, folder sync, Send to API Tester from DevTools/log — those are Slices B/C.

---

## Approved scope — Slice B: power features

**Approved:** Hamza, 2026-10-09 (“Continue B”).

### User stories

- As a developer, I run a collection or folder for N iterations (optionally with CSV/JSON data) and export a report.
- As a developer, I load-test one request lightly and see latency percentiles.
- As a developer, I schedule a collection run while the browser is open.
- As a developer, I generate code snippets and diff two responses.
- As a developer, I turn a response into a Detour mock or redirect rule.
- As a developer, I import OpenAPI/Swagger or HAR into a collection and export docs.

### Acceptance criteria

- [x] Collection runner: N iterations; optional CSV/JSON data file; delay; stop-on-fail; honor `pm.execution.setNextRequest`; live results table; export report JSON/HTML; keep past runs (cap)
- [x] Load test lite: one request × N with concurrency; p50/p95/p99, error rate, RPS; safe cap + warning
- [x] Scheduled runs via `chrome.alarms` (min 1 minute); results in run history; optional failure notification (`notifications` optional, first-use); UI states runs only while browser is open
- [x] Code side panel: fetch, axios, Node, Python requests, Go, cURL, HTTPie — with copy
- [x] Response diff: history, two environments, or last run vs current; structural JSON where applicable
- [x] **Save response as Detour mock** and **Redirect this to localhost** create rules and open the rule editor pre-filled
- [x] OpenAPI 3 / Swagger 2 (JSON or YAML) → collection with example bodies
- [x] HAR → collection
- [x] Docs export: Markdown or standalone HTML from descriptions/examples

### Slice B out of scope

OAuth2/SigV4/Digest, cookie jar, GraphQL/WebSocket/SSE, visualizer, folder sync, capture-from-browser — Slice C. Anything in global Out of scope below.

---

## Approved scope — Slice C: advanced

**Approved:** Hamza, 2026-10-09 (“Continue C”).

### User stories

- As a developer, I authenticate with OAuth 2.0, AWS SigV4, or Digest without leaving Detour.
- As a developer, I optionally manage a cookie jar for sent requests.
- As a developer, I send GraphQL, WebSocket, and SSE traffic and visualize script output.
- As a developer, I sync collections to a local folder for git sharing.
- As a developer, I send a captured request from DevTools or the match log into API Tester.

### Acceptance criteria

- [x] OAuth 2.0 authorization code + PKCE via `chrome.identity.launchWebAuthFlow` (Chrome); manual-code fallback on Firefox
- [x] OAuth 2.0 client credentials and password grants with auto-refresh
- [x] AWS Signature V4 and Digest auth
- [x] Optional cookie jar (view/edit per domain); `cookies` optional permission on first use
- [x] GraphQL body mode: query + variables; schema introspection for autocomplete/docs
- [x] WebSocket and SSE clients: connect, send, timestamped log; savable in collections
- [x] Visualizer: `pm.visualizer.set(template, data)` in a sandboxed Visualize response tab
- [x] Folder sync via File System Access (pretty JSON, secrets excluded); Firefox falls back to manual export/import
- [x] DevTools panel and Detour match log: **Send to API Tester** opens a new request tab

### Slice C out of scope

Anything in global Out of scope below.

---

## Browser support table

| Browser | Min | API Tester |
|---------|-----|------------|
| Chrome / Edge / Brave | 120+ | Full target (fetch from extension page, DNR session headers, sandbox scripts, `identity` for OAuth in Slice C) |
| Firefox | 128 ESR+ | Core send + collections; OAuth uses manual-code fallback; File System Access → manual import/export; document other gaps |
| Safari | 17+ | Subset TBD |

## Limits and gotchas

- Apply-rules path is a **simulation** via `resolveProbe`, not a guarantee that production page traffic will see the identical DNR outcome for every edge case
- Forbidden headers need DNR session rules; cleanup must always run (abort/error paths)
- Sandbox scripts: CSP, timeout, no extension APIs — not a security boundary against malicious collections the user chose to run
- `chrome.alarms` scheduled runs only while the browser is open (UI must say so)
- History/body truncation and run caps exist to protect `storage.local`
- Form-data **file** uploads are out of scope for V1 (text fields only in Slice A)
- Do not call Postman.com or any Detour-hosted API

## Out of scope (all slices)

- Real-time collaboration, cloud sync, and accounts
- Hosted mock servers (Detour mock rules cover this locally)
- Monitors that run while the browser is closed
- gRPC (no browser transport)
- AI assistants that need paid APIs
- File uploads in form-data (revisit later)
- Any call to Postman.com
- Paid Detour tier / accounts of any kind

## Verification

### Unit (by slice)

- **A:** cURL fixtures (DevTools bash/cmd, multiline, JSON, `-F`, `-u`) and `toCurl` round trip; Collection v2.1 import/export; variables + dynamic vars; `apply-rules`; secret encryption round trip; script sandbox protocol + timeout
- **B:** codegen golden files; diff; runner (iterations, data rows, `setNextRequest`); load stats
- **C:** SigV4 test vectors; PKCE; GraphQL/WS/SSE protocol helpers as applicable

### e2e (local test server started by the e2e run)

- Paste cURL → fields filled; send → save → reload; environment resolution; test script result; redirect rule applied (Apply Detour rules); runner 2 iterations (B); save-as-mock creates a rule (B); WebSocket echo (C)

### After each Approved slice ships

- KB: ADR (sandbox scripts, simulated rules, storage keys, optional permissions); `architecture.md`; `gotchas.md`; `PROGRESS.md`
- Dual zip (`zip` and `zip:rogers`); reload Rogers as needed

## Related

- [workspace-ui](workspace-ui.md) — existing rule tester / `resolveProbe` (Slice 3)
- [api-mock](api-mock.md) — save-as-mock synergy (Slice B)
- [engine-core](engine-core.md) — DNR session rules for forbidden headers
- [000-capability-map](000-capability-map.md)
- Cursor plan: Postman-style Tester (`postman-style_tester_c4db098c.plan.md`)
