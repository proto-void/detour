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

## Next

1. **Manual browser check** (engine-core verification): load `extension/.output/chrome-mv3` and `firefox-mv3`, seed a workspace in `storage.local`, and confirm a redirect/header/block on a sample page. There's no UI yet, so seed it from the service-worker console
2. **Hamza decisions** (see plan 002 open questions): Firefox gecko id; RO tab-URL group scoping; `main_frame` default for imported RO rules
3. **Next spec to review/Approve:** `workspace-ui` (minimal popup + options: toggle, RO import, apply report). That gives engine-core a real surface and a manual test path. `page-inject` / `api-mock` are next in build order if UI should wait

## Blocked

- Nothing for code. Further modules wait for their specs to be Approved
