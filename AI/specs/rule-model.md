# Spec: rule-model

**Status:** Approved (by Hamza, 2026-10-06)  
**Last updated:** 2026-10-06  
**Build order:** 1  
**Plan:** [002-rule-model-engine-core](../plans/002-rule-model-engine-core.md)

## Objective

Define the canonical Detour rule schema, grouping, priority, validation (valibot), and import/export formats — including a path to import Resource Override data — so every engine compiles from one source of truth.

## User stories

- As a developer, I can create rule groups and ordered rules that persist across sessions.
- As a migrating RO user, I can import an RO export and see mapped Detour rules (with clear warnings for unsupported actions).
- As a power user, I can export my workspace to a portable JSON file and re-import it losslessly for Detour-native fields.

## Acceptance criteria

- [ ] Documented TypeScript types + valibot schemas for rules, groups, and workspace export `{ v, data }`
- [ ] Priority model: group order + in-group order; first match wins (aligned with RO webRequest semantics / PR #73)
- [ ] Enable/disable at rule and group level
- [ ] Detour export round-trips without data loss for supported fields
- [ ] RO import maps common redirect/header/file rules or emits structured skip reasons
- [ ] Invalid imports fail with actionable errors (no silent `{}`)

## Browser support table

| Browser | Min | Notes |
|---------|-----|-------|
| Chrome / Edge / Brave | 120+ | Storage APIs |
| Firefox | 128 ESR+ | Storage APIs |
| Safari | 17+ | Storage TBD; schema still applies |

## Limits and gotchas

- Do not exceed practical storage quotas; large file bodies may belong in Bridge, not sync storage
- RO v2 field naming bugs (`data` vs `ruleGroups`, `name` vs `matchUrl`) must be tolerated on import
- Schema version field required for future migrations

## Out of scope

- Engine compile logic (see `engine-core` and others)
- UI editors (see `workspace-ui`)
- Cloud sync accounts

## Verification

- Unit tests for valibot accept/reject fixtures
- Round-trip export/import golden files
- RO sample import fixtures with expected mapping table
- Human review of Draft → Approve before implementation
