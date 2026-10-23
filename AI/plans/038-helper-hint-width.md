# Plan 038 — Helper hint, collection seed, delete modal, Connection height

**Status:** Done (2026-10-23)  
**Spec:** [db-client](../specs/db-client.md) (Approved — AC amended for plan 038)  
**Cursor plan:** `~/.cursor/plans/helper_hint_full_width_9e8ec180.plan.md`  
**Builds on:** plan 037  
**Started:** 2026-10-23  
**Finished:** 2026-10-23

## Goal

1. Header helper description shows the **full** one-line text (extend left; no ellipsis at normal widths).
2. **Create collection** seeds only **My queries** with **no** nested **General** folder; queries under the collection by default.
3. Delete collection / folder / query uses a **Detour in-app modal**, not Chrome `window.confirm`.
4. Connection dialog: **bottom follows content** (no empty gap above footer on short tabs like SSL). Top stays anchored. Cap height; when over max, **body scrolls**.

## Checklist

- [x] Amend db-client AC + this plan + README index
- [x] Helper: widen `.helper-start`; drop ellipsis for short hint (ellipsis only when extremely narrow)
- [x] Collection seed: `{ name: 'My queries', queries: [], folders: [] }` on Create + save bootstrap; existing General left alone
- [x] Delete modal: `deleteConfirm` state; Cancel/Delete; Escape dismiss; no typed-name
- [x] Connection: `.conn-form-body { flex: 0 1 auto }`; height hugs; footer `flex: 0 0 auto`; body scrolls at cap
- [x] DoD: typecheck + PROGRESS + Detour zip

## Locked decisions

- **Helper:** Button right-aligned; hint grows left; full one-line at normal widths.
- **Seed:** No General folder on new collections; Save/New query → collection root when `folders` empty (`defaultSaveLocation` already).
- **Delete:** In-app `.modal` / `.modal-card`; same wording as prior `confirm()`; typed confirm stays for destructive CQL only.
- **Connection:** Top-anchored; grow/shrink from bottom; primary scroll = `.conn-form-body`.

## Out of scope

- CLI, gutter logic, API Tester, Rogers.
- Migrating existing General folders away.
- Typed-name confirm for collection deletes.

## Verification

- Extension typecheck — green
- `corepack pnpm --filter @detour/extension zip` → `extension/.output/detour/detour-<version>-chrome.zip`

## Multitask-proof

Single stream. Owned: `Databases.svelte`, plan 038, PROGRESS, db-client AC. Leave alone: gutter, CLI, API Tester, Rogers.
