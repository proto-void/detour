# Plan 037 — Databases helper, Collections, Connection dialog polish

**Status:** Done (2026-10-23)  
**Spec:** [db-client](../specs/db-client.md) (Approved — AC amended for plan 037)  
**Cursor plan:** `~/.cursor/plans/databases_collections_polish_b96ba995.plan.md`  
**Builds on:** plan 036  
**Started:** 2026-10-23  
**Finished:** 2026-10-23

## Goal

1. One compact helper Start control (no duplicate banner; one-line hint; frees space when ready).
2. Line numbers always visible; Run icon only on hover over statement-start lines.
3. Collections tree: larger chevrons; icon rename/delete; delete collection/folder/query; queries under collection **or** folders; query icon; drag queries between collections/folders.
4. Connection dialog feels like a popup in dark mode (clear edge) and **does not jump** when switching Main / SSL / SSH / Advanced — top edge stays fixed; height changes only downward.
5. Main tab: no example placeholder on Local datacenter; Read-only checkbox aligned with its label (horizontal row); Color picker only opens from the swatch.

## Checklist

- [x] Amend db-client AC + this plan + README index
- [x] Helper: remove workbench banner; one-line header hint; compact Ready chip
- [x] Gutter: always line numbers; Run icon hover-only on statement starts
- [x] Model: `Collection.queries` + migrate; move/delete helpers; Save default
- [x] Tree UX: bigger chevrons; icon rename/delete; New folder/query; DnD
- [x] Icons: `trash` + query/file in `Icon.svelte`
- [x] Connection dialog: border/shadow/scrim; top-anchored; scrollable body
- [x] Main fields: clear Local DC placeholder; align Read-only; Color hit target
- [x] DoD: tests + typecheck + PROGRESS/KB + Detour zip

## Locked decisions

- **Helper:** Header only; no workbench banner; hint when stopped/connecting; no hint when ready.
- **Gutter:** Line numbers always; Run opacity 0 until hover on statement-start row.
- **Tree model:** `collection.queries[]` + `folders[].queries[]`. Save default: first folder if any, else collection root.
- **Delete:** `confirm` for non-empty collection/folder; cascade; clear `collectionQueryId` on open tabs.
- **DnD:** HTML5 drag queries onto collection root or folder; append to target.
- **Connection dialog:** Top-anchor; stronger border/shadow/scrim; fixed width; body scrolls.
- **Main fields:** No Local DC placeholder; Read-only horizontal; Color caption not a large label proxy.

## Out of scope

- Drag collections/folders as wholes; multi-select DnD; nested folders deeper than one level.
- Auto-start helper on tab open.
- Changing editor query-tab strip layout.
- Redesigning SSL/SSH field sets (chrome/anchor + Main polish only).

## Verification

- Unit: move/delete/migrate collections — green
- Extension typecheck — green
- `corepack pnpm --filter @detour/extension zip` → `extension/.output/detour/detour-<version>-chrome.zip`

## Multitask-proof

Single stream. Owned: `Databases.svelte`, `DbCollectionsTree.svelte`, `codemirror`/`CodeEditor`, `model`/`storage`(+tests), `fields.ts`, `Icon.svelte`, spec/plan/PROGRESS. Leave alone: CLI host/adapters, API Tester feature logic, Rogers.
