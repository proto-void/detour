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

- [x] Hamza's plan-003 answers: re-import replaces same-file groups (`importedFrom`, ADR-007); iframe gap accepted and warned about in the editor; CI e2e recorded in the `distribution` spec (not built)
- [x] **workspace-ui slice 2** Approved (Hamza, 2026-10-06) and built (plan 004): options-page rule editor (CRUD, reorder, group/rule switches, site scoping, live validation, preview, Save, inline status, Export). 164 unit tests; Chrome + Firefox builds clean; `pnpm e2e:chrome` 23/23
- [x] Hamza's plan-004 answers: re-import keeps on/off via `importKey`; name-only match asks (content-hash match replaces silently); request types live in a collapsed Advanced section
- [x] **page-inject** + **api-mock** Approved (Hamza, 2026-10-06) and built (plan 005, ADR-008): inline and URL JS/CSS, MAIN-world fetch/XHR mocks, CodeMirror 6 on the options page, apply-report refusals and session page failures. 239 unit tests; Chrome + Firefox builds clean; `pnpm e2e:chrome` 41/41 on Chrome for Testing 154
- [x] **workspace-ui slice 3 (rule tester)** Approved (Hamza, 2026-10-06) and built (plan 006): paste a URL on the rules page (popup opens it) and see which rule wins, using engine precedence across redirect, block, headers, inject, and mock. 263 unit tests; Chrome + Firefox builds clean; `pnpm e2e:chrome` 45/45
- [x] **Firefox check** (plans 003–006) on Firefox 157.0.1: headless temporary add-on, 43/43. Tab importer (RO export, file override skipped, port warning), editor create/save for redirect, block, headers, inject, and mock, Detour on/off, iframe warning (`RuleConditionKeys` null), CSS inject, fetch/XHR mock, inline JS after Allow user scripts, rule tester (win / no match / loop)

## Next

1. **workspace-ui slice 4** Approved (Hamza, 2026-10-06), plan 007 in progress: recipes, DevTools panel, light theme, popup group toggles
2. `engine-deep` is next in engine build order if body override comes first
3. `distribution` approval unlocks CI (unit + build + `e2e:chrome`)

## Blocked

- Nothing for code. Further modules wait for their specs to be Approved
