# 002 — rule-model + engine-core (first vertical slice)

**Status:** Done (manual browser check pending)  
**Date:** 2026-10-06  
**Specs:** [rule-model](../specs/rule-model.md) (Approved), [engine-core](../specs/engine-core.md) (Approved)

## Goal

Scaffold `extension/` (ADR-001 stack) and ship the first vertical slice: a validated, persisted rule workspace that the background service worker compiles into `declarativeNetRequest` dynamic rules, with Detour export and Resource Override import.

## Plan (design)

### Package layout

```
extension/                  pnpm, standalone package (no root workspace until cli/ exists)
  wxt.config.ts             srcDir: src, MV3 for every browser
  src/entrypoints/background.ts   wiring only
  src/rule-model/           schema, glob matcher, storage, export/import, RO import
  src/engine-core/          compile, limits, apply, coalescing scheduler
  src/test/                 fake DNR stub
```

### rule-model

- **Workspace** `{ groups: Group[] }`; **Group** `{ id, name, enabled, rules[] }`; **Rule** `{ id, enabled, match, action, resourceTypes?, caseSensitive?, note? }`.
- **Match**: `{ kind: 'glob', pattern }` (anchored full URL, `*` = any run, lazy) or `{ kind: 'regex', pattern }` (unanchored, RE2 subset).
- **Action**: `redirect { to }` (glob: `*` in `to` substitutes captures in order; regex: `\1`–`\9`), `block`, `modifyHeaders { request[], response[] }` with ops `set | append | remove`.
- **Priority**: flattened position over enabled groups → enabled rules; first wins.
- **Envelope**: export and storage both use `{ v: 1, data: Workspace }`; RO is told apart by `data` being an array (or `ruleGroups` present).
- **RO import**: v1 `{v:1,data:[{matchUrl,on,rules}]}`; v2 `{v:2,ruleGroups|data:[{name|matchUrl,on,rules}]}`. `normalOverride` → redirect, `headerRule` → modifyHeaders (parse `set name: value;remove name`, URI-decoded), `fileOverride` / `fileInject` / unknown → structured skip. v2 `/…/` match → regex.
- Storage: `chrome.storage.local` key `workspace` (+ `unlimitedStorage`); load validates with valibot and never overwrites invalid data.

### engine-core

- `compileWorkspace` (pure): rule → DNR rule without id; `urlFilter` when the glob is expressible, else `regexFilter` (+ `regexSubstitution` for wildcard redirects).
- `enforceLimits` (pure): walk in priority order; keep what fits under regex / unsafe / total ceilings (read from the API constants, fallback 1000 / 5000 / 5000); refuse the rest with reasons.
- `applyWorkspace`: `isRegexSupported` pre-check when available → limits → ids 1..n → **one** `updateDynamicRules` that removes all existing dynamic rules and adds the new set. On rejection: drop the rule named in `Rule with id N`, retry; if no id is named, fall back to per-rule adds so what fits still applies.
- `createCoalescer`: overlapping refresh requests collapse into at most one follow-up run.
- Background: re-apply on install / startup / `storage.onChanged(workspace)`; write an `applyReport` to `storage.local` (no rule bodies leave the device).

## Tasks

- [x] T0 Approve specs in KB; this plan
- [x] T1 Scaffold `extension/` (WXT 0.21 + TS + Svelte 5 module + valibot + Vitest); `.gitignore` covers outputs; both browser builds green
- [x] T2 rule-model schema + issue formatting — accept/reject fixture tests
- [x] T3 glob/regex matcher (`globToRegexSource`, `compileMatcher`) — tests
- [x] T4 storage layer (load/save, invalid data preserved) — tests
- [x] T5 Detour export/import round trip (golden file) — tests
- [x] T6 RO import v1 + v2 (+ `ruleGroups`, legacy `matchUrl`, `{}` export bug) — fixture mapping tests
- [x] T7 engine-core compiler (urlFilter vs regex, priority, actions) — tests
- [x] T8 limits + apply (single batch, ceiling, rejected-rule retry, fallback) + coalescer — tests with fake DNR
- [x] T9 background wiring; `wxt build` + `wxt build -b firefox`; inspect manifests
- [x] T10 KB write-back (architecture, conventions, gotchas, tech-baseline, DECISIONS ADR-004/005, PROGRESS)
- [ ] T11 Manual check in Chrome + Firefox (spec Verification), needs a seeded workspace; no UI yet

## Results

- 87 Vitest tests across 7 files; `tsc --noEmit` clean
- `wxt build` → `chrome-mv3` (service worker, ~14.6 kB); `wxt build -b firefox` → `firefox-mv3` (event page). The only warning is the missing gecko id

## Deviations from spec

- None against acceptance criteria. Additions: a `redirect-loop` refusal, and `caseSensitive`, `resourceTypes` and `note` rule fields
- RO `fileOverride` / `fileInject` are skipped (structured reasons) rather than mapped, because no approved engine can serve bodies without `data:` redirects (see gotchas)

## Open questions (Hamza)

1. **Firefox gecko id**: AMO needs `browser_specific_settings.gecko.id` for MV3. Which id should we use (ties to distribution / domain)?
2. **RO tab-URL group scoping**: imported groups with a non-`*` page pattern now apply on every page (with a warning). Should we add optional group scoping via DNR `initiatorDomains` / `topDomains` (topDomains is newer Chrome only), or import those groups disabled?
3. **`main_frame` default**: Detour follows the DNR default (all types except main_frame). RO mv3 matched main_frame too. Should RO imports set explicit all-types to stay faithful?
4. **Fallback cost**: the per-rule fallback can issue n calls on an unexplained rejection. That's acceptable as an error path, but should we bisect instead?

## Out of scope

- Any UI (workspace-ui is Draft); `cli/`
- File overrides / body rewrite (engine-deep, local-bridge), page inject, mocks
- Manual browser E2E (spec lists it; tracked as follow-up once a UI or test harness exists)

## Verification

- `pnpm test` green; `pnpm typecheck` clean
- `pnpm build` and `pnpm build:firefox` succeed; generated manifests carry `declarativeNetRequest`, `storage`, `unlimitedStorage`, `<all_urls>` host permission, MV3
