# 000 — Workspace setup

**Status:** Done  
**Date:** 2026-10-06

## Goal

Initialize the Detour repo with git, Cursor rules, addyosmani skills (no Flutter/Dart), project skills, and KB routers — zero extension/cli code.

## Checklist

- [x] `git init` (branch `main`)
- [x] `AGENTS.md`, `README.md`, `.gitignore`, `.cursorignore`
- [x] `.cursor/rules/` thin adapters (Detour-adapted)
- [x] `.cursor/skills` → `../AI/agent-skills/skills`
- [x] Copy addyosmani pack; prune `dart-*` / `flutter-*`
- [x] Project skills + symlinks: start-session, write-back-kb, plan-workflow, spec-workflow
- [x] Personas under `AI/agents/` with Detour `default.md`
- [x] KB core: README, PRODUCT, PROGRESS, DECISIONS, skills-index

## Out of scope

- `extension/` or `cli/` scaffolding
- Approving specs

## Verification

- `ls AI/agent-skills/skills | grep -E 'flutter|dart'` → empty
- `AI/README.md` under ~80 lines
- Links in router resolve
