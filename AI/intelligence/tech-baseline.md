# Tech baseline

**Last verified:** 2026-10-06

## Locked (ADR-001)

| Layer | Choice |
|-------|--------|
| Extension framework | WXT |
| Language | TypeScript |
| UI | Svelte 5 |
| Code editor | CodeMirror 6 |
| Validation | valibot |
| Local Bridge | Node.js CLI |
| License | MIT |

## Ops / cost

- **$0** recurring cloud: no Detour server, no mandatory BaaS
- Distribution: browser stores + GitHub Releases
- Optional analytics: only if privacy-safe and never includes rule bodies/file contents (default off)

## Tooling (planned when scaffolding)

- pnpm or npm workspaces TBD at scaffold time
- Vitest for unit tests; Playwright/web-ext for smoke when needed
- E2E on Chromium: prefer CDP `Extensions.loadUnpacked` (see gotchas)

## Free-for-life constraint

Any new dependency must not introduce a paid API key requirement for Core features.
