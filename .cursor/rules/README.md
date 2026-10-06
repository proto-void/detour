# Cursor rules (thin adapters)

These rules are **short invariants** only. Full workflows live in `AI/` and vendor skills under `.cursor/skills/` (symlink → `AI/agent-skills/skills`).

| Rule | alwaysApply | Role |
|------|-------------|------|
| `project-intelligence.mdc` | yes | Read `AI/` first; write-back protocol; Draft specs gate |
| `coding-practices.mdc` | yes | Short coding invariants for Detour |
| `agent-skills.mdc` | yes | On-demand skill router (don't load all vendor skills) |

Do **not** paste full skill bodies into rules. Prefer updating `AI/intelligence/` or a `SKILL.md`.
