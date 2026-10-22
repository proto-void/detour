# Architecture

**Last verified:** 2026-10-21 (grow-field `.collapsed` one-line blur)

## Pipeline

```
Rules → RuleCompiler → Core DNR            (built: engine-core)
                     → Inject scripting
                     → Mock fetch/XHR
                     → Deep chrome.debugger
                     → FF filterResponseData
                     → Local Bridge CLI
Workbench (separate from RuleCompiler):
  API Tester (api-client Slices A–C Done)
  Databases (db-client A–D + partner-helper public hooks)
```

## Modules (spec map)

| Module | Responsibility | Code |
|--------|----------------|------|
| `rule-model` | Schema, groups, priority, import/export | `extension/src/rule-model/` |
| `engine-core` | DNR compile/apply; urlFilter preference | `extension/src/engine-core/` |
| `page-inject` | JS/CSS inject via scripting + userScripts | `extension/src/page-inject/` + `entrypoints/bridge.content.ts` |
| `api-mock` | fetch/XHR mocks in the page's MAIN world | same module: `mock-runtime.ts` + `entrypoints/mock-main.content.ts` |
| `engine-deep` | Body override: Chrome debugger Fetch, Firefox filterResponseData | `extension/src/engine-deep/` |
| `local-bridge` | Node CLI on 127.0.0.1; `serveLocal` is in-place when rewriting is allowed, else a DNR redirect | `cli/` + `extension/src/local-bridge/` |
| `workspace-ui` | Popup, options, recipes, tester, RO import | `extension/src/workspace-ui/` (logic) + `src/entrypoints/popup/` (slice 1) + `src/entrypoints/options/` (slice 2) |
| `observability` | Toolbar badge and session match log (no rule-body telemetry) | `extension/src/observability/` |
| `distribution` | Store listing docs, permission rationale, CI and zip artifacts | `.github/workflows/ci.yml`, `docs/distribution/`, `extension/scripts/install-chrome.mjs` |
| `api-client` | API Tester A–C: collections, send, scripts, dual-scope Apply Detour; runner/power; OAuth/SigV4/Digest, cookies, GraphQL/WS/SSE, visualizer, folder sync, capture | `extension/src/api-client/` + `ApiTester.svelte` + `ApiTesterPower.svelte` + `ApiTesterAdvanced.svelte` |
| `db-client` | Databases tab + JSON-RPC to brand `nativeHostName` (default `com.detour.db`) | `extension/src/db-client/` + `cli/src/db/` + `Databases.svelte` (A–D + hooks) |

## Databases helper (Slices A–D + Connection options + partner hooks, ADR-027/029/030)

```
Databases tab → optional nativeMessaging → connectNative(brand.nativeHostName || 'com.detour.db')
  → hello → { protocolVersion, hostVersion, capabilities[] } (mismatch UX; engine/SSH/proxy gated)
  → host JSON-RPC (chunk ≤ ~900 KB; cancel; idle / stdin-end exit; pickFile)
  → adapters: cassandra, postgres, mysql/mariadb, mssql, sqlite, oracle,
               mongodb, redis, clickhouse, elasticsearch/opensearch, dynamodb
  → pure *-config.ts mappers; path-based TLS files; ssh2 (+ agent/jump); SOCKS5/HTTP proxy
  → explain/tx/edits; ER/designer/compare; collection folder sync
  → optional Local Bridge process start/stop (HTTP protocol unchanged)
  → keychain secrets (kinds: password, :token, :sshKey, :sshPass, :sshKeyPass,
       :sslKeyPass, :proxyPass, :walletPass) + Amazon Root CA1 for Keyspaces
Install (preferred): OS pack → double-click Install → SEA copies to per-user dir
  macOS `~/Library/Application Support/Detour/db-host/`
  Windows `%LOCALAPPDATA%\Detour\db-host\`
  Linux `${XDG_DATA_HOME:-~/.local/share}/detour/db-host/`
  Manifest `path` = SEA binary; `allowed_origins` from stable public manifest `key` (ADR-029)
Install (developers): `detour db install` / `uninstall` / `doctor` — Node launcher with absolute `process.execPath`
SEA: `cli/scripts/build-sea.mjs` (esbuild CJS + postject + official Node base + keyring beside binary);
  CI matrix windows-x64 / macos-arm64 / macos-x64 / linux-x64; `os-packs` + `v*` release assets
Pack: `cli/scripts/pack-os.mjs` + `cli/pack/templates/`; store zips remain extension-only
Compose: `docker-compose.db.yml` (+ profile `tls`) + `DETOUR_DB_E2E=1`; portable host via `DETOUR_DB_HOST_CMD`
Brand build: `DETOUR_BRAND` and/or `DETOUR_BRAND_DIR` (absolute external brand tree, ADR-030)
Connection form: declarative `fields.ts`; DbConnection v2 nested tls/ssh/proxy/advanced
  TLS verify-full: CA / client cert / client key paths + Key passphrase → `:sslKeyPass`
```


## Core DNR data flow (as built)

```
storage.local "enabled" false → apply an empty set, report disabled: true (workspace kept)
storage.local "workspace" { v: 1, data: { groups } }
  → loadWorkspace (valibot; corrupt data reported, never overwritten, DNR left as-is)
  → compileWorkspace   enabled groups → enabled rules, workspace order; per-rule refusals
                       pageDomains → 2 DNR rules (main_frame: requestDomains; rest: topDomains | initiatorDomains)
  → isRegexSupported   pre-check (when the API exists)
  → enforceLimits      walk in priority order; refuse what doesn't fit
  → updateDynamicRules ONE call: remove all existing ids + add ids 1..n
  → storage.local "applyReport" { applied[{dnrId,groupId,ruleId}], refused[], fallback, errors }
```

- Triggers: `runtime.onInstalled`, `runtime.onStartup`, `storage.onChanged` on the `workspace` / `enabled` keys, all through `createCoalescer` (in-flight run + at most one follow-up).
- Neither UI page talks to the background directly. They write `enabled` / `workspace` to `storage.local` and re-render from `storage.onChanged` (`applyReport`).
- Import = `importIntoStorage(text, area, { fileName, onNameOnlyMatch })` → `mergeImported`. Identical content (SHA-256) replaces in place with no prompt. The same file name with different content asks Replace / Import as new / Cancel (no prompt available → import as new). Otherwise it appends. Fresh ids always. `importKey` copies `enabled` from the matched group/rule and replaces everything else. Groups the user created (no `importedFrom`) are never touched. It refuses to write over an unreadable workspace.

## Page engines (as built, ADR-008)

```
enabled workspace
  → planPage → userScripts[] (inline JS) + pageConfig { mocks, styles, scripts }
  → syncPage (inside syncRules): write storage.local.pageConfig, then
       register content scripts only while needed:
         detour-bridge  ISOLATED  document_start  allFrames  (CSS, script URLs, mock config)
         detour-mock    MAIN      document_start  allFrames  (while any mock is enabled)
       replace Detour user scripts (inline JS)
  → applyReport gains injected[{groupId,ruleId,kind}] and page refusals
```

- DNR compile skips `injectJs` / `injectCss` / `mock` (`isDnrAction`). Global off passes an empty workspace to `planPage`, so nothing stays registered.
- `pageConfig` stores compiled regex sources (not globs) plus mock bodies. The bridge reads it; messages back to the background carry a `ruleId`, never code.
- Inline JS: `userScripts.register` on `<all_urls>`, guarded in the page (globs, regexes, and top-frame site scoping don't fit match patterns). `runAt` default `document_start`, `allFrames` default false, `world` default `MAIN`.
- JS URL: bridge inserts `<script src async=false>`. CSS (inline or URL): bridge asks the background, which calls `scripting.insertCSS`. URL CSS is fetched by the background.
- Mocks: packaged MAIN runtime patches `fetch` and async XHR. Config arrives as a DOM `CustomEvent` JSON string. The first matching mock wins; other traffic calls the native function with the original arguments. Turning a mock off updates open pages without a reload.
- Runtime failures (CSP-blocked script URL, unreachable CSS URL) append to `storage.session.pageFailures` (last 50, page origin + message, no bodies). The editor shows them on the rule.
- Permissions: `scripting` always; `userScripts` in Chrome `permissions`, Firefox `optional_permissions`. Content scripts are not listed in the manifest; `syncPage` registers them.

## Body override (as built, ADR-009 + ADR-025)

```
enabled workspace
  → overrideBody delivery redirect (default):
       compileWorkspace → DNR redirect to data:<mime>;charset=UTF-8;base64,…
       no debugger, no consent; applyReport.applied
  → overrideBody delivery inPlace:
       planBody → Fetch urlPatterns
       sync only when bodyEngineConsent is true and the browser permission is present:
         Chrome: debugger.attach + Fetch.fulfillRequest
         Firefox: filterResponseData
       applyReport.bodies; body-permission-denied when consent/permission missing
```

- DNR compile emits redirect-delivery rules and skips in-place ones. Global off and an empty in-place plan detach and clear the filter.
- MIME for redirect: `contentType` when set, else match URL extension (`.json` → `application/json`, also `.js` / `.css` / `.html` / `.svg`), else `text/plain`.
- Chrome `debugger` is install-time. Attach waits for Allow debugger. Redirect-only workspaces never show that banner. Firefox optional webRequest* from Allow response rewriting for in-place only.
- First matching enabled rule wins. Omitted resource types match everything except `main_frame`.
- In-place responses drop `content-encoding`, `content-length`, and `transfer-encoding`. Optional content type replaces `Content-Type`.
- Cancelling Chrome’s debugging banner / opening DevTools detaches in-place Detour. Redirect delivery is unaffected.
- RO `fileOverride` maps to `overrideBody` with `delivery: 'redirect'` (RO 2.0 parity). `fileInject` stays skipped. Disk files are `serveLocal`.
- While in-place rules are armed, HTML documents get SHA-384 `integrity` rewrites (ADR-014+). Redirect delivery does not rewrite the document.

## Local Bridge (as built, ADR-012)

```
detour bridge <folder>  →  listen 127.0.0.1 only, print a new 64-hex token
user connects on the rules page  →  storage.local.bridgeSession after GET /health
enabled serveLocal { path }
  → up + bodyEngineConsent + permission: body engine reads the file and fulfills in place (original URL)
  → up, no consent: DNR redirect to http://127.0.0.1:<port>/d/<token>/<base64url path>
  → not connected: refuse bridge-not-connected
  → health fails: refuse bridge-down
  → production URL is unchanged on either refusal
```

- In-place reuses Chrome `Fetch.fulfillRequest` and Firefox `filterResponseData`. Status 200, file `Content-Type`, `Cache-Control: no-store`. Over 8 MiB, or a failed read, leaves the production response.
- The filename is not in the bridge URL, so a redirect pattern like `*.js` does not also match the bridge and loop. In-place does not redirect, so that loop check does not apply.
- Refusal text, the apply report, and the match log do not contain the token or file bytes. The match log stores the page’s request URL. The token is in the redirect URL only when the rule falls back to a redirect.
- No `--host`. The filesystem root is refused. Symlinks that leave the folder are 404.
- Inline `overrideBody` is unchanged as a rule action. While either that rule or an in-place `serveLocal` rule is armed, HTML documents get a SHA-384 `integrity` of the replacement on matching script and stylesheet tags (ADR-014). The same list is embedded in `<meta name="detour-sri">` and a MAIN-world `document_start` hook applies it when page JavaScript assigns `integrity` (ADR-015), passes the tag to `innerHTML` / `insertAdjacentHTML` (ADR-016), inserts markup that runs scripts through `createContextualFragment` or `setHTMLUnsafe` with `runScripts: true` (ADR-017), passes the tag to `outerHTML` / a shadow root's `innerHTML` or copies HTML `integrity` with `setAttributeNS` (ADR-018), or passes the tag to `setHTMLUnsafe` when `runScripts` is omitted or not strictly `true` (ADR-019), or passes the string to `Document.parseHTMLUnsafe` or `DOMParser.parseFromString` with type `text/html` (ADR-020), or moves an HTML `integrity` Attr with `setAttributeNode` or `setAttributeNodeNS` (ADR-021), or adopts that Attr with `setNamedItem` or `setNamedItemNS`, or writes `Attr.value`, `nodeValue`, or `textContent` after it is already on the element (ADR-022), or passes markup to `document.write` or `document.writeln` (ADR-023), or sets an iframe's `srcdoc` (ADR-024). String arguments to `document.write` are concatenated first. A non-string is left unchanged. Nodes moved from that document into a live page carry the hash. Scripting on that document stays off. The redirect fallback does not rewrite the document and does not install the hook.

## UI (workspace-ui)

| Surface | Entry | Holds |
|---------|-------|-------|
| Popup | `src/entrypoints/popup/` | global switch, first 8 group switches (immediate save), import, applied/refused report, Match count switch (`storage.local.showBadge`, missing means on), quick tiles: Rules / API Tester / **DB** (`#db` → Databases) / Log; Recipes only via options tab; "Edit rules…" → `runtime.openOptionsPage()`, Light theme switch |
| Editor | `src/entrypoints/options/` (`options_ui`, `open_in_tab`) | groups/rules CRUD + reorder, compact rule rows (action chip, inline When/target, status dot, overflow menu), per-rule expand for details, side drawer for body/code (CodeMirror 6), site scoping, request types (collapsed Advanced), validation, preview, Autosave (default on) / Save now / Discard, Export, user-scripts banner, **API Tester** (`#tester`), recipe picker, Recent matches (`#log`), Light theme switch |
| DevTools | `src/entrypoints/devtools/` + `devtools-panel/` | `devtools_page` creates a Detour panel. The panel runs `inspectPage` (page-load `resolveProbe`) for the inspected tab |
| Shared | `src/ui/` | `base.css` tokens (dark default, `data-theme="light"`), `Switch`, `Field`, `Drawer`, `Toast`, `ThemeToggle`, `grow-field` (`syncGrowField` / `syncGrowFieldCollapsed` + `.grow-field` / `.collapsed` for one-line blur), `KvTable` (enable|Key|Value|remove + Bulk Edit + trailing empty row), `announcer` (one live region per page) |
| Logic | `src/workspace-ui/` | `import-flow`, `report-view`, `editor`, `popup`, `recipes`, `devtools`, `tester` (pure; all unit tested) |

- Editor model: `draft` and `saved` are `$state.raw` workspaces, changed only through the immutable ops in `editor.ts`. Autosave (`storage.local.autosave`, missing = on) writes a validated draft ~1 s after the last edit via `autosaveDecision`; Save now / Ctrl/Cmd+S writes immediately with validation focus. A toast offers one-level Undo of the last autosave. A rule's status is "Applying" until an `applyReport` with `appliedAt` ≥ the moment the save started arrives.
- Compact row (default): Switch, colored action chip (type popover), When pattern, target slot (redirect/local inline; Edit body/code → drawer; headers summary expands details), status dot, `⋯` menu (move/duplicate/delete), chevron for details. Not an RO From/To/Edit File clone — Detour identity via chips and tokens.
- **One rule drawer at a time:** `App` owns `activeRuleId`; `GroupCard` / `RuleEditor` open via `onOpenRule` / close via `onCloseRule`. List expand (`detailOpen`) uses `ruleDetailPreview` (action summary + optional code/note), not Priority — **do not** auto-open on empty pattern (only `showAll && hasErrors`). Chevron: collapsed points down, expanded points up (`transition` ~150ms). Pattern, Redirect-to, Try a URL, and Note are vertical `textarea.grow-field` via `ui/grow-field.ts` (wrap + auto-grow, soft max ~10 lines). CodeMirror uses `EditorView.lineWrapping` + `overflowX: hidden`. Rule DnD: grip-only handle, full-row drag ghost, before/after drop edge + row shift; no cross-group. Drawer footer: Delete (same `removeRule` as kebab) + Revert + Done.
- **API Tester primary canvas:** collections tree + request bar + Params/Auth/Headers/Body/Scripts + response. Power (Runner/Load/Schedule/Code/Diff/OpenAPI/HAR/Docs + Save as mock / Redirect) and Advanced (WS/SSE+Protocol, GraphQL docs, Cookies, Folder sync) live in a **Tools** `Drawer` (docked ≥56rem, overlay narrower) — not always mounted under response. Collections rows use hierarchy + kebab (GroupCard pattern); rename/delete use in-app modal (no `prompt`/`confirm`). Request tabs are a strip with method chip + name + dirty dot + separate close; Copy as cURL is under Tools. Request bar: Method+Rules clustered (`.request-meta`, selects `width: auto`); URL is `textarea.grow-field` focus-grow / one-line blur. Params/Headers share `KvTable` (counts on tabs). Dense Auth (`.auth-form` ≤32rem, label|control rows, tab dot when not none). Body: compact toolbar + none empty hint + KvTable for form bodies + Body tab dot when mode ≠ none. KV values / tokens / URL grow on focus and collapse on blur.
- Rule drawer: Match / Action / Test tabs in drawer chrome; ActionChip (always in head) switches Redirect/Block/Headers/Body/Mock/Inject/Local; Action panel holds type-specific fields (CodeMirror for body/code, Delivery, etc.). Docked drawer sits below sticky options bar (`--options-sticky-offset`).
- Validation has two levels. `errors` (schema) block Save now and pause autosave (no write, no forced focus). `warnings` (what the compiler would refuse, and Chrome's request-`append` allowlist) show at the field but don't block, so one refused rule never stops saving the rest.
- If storage changes while the draft is dirty, the editor shows a banner and pauses autosave instead of reloading; reloading is the user's choice. Popup group switches write the workspace immediately, so a dirty editor shows that banner.
- **Theme:** `storage.local.theme === 'light'` or anything else (including missing) is dark. `applyTheme` sets `data-theme` before the page mounts. CodeMirror follows the same attribute.
- **Recipes** (`workspace-ui/recipes.ts`) append a normal group to the editor draft. `buildRecipe` refuses input `parseWorkspace` or `compileRule` would refuse, including a host redirected at itself. Save applies them. No separate recipe file.
- **DevTools** does not attach `chrome.debugger`. Outside a DevTools window the panel has no inspected page. `chrome.devtools` is only available there.
- **Rule tester** (`workspace-ui/tester.ts`) resolves the editor draft, not a second matcher. Probe: URL, method (default GET), resource type (default page load), page URL (blank = the URL; ignored for a page load), subframe. Fetch/XHR: first matching mock wins and DNR does not run. Otherwise the earliest block, redirect, or body override wins (`previewMatch` for a redirect target). A note says Chrome may still redirect before the body is replaced. Header rules all apply; earlier set/remove wins per header; later appends still apply. Injects match the page URL and do not run when that page load is redirected or blocked. `compileRule` refusals and inline JS without user scripts are "matched, not applied". Notes when Detour is off or the draft is unsaved. Site scope uses the page host (top frame), not the initiatorDomains iframe gap.
- Background (`src/entrypoints/background.ts`) is wiring only; logic is pure or takes injected `DnrApi` / `StorageAreaLike`.

## Match log and badge (as built, ADR-010)

```
DNR onRuleMatchedDebug (unpacked Chromium) or getMatchedRules (packed fallback)
  + page CSS / script-URL notes, mock CustomEvent (rule id + URL only), body fulfill/filter
  → storage.session.matchLog (newest 50; label = group name + match pattern)
  → action.setBadgeText per tab (count since navigation; empty when off or Detour is off)
```

- Chromium manifest adds `declarativeNetRequestFeedback` (no install warning). Firefox does not. Chrome `debugger` is unchanged.
- DNR ids join `applyReport.applied`. Session ruleset rows are ignored. A poll row (`dnr-poll:` key, tab URL) is not counted again once a debug row has the request URL.
- `tabs.onUpdated` with `status: 'complete'` does not reset the badge clock. A loading event or a changed URL does. The clock lives in the service worker.
- Turning the badge or Detour off clears badge text without calling `getMatchedRules`. Compile errors stay on the apply report.

## rule-model shape

- `Workspace { groups: Group[] }`, `Group { id, name, enabled, pageDomains?, importedFrom?, importKey?, rules }` (`pageDomains` = run only on pages of these hosts + subdomains; `importedFrom { file, sha256 }` = provenance, so re-importing that file replaces the group, ADR-007), `Rule { id, enabled, match, action, resourceTypes?, caseSensitive?, note?, importKey? }`.
- `match`: `glob` (whole URL, `*` = any run incl. `/`, lazy captures) or `regex` (unanchored, RE2 subset).
- `action`: `redirect { to }` (glob: `*` in `to` = Nth captured wildcard; regex: `\1`–`\9`), `block`, `modifyHeaders { request[], response[] }` with `set | append | remove`, `injectJs` / `injectCss` `{ source: {kind:'inline',code} | {kind:'url',url}, runAt, allFrames, world? }`, `mock { method, status, headers[], body, delayMs }`, `overrideBody { body, contentType? }` (inline UTF-8, 1 MB), `serveLocal { path }` (relative to the bridge folder). Inject match is the page URL; mock, body, and serveLocal match the request URL. `resourceTypes` is ignored for inject and mock.
- `importKey` on groups and rules: stable identity inside an import (RO id, else position + type + match). Re-import copies `enabled` from the match.
- **Priority**: flattened position over enabled rules; DNR `priority = n - index` (unique, ≥ 1). Block/redirect: the earliest matching rule wins. modifyHeaders: every matching rule applies, and on the same header the earlier rule wins.
- Export file = storage envelope `{ v: 1, data }`. Import detects RO by array-shaped `data` / `ruleGroups`.

## Principles

- Least engine that works; escalate to Deep/Bridge only when needed
- RuleCompiler is the single place that maps actions → engines
- No Detour backend; storage is extension-local (+ optional sync storage later, not a cloud account)

## Packages

- `extension/` — WXT app (pnpm, standalone package)
- `cli/` — `@detour/cli`, Node 24 type-stripping, no compile step. Root `pnpm-workspace.yaml` covers `extension/` and `cli/`

## Brand flavors (ADR-026)

- `DETOUR_BRAND` (default `detour`) loads `extension/brands/<slug>/` at build time
- Detour zip: `corepack pnpm --filter @detour/extension zip` → `.output/detour/detour-<v>-chrome.zip`
- Rogers zip: `corepack pnpm --filter @detour/extension zip:rogers` → `.output/rogers/rogers-<v>-chrome.zip` (requires local gitignored `brands/rogers/`)
- Rogers (and other partner) flavors use **Detour** as the manifest/UI display name; partner identity is tokens, icons, and optional partner logo
- **Default delivery:** both zips unless a single flavor is requested
- UI tokens come from `brands/*/tokens.css` via `virtual:brand-tokens`; `ui/base.css` stays structural

**Last verified:** 2026-10-09
