# Project skills (source of truth)

These live here and are **symlinked** into `AI/agent-skills/skills/` so `.cursor/skills` exposes them with the vendor pack.

| Skill | Purpose |
|-------|---------|
| [start-session](start-session/SKILL.md) | Open router + product + progress + KB |
| [write-back-kb](write-back-kb/SKILL.md) | Update intelligence files safely |
| [plan-workflow](plan-workflow/SKILL.md) | Create/execute plans under `AI/plans/` only |
| [spec-workflow](spec-workflow/SKILL.md) | Draft → Approved gate; specs only in `AI/specs/` |

Do not duplicate full skill bodies into `.cursor/rules`.
