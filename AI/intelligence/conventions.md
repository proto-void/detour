# Conventions

**Last verified:** 2026-10-09 (plan 029 partner hooks / ADR-030; OS packs)

## Docs / KB

- Durable facts → `AI/intelligence/` or `AI/DECISIONS.md`
- Specs only in `AI/specs/`; plans only in `AI/plans/`
- Bump **Last verified** on edits
- No secrets in repo

## Local Docker / compose

- After any Detour Docker or compose work (`docker-compose.db.yml`, `DETOUR_DB_E2E`, etc.): `docker compose … down`, then **quit Docker Desktop** on macOS. Do not leave the daemon running (Hamza standing rule, 2026-10-09)

## README sections

Root [`README.md`](../../README.md) is the **user guide**. Every new options tab or user-facing feature adds a collapsible `<details><summary>` block in the same PR, using this template:

- **What it does** (one sentence)
- **When to use it** (one concrete example)
- **How to** (numbered steps; quote UI labels exactly as in `extension/src`)
- **Tips / limits** (browser differences, permissions)

Nested `<details>` at most two levels. Planned-only features go under a single **Coming soon** block until they ship. Contributor/agent material stays in the collapsed **For contributors** section at the bottom (agents still use `AGENTS.md` → `AI/README.md`). API Tester / Databases plans must update their own README blocks when each slice lands.

## Naming

- Product: **Detour**
- Spec files: `kebab-case.md`
- Plans: `NNN-kebab-case.md`
- npm: `@detour/*` (unscoped `detour` taken); extension package is `@detour/extension`

## Cross-platform (extension + CLI Databases helper)

- **No OS-specific hardcoding** as the sole path: prefer `process.execPath`, `path.join`, and `platform()` switches that cover `win32` | `darwin` | `linux`
- OS packs are the default user path; `detour db install` remains for developers (embeds absolute Node path for GUI browsers)
- SEA self-install copies to a stable per-user dir; manifest `path` points at the binary (no Node)
- Launchers (dev only): darwin/linux → bash `detour-db-host`; Windows → `detour-db-host.cmd` + HKCU registry
- Windows paths use `%LOCALAPPDATA%` / `%APPDATA%`; Linux respects `XDG_CONFIG_HOME` / `XDG_DATA_HOME`
- Pack README templates live under `cli/pack/templates/` (single source with root README / in-pack guides)
- Native messaging from the extension: `connectNativePort` (`chrome.runtime.connectNative` first) — never assume WXT `browser.runtime.connectNative` exists on Chromium
- Brand host: `nativeHostName` in `brands/*/brand.ts` (default `com.detour.db`); build may use `DETOUR_BRAND_DIR` for an absolute out-of-tree brand directory (ADR-030)
- Contract tests against a foreign host binary: `DETOUR_DB_HOST_CMD=/path/to/binary`

## Code

- TypeScript strict + `noUncheckedIndexedAccess`; valibot at trust boundaries (import, storage load/save)
- One folder per spec module under `extension/src/` (`rule-model/`, `engine-core/`, `page-inject/`). api-mock shares `page-inject/` (one registration path). Entrypoints stay wiring-only
- Types come from schemas (`v.InferOutput`), not hand-written duplicates
- Browser APIs are injected as narrow interfaces (`DnrApi`, `StorageAreaLike`) so logic is testable without a browser; cast `browser.*` once at the entrypoint
- Fallible pure functions return `{ ok: true, value } | { ok: false, errors }`; user-facing errors carry a dot path (`data.groups.0.rules.2.match.pattern: …`)
- Refusals / import notices use a stable `reason`/`code` string plus a human message; never include rule bodies or file contents
- Extension tests colocated as `*.test.ts` (Vitest); fixtures in `__fixtures__/`; DNR fake in `src/test/fake-dnr.ts`; storage via `fakeBrowser` from `wxt/testing/fake-browser`
- CLI tests are `node:test` under `cli/src/*.test.ts`. The workspace lockfile is the root `pnpm-lock.yaml`
- Match WXT + Svelte 5 idioms; no drive-by refactors
- UI: dark default; light is an explicit `storage.local` `theme` value; accessibility for popup toggles (On/Off text, not color alone)

## Git

- Conventional, why-focused commit messages; each commit builds and passes tests
- Do not commit `node_modules/`, `.output/` (including store zips), `.wxt/`, or credentials
- CI is GitHub Actions on the free tier. Store API tokens stay in GitHub secrets later, never in the repo. There is no git remote until one is added; do not push from an agent session unless asked
