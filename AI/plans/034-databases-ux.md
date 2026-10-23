# Plan 034 — Databases major UX redesign

**Status:** Done (2026-10-23)  
**Spec:** [db-client](../specs/db-client.md) (Approved)  
**Cursor plan:** `~/.cursor/plans/databases_ux_redesign_cf04518f.plan.md`  
**Started:** 2026-10-23  
**Finished:** 2026-10-23

## Goal

One-wave redesign of the **Databases** tab into a Detour workbench inspired by SSMS / DBeaver: icon rail, collapsible Object Explorer, multi query tabs with per-tab results, Results|Messages, connection dialog Main/SSL/SSH/Advanced, Stop cancel, Run selection / at-cursor — without icon clutter or paid SaaS.

## Checklist

- [x] `AI/plans/034-databases-ux.md` + README index
- [x] State migration: `ui`, `queryTabs` (+ `lastResult`), `activeQueryTabId`; persist `syncFolder`
- [x] Scaffold `DbSidebar` / `DbExplorer` / `DbQueryWorkbench` / `DbResultsPane` (connection dialog stays in `Databases.svelte` with Main|SSL|SSH|Advanced tabs)
- [x] Chrome: icon rail, collapse nav/explorer, helper status menu, toolbar affordance, refresh/stop icons
- [x] Connection dialog Main | SSL | SSH | Advanced (keep all fields)
- [x] Explorer: Back/All, search, groups, columns (no auto DDL), click/dblclick/Shift+dblclick, column insert, collapse
- [x] Query tabs + Save + connectionId rules + per-tab results
- [x] Results|Messages + `formatDbCell` + Drawer + vertical priority
- [x] Cancel (`requestId`) + Stop; Run selection / at-cursor; Mod+Enter
- [x] Unit tests + typecheck + Detour zip DoD + PROGRESS/spec/KB write-back

## Out of scope

Drag splitters; SQL highlighter package; params UI; multi-statement batch RPC; true virtualization; server-side Cassandra kill; Rogers.

## Verification

- Unit: `formatDbCell`, append/dedupe, statement-at-cursor, cancel race, state migrate, syncFolder persist
- Typecheck / relevant tests green
- `corepack pnpm --filter @detour/extension zip` → `extension/.output/detour/detour-<version>-chrome.zip`

## Multitask-proof

Single stream. Owned: Databases entry + `options/db/*`, `db-client/{model,storage,cell-format,query-tabs,statement}.ts`, `ui/{codemirror,CodeEditor,Icon,base.css,Drawer}`, `cli/src/db/{host,adapters/types,cassandra}`, plan/spec/PROGRESS. Leave alone: API Tester feature logic; pack/Rogers; unrelated engines.
