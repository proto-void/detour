# Plan 036 — Query gutter, multi-results, Collections tree, helper CTA

**Status:** Done (2026-10-23)  
**Spec:** [db-client](../specs/db-client.md) (Approved — AC amended for plan 036)  
**Cursor plan:** `~/.cursor/plans/query_gutter_multi-results_5bb102a2.plan.md`  
**Started:** 2026-10-23  
**Finished:** 2026-10-23

## Goal

### A — Run / results

1. **Gutter:** On each statement-start line, replace the line number with a clickable Run icon; click runs that full statement (multi-line OK via `;` split).
2. **Toolbar Run:** Non-empty selection → run selection (one or many statements). No selection → run **all** statements in the buffer (not at-cursor).
3. **Multi results:** After a multi-statement run, show Result 1 / Result 2 / … plus Messages in the results pane (same editor tab). Mid-batch failure stops; keep prior Result tabs; error in Messages. No host batch RPC — sequential client `execute`.

### B — Collections as folders/files

4. **Vertical tree:** Collections → folders → queries stack vertically with expand/collapse and rename.

### C — Helper start UX

5. Replace `Helper: Stopped` pill with primary **Start database helper** when stopped; quiet Ready chip + Stop/Restart menu when ready; soft workbench banner; intent auto-start unchanged; no auto-start on tab open.

## Checklist

- [x] Amend db-client AC + this plan + README index
- [x] `statement.ts`: `statementStartLines`, `statementAtOffset`, `resolveRunPlan`; tests
- [x] Model: `resultSets` + `activeResultIndex` (+ migrate `lastResult`); `collectionsExpandedIds` in ui
- [x] Opt-in CodeMirror statement-start Run gutter + CodeEditor props (Databases only)
- [x] Databases sequential execute; Stop aborts remainder; confirms
- [x] DbResultsPane Result N + Messages; paging on active set
- [x] Vertical Collections tree; expand/collapse; rename; open on click
- [x] Helper Start CTA + Ready chip; workbench nudge; install-card copy
- [x] PROGRESS/KB + tests/typecheck + Detour zip

## Out of scope

Host multi-statement batch RPC; `;` inside strings/comments; SQL highlighter; parallel execute; drag-drop reorder; git folder sync; replace horizontal editor query tabs; auto-start helper on Databases tab open; CLI adapters/host protocol; Rogers.

## Verification

- Unit: statement helpers, storage migrate (`lastResult` → `resultSets`) — green
- Extension typecheck — green
- `corepack pnpm --filter @detour/extension zip` → `extension/.output/detour/detour-0.1.1-chrome.zip`

## Multitask-proof

Single stream. Owned: `statement.ts`(+tests), `model`/`storage` migrate, `codemirror`/`CodeEditor`, `Databases.svelte`, `DbQueryWorkbench`, `DbResultsPane`, `DbCollectionsTree.svelte`, db-client spec AC, this plan, PROGRESS/KB. Leave alone: CLI adapters/host protocol, API Tester feature logic, Rogers.
