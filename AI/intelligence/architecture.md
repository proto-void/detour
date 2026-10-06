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
| `page-inject` | JS/CSS inject via scripting | — |
| `api-mock` | fetch/XHR mocks in page world | — |
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
- Import = `importIntoStorage(text, area, { fileName })` → `mergeImported`: replaces groups from the same file (name or SHA-256) in place, else appends; always fresh ids. It refuses to write over an unreadable workspace.

## UI (workspace-ui)

| Surface | Entry | Holds |
|---------|-------|-------|
| Popup | `src/entrypoints/popup/` | global switch, import, applied/refused report, "Edit rules…" → `runtime.openOptionsPage()` |
| Editor | `src/entrypoints/options/` (`options_ui`, `open_in_tab`) | groups/rules CRUD + reorder, switches, site scoping, validation, preview, Save/Discard, Export |
| Shared | `src/ui/` | `base.css` tokens, `Switch`, `Field`, `announcer` (one live region per page) |
| Logic | `src/workspace-ui/` | `import-flow`, `report-view`, `editor` (pure; all unit tested) |

- Editor model: `draft` and `saved` are `$state.raw` workspaces, changed only through the immutable ops in `editor.ts`. Save = `saveWorkspace(draft)`. A rule's status is "Applying" until an `applyReport` with `appliedAt` ≥ the moment the save started arrives.
- Validation has two levels. `errors` (schema) block Save. `warnings` (what the compiler would refuse, and Chrome's request-`append` allowlist) show at the field but don't block, so one refused rule never stops saving the rest.
- If storage changes while the draft is dirty, the editor shows a banner instead of reloading; reloading is the user's choice.
- Background (`src/entrypoints/background.ts`) is wiring only; logic is pure or takes injected `DnrApi` / `StorageAreaLike`.

## rule-model shape

- `Workspace { groups: Group[] }`, `Group { id, name, enabled, pageDomains?, importedFrom?, rules }` (`pageDomains` = run only on pages of these hosts + subdomains; `importedFrom { file, sha256 }` = provenance, so re-importing that file replaces the group, ADR-007), `Rule { id, enabled, match, action, resourceTypes?, caseSensitive?, note? }`.
- `match`: `glob` (whole URL, `*` = any run incl. `/`, lazy captures) or `regex` (unanchored, RE2 subset).
- `action`: `redirect { to }` (glob: `*` in `to` = Nth captured wildcard; regex: `\1`–`\9`), `block`, `modifyHeaders { request[], response[] }` with `set | append | remove`.
- **Priority**: flattened position over enabled rules; DNR `priority = n - index` (unique, ≥ 1). Block/redirect: the earliest matching rule wins. modifyHeaders: every matching rule applies, and on the same header the earlier rule wins.
- Export file = storage envelope `{ v: 1, data }`. Import detects RO by array-shaped `data` / `ruleGroups`.

## Principles

- Least engine that works; escalate to Deep/Bridge only when needed
- RuleCompiler is the single place that maps actions → engines
- No Detour backend; storage is extension-local (+ optional sync storage later, not a cloud account)

## Packages

- `extension/` — WXT app (pnpm, standalone package)
- `cli/` — Local Bridge (not created until its spec is Approved)
