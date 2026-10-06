# Conventions

**Last verified:** 2026-10-06

## Docs / KB

- Durable facts → `AI/intelligence/` or `AI/DECISIONS.md`
- Specs only in `AI/specs/`; plans only in `AI/plans/`
- Bump **Last verified** on edits
- No secrets in repo

## Naming

- Product: **Detour**
- Spec files: `kebab-case.md`
- Plans: `NNN-kebab-case.md`
- Future packages: prefer `@detour/*` on npm (unscoped `detour` taken)

## Code (when it exists)

- TypeScript strict; valibot at trust boundaries (import, storage load)
- Prefer small modules; RuleCompiler owns engine selection
- Match WXT + Svelte 5 idioms; no drive-by refactors
- UI: dark default; accessibility for popup toggles

## Git

- Conventional, why-focused commit messages
- Do not commit `node_modules/`, build outputs, or credentials
