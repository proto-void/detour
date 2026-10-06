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
- npm: `@detour/*` (unscoped `detour` taken); extension package is `@detour/extension`

## Code

- TypeScript strict + `noUncheckedIndexedAccess`; valibot at trust boundaries (import, storage load/save)
- One folder per spec module under `extension/src/` (`rule-model/`, `engine-core/`, `page-inject/`). api-mock shares `page-inject/` (one registration path). Entrypoints stay wiring-only
- Types come from schemas (`v.InferOutput`), not hand-written duplicates
- Browser APIs are injected as narrow interfaces (`DnrApi`, `StorageAreaLike`) so logic is testable without a browser; cast `browser.*` once at the entrypoint
- Fallible pure functions return `{ ok: true, value } | { ok: false, errors }`; user-facing errors carry a dot path (`data.groups.0.rules.2.match.pattern: …`)
- Refusals / import notices use a stable `reason`/`code` string plus a human message; never include rule bodies or file contents
- Tests colocated as `*.test.ts`; fixtures in `__fixtures__/`; DNR fake in `src/test/fake-dnr.ts`; storage via `fakeBrowser` from `wxt/testing/fake-browser`
- Match WXT + Svelte 5 idioms; no drive-by refactors
- UI: dark default; accessibility for popup toggles

## Git

- Conventional, why-focused commit messages; each commit builds and passes tests
- Do not commit `node_modules/`, `.output/`, `.wxt/`, or credentials
