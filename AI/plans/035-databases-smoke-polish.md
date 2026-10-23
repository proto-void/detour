# Plan 035 — Databases smoke polish

**Status:** Done (2026-10-23)  
**Spec:** [db-client](../specs/db-client.md) (Approved)  
**Cursor plan:** `~/.cursor/plans/fix_tab_scrollbar_b373143d.plan.md`  
**Started:** 2026-10-23  
**Finished:** 2026-10-23

## Goal

Smoke polish after plan 034: thin scrollbars; sidebar panel headings/empty UX; nested object explorer with **active keyspace** (`USE` / session default) so unqualified `FROM table` works; sticky New Tab `+` outside the scrolling tab strip.

## Checklist

- [x] Thin scrollbar CSS on `.tab-strip`, `.conn-list`, `.hist`, explorer body, sidebar panel
- [x] Sticky `+` outside horizontally scrolling tablist (`DbQueryWorkbench`)
- [x] Panel titles Connections / Collections / History
- [x] History empty: “Run a query to build history.”
- [x] Collections empty folder: “No saved queries yet.” + Save current query here
- [x] Nested explorer tree (All keyspaces vs active KS); remove Back/All crumb
- [x] Persist `activeKeyspaceByConnectionId` + `expandedIdsByConnectionId`; seed from connection.keyspace
- [x] Host RPC `setKeyspace` + Cassandra `USE`; MySQL `USE`; Postgres `search_path`
- [x] `qualifyTableRef` / append SELECT unqualified when active KS matches
- [x] Unit tests + Detour zip DoD + PROGRESS/KB write-back

## Out of scope

Drag-reorder. Collections kebab parity. Tab overflow dropdown. True virtualization. Server-side Cassandra kill. Rogers.

## Verification

- Unit: `qualifyTableRef`, append qualification, setKeyspace RPC, related db-client tests
- `corepack pnpm --filter @detour/extension zip` → `extension/.output/detour/detour-<version>-chrome.zip`

## Multitask-proof

Single stream. Owned: `options/db/*`, `Databases.svelte`, `db-client/{model,query-tabs}`, `cli/src/db/{host,adapters/{types,cassandra,mysql,postgres}}`, plan/spec/PROGRESS/KB. Leave alone: API Tester feature logic; pack/Rogers; unrelated engines.
