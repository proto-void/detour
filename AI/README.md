# AI Project Intelligence — Master Router

**Read this first.** Then open only what the task needs. Keep this file under ~80 lines.

## Session start

1. `PRODUCT.md` — locked strategy (Detour: point production at your code)
2. `PROGRESS.md` — done / next
3. Matching `intelligence/*` / `research/*` before grepping code
4. `specs/` — Draft until human Approves (`spec-workflow`)
5. Skill router: `.cursor/rules/agent-skills.mdc` → pick 1–3 skills

## Map

| Path | When |
|------|------|
| [PRODUCT.md](PRODUCT.md) | Vision, tiers, UX, hard nos |
| [PROGRESS.md](PROGRESS.md) | Status & next step |
| [DECISIONS.md](DECISIONS.md) | ADRs / durable choices |
| [intelligence/](intelligence/) | Architecture, stack, browsers, glossary |
| [research/](research/) | Upstream RO, Web Defuser, competitors |
| [specs/](specs/) | Module specs (Draft → Approved) |
| [plans/](plans/) | Numbered implementation plans only |
| [skills/](skills/) | Project skills (source of truth) |
| [skills-index.md](skills-index.md) | Phase → skill table |
| [agent-skills/](agent-skills/) | Vendor pack (addyosmani) |
| [agents/](agents/) | Personas |

## Protocol (read-first / write-back)

- Open the matching KB file **before** searching the codebase for product facts.
- Write durable discoveries back; bump **Last verified**; never store secrets.
- Specs gate code: see [skills/spec-workflow](skills/spec-workflow/SKILL.md).
- Details: [intelligence/README.md](intelligence/README.md) and skill `write-back-kb`.

## Precedence

1. `AI/PRODUCT.md` + intelligence + **Approved** specs for product facts  
2. Vendor/project skills for engineering process  
3. Thin `.cursor/rules/*` only — never paste full skill bodies into rules  

## Cursor discovery

`.cursor/skills` → `AI/agent-skills/skills` (addyosmani + project skill symlinks). No Flutter/Dart skills.
