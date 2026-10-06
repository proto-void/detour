# Architecture

**Last verified:** 2026-10-07

## Pipeline

```
Rules → RuleCompiler → Core DNR            (built: engine-core)
                     → Inject scripting
                     → Mock fetch/XHR
                     → Deep chrome.debugger
                     → FF filterResponseData
                     → Local Bridge CLI
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

## Body override (as built, ADR-009)

```
enabled workspace
  → planBody → overrideBody rules (workspace order) + Fetch urlPatterns
  → sync (inside syncRules), only when bodyEngineConsent is true and the browser permission is present:
       Chrome: debugger.attach(tab, "1.3") on http(s) tabs, Fetch.enable at Response,
               fulfillRequest (base64 UTF-8) on match, continueResponse otherwise
       Firefox: blocking webRequest listener; filterResponseData only for a match
  → applyReport.bodies = [{ groupId, ruleId }]  (ids only)
     refused reason body-permission-denied when consent or permission is missing
```

- DNR compile skips `overrideBody`. Global off and an empty plan detach and clear the filter.
- Chrome `debugger` is an install-time permission. The session is created only after consent, because the API is missing until the permission exists. Firefox `webRequest`, `webRequestBlocking`, and `webRequestFilterResponse` stay optional and are requested from Allow response rewriting.
- First matching enabled rule wins. Omitted resource types match everything except `main_frame`. A document whose frame is unknown matches only when the rule lists both `main_frame` and `sub_frame`, so a page is not replaced by accident.
- Replaced responses drop `content-encoding`, `content-length`, and `transfer-encoding`. Status and other headers stay. Optional content type replaces `Content-Type`.
- Cancelling Chrome’s debugging banner leaves that tab detached until the body-rule plan changes. DevTools on the tab detaches Detour.
- RO `fileOverride` maps to `overrideBody` (the export holds file bytes). `fileInject` stays skipped. A file on disk is `serveLocal`, not this import.
- While those rules are armed, Chrome also pauses `Document` responses and Firefox filters document streams. Matching script and stylesheet tags in UTF-8 HTML get `sha384-` of the bytes that rule will serve (ADR-014). A failed read leaves the published hash.

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
- Inline `overrideBody` is unchanged as a rule action. While either that rule or an in-place `serveLocal` rule is armed, HTML documents get a SHA-384 `integrity` of the replacement on matching script and stylesheet tags (ADR-014). The same list is embedded in `<meta name="detour-sri">` and a MAIN-world `document_start` hook applies it when page JavaScript assigns `integrity` (ADR-015), passes the tag to `innerHTML` / `insertAdjacentHTML` (ADR-016), or inserts markup that runs scripts through `createContextualFragment` or `setHTMLUnsafe` with `runScripts: true` (ADR-017). The redirect fallback does not rewrite the document and does not install the hook.

## UI (workspace-ui)

| Surface | Entry | Holds |
|---------|-------|-------|
| Popup | `src/entrypoints/popup/` | global switch, first 8 group switches (immediate save), import, applied/refused report, Badge switch (`storage.local.showBadge`, missing means on), "Match log…" → `options.html#log`, "Recipes…" → `options.html#recipes`, "Test a URL…" → `options.html#tester`, "Edit rules…" → `runtime.openOptionsPage()`, Light theme switch |
| Editor | `src/entrypoints/options/` (`options_ui`, `open_in_tab`) | groups/rules CRUD + reorder, switches, site scoping, request types (collapsed Advanced), inject/mock fields, CodeMirror 6 (options chunk only), validation, preview, Save/Discard, Export, user-scripts banner, rule tester, recipe picker, Recent matches (`#log`), Light theme switch |
| DevTools | `src/entrypoints/devtools/` + `devtools-panel/` | `devtools_page` creates a Detour panel. The panel runs `inspectPage` (page-load `resolveProbe`) for the inspected tab |
| Shared | `src/ui/` | `base.css` tokens (dark default, `data-theme="light"`), `Switch`, `Field`, `ThemeToggle`, `announcer` (one live region per page) |
| Logic | `src/workspace-ui/` | `import-flow`, `report-view`, `editor`, `popup`, `recipes`, `devtools`, `tester` (pure; all unit tested) |

- Editor model: `draft` and `saved` are `$state.raw` workspaces, changed only through the immutable ops in `editor.ts`. Save = `saveWorkspace(draft)`. A rule's status is "Applying" until an `applyReport` with `appliedAt` ≥ the moment the save started arrives.
- Validation has two levels. `errors` (schema) block Save. `warnings` (what the compiler would refuse, and Chrome's request-`append` allowlist) show at the field but don't block, so one refused rule never stops saving the rest.
- If storage changes while the draft is dirty, the editor shows a banner instead of reloading; reloading is the user's choice. Popup group switches write the workspace immediately, so a dirty editor shows that banner.
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
