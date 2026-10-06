# Architecture

**Last verified:** 2026-10-06

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
| `engine-deep` | Chromium debugger body path | — |
| `local-bridge` | Node CLI loopback file server | — |
| `workspace-ui` | Popup, options, recipes, tester, RO import | `extension/src/workspace-ui/` (logic) + `src/entrypoints/popup/` (slice 1) + `src/entrypoints/options/` (slice 2) |
| `observability` | Badge, match log, errors (no rule-body telemetry) | — |
| `distribution` | Stores, permissions narrative, CI artifacts | — |

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

## UI (workspace-ui)

| Surface | Entry | Holds |
|---------|-------|-------|
| Popup | `src/entrypoints/popup/` | global switch, import, applied/refused report, "Edit rules…" → `runtime.openOptionsPage()`, "Test a URL…" → `options.html#tester` |
| Editor | `src/entrypoints/options/` (`options_ui`, `open_in_tab`) | groups/rules CRUD + reorder, switches, site scoping, request types (collapsed Advanced), inject/mock fields, CodeMirror 6 (options chunk only), validation, preview, Save/Discard, Export, user-scripts banner, rule tester |
| Shared | `src/ui/` | `base.css` tokens, `Switch`, `Field`, `announcer` (one live region per page) |
| Logic | `src/workspace-ui/` | `import-flow`, `report-view`, `editor` (pure; all unit tested) |

- Editor model: `draft` and `saved` are `$state.raw` workspaces, changed only through the immutable ops in `editor.ts`. Save = `saveWorkspace(draft)`. A rule's status is "Applying" until an `applyReport` with `appliedAt` ≥ the moment the save started arrives.
- Validation has two levels. `errors` (schema) block Save. `warnings` (what the compiler would refuse, and Chrome's request-`append` allowlist) show at the field but don't block, so one refused rule never stops saving the rest.
- If storage changes while the draft is dirty, the editor shows a banner instead of reloading; reloading is the user's choice.
- **Rule tester** (`workspace-ui/tester.ts`) resolves the editor draft, not a second matcher. Probe: URL, method (default GET), resource type (default page load), page URL (blank = the URL; ignored for a page load), subframe. Fetch/XHR: first matching mock wins and DNR does not run. Otherwise the earliest block or redirect wins (`previewMatch` for the target). Header rules all apply; earlier set/remove wins per header; later appends still apply. Injects match the page URL and do not run when that page load is redirected or blocked. `compileRule` refusals and inline JS without user scripts are "matched, not applied". Notes when Detour is off or the draft is unsaved. Site scope uses the page host (top frame), not the initiatorDomains iframe gap.
- Background (`src/entrypoints/background.ts`) is wiring only; logic is pure or takes injected `DnrApi` / `StorageAreaLike`.

## rule-model shape

- `Workspace { groups: Group[] }`, `Group { id, name, enabled, pageDomains?, importedFrom?, importKey?, rules }` (`pageDomains` = run only on pages of these hosts + subdomains; `importedFrom { file, sha256 }` = provenance, so re-importing that file replaces the group, ADR-007), `Rule { id, enabled, match, action, resourceTypes?, caseSensitive?, note?, importKey? }`.
- `match`: `glob` (whole URL, `*` = any run incl. `/`, lazy captures) or `regex` (unanchored, RE2 subset).
- `action`: `redirect { to }` (glob: `*` in `to` = Nth captured wildcard; regex: `\1`–`\9`), `block`, `modifyHeaders { request[], response[] }` with `set | append | remove`, `injectJs` / `injectCss` `{ source: {kind:'inline',code} | {kind:'url',url}, runAt, allFrames, world? }`, `mock { method, status, headers[], body, delayMs }`. Inject match is the page URL; mock match is the request URL. `resourceTypes` is ignored for those actions.
- `importKey` on groups and rules: stable identity inside an import (RO id, else position + type + match). Re-import copies `enabled` from the match.
- **Priority**: flattened position over enabled rules; DNR `priority = n - index` (unique, ≥ 1). Block/redirect: the earliest matching rule wins. modifyHeaders: every matching rule applies, and on the same header the earlier rule wins.
- Export file = storage envelope `{ v: 1, data }`. Import detects RO by array-shaped `data` / `ruleGroups`.

## Principles

- Least engine that works; escalate to Deep/Bridge only when needed
- RuleCompiler is the single place that maps actions → engines
- No Detour backend; storage is extension-local (+ optional sync storage later, not a cloud account)

## Packages

- `extension/` — WXT app (pnpm, standalone package)
- `cli/` — Local Bridge (not created until its spec is Approved)
