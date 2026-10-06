# Progress

**Last verified:** 2026-10-06

## Done

- [x] Workspace git init + root agent entrypoints (`AGENTS.md`, `README.md`, ignores)
- [x] Cursor thin rules + `.cursor/skills` → vendor skills
- [x] addyosmani agent-skills pack installed (Flutter/Dart pruned)
- [x] Project skills: `start-session`, `write-back-kb`, `plan-workflow`, `spec-workflow`
- [x] KB core: `PRODUCT`, `DECISIONS`, `intelligence/*`, `research/*`
- [x] Spec-driven Phase 0 + Specify: capability map + Draft module specs
- [x] Plans `000-workspace-setup`, `001-research-and-specs`
- [x] **rule-model** + **engine-core** specs Approved (Hamza, 2026-10-06)
- [x] Plan `002-rule-model-engine-core`: `extension/` scaffold (WXT 0.21, TS 6, Svelte 5 module, valibot, Vitest 5, pnpm), rule schema, matcher, storage, Detour export/import, RO v1/v2 import, DNR compiler, limits, atomic apply, coalescer, background wiring. 87 unit tests; Chrome + Firefox MV3 builds green

- [x] Hamza's plan-002 answers applied: gecko id `detour@protovoid.com`; RO page scoping preserved via `pageDomains` (ADR-006); imported RO rules include `main_frame`; single-rule fallback kept
- [x] **workspace-ui slice 1** Approved (Hamza, 2026-10-06) and built (plan 003): Svelte 5 popup with a global switch, RO/Detour import, and an applied/refused report. 130 unit tests; Chrome + Firefox builds warning-free; real Chrome 154 smoke `pnpm e2e:chrome` 14/14

## Next

1. **Firefox manual check** (steps in plan 003), especially the tab-based importer
2. **Next spec to review/Approve:** the `workspace-ui` remainder (rule editor + group toggles is the most-needed piece) or `page-inject` / `api-mock` per build order
3. Consider running `e2e:chrome` in CI once `distribution`/CI work is approved

## Blocked

- Nothing for code. Further modules wait for their specs to be Approved
