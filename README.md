# Detour

**Point production at your code.**

Free, MIT, open-source browser extension (+ optional local bridge CLI) for redirecting, mocking, injecting, and overriding web resources — no backend, **$0** recurring ops.

## Start here (agents & humans)

Read **[AI/README.md](AI/README.md)** — master router for product strategy, progress, decisions, intelligence, research, specs, plans, and skills.

| Path | Purpose |
|------|---------|
| [AI/PRODUCT.md](AI/PRODUCT.md) | Locked product strategy |
| [AI/PROGRESS.md](AI/PROGRESS.md) | What's done / next |
| [AI/specs/](AI/specs/) | Spec-driven modules (Draft → Approved) |
| [AI/intelligence/](AI/intelligence/) | Living knowledge base |
| [AI/plans/](AI/plans/) | Implementation plans |
| [.cursor/rules/](.cursor/rules/) | Thin Cursor adapters |

## Stack (planned)

WXT + TypeScript + Svelte 5 + CodeMirror 6 + valibot; Node CLI for Local Bridge. See [AI/DECISIONS.md](AI/DECISIONS.md) and [AI/intelligence/tech-baseline.md](AI/intelligence/tech-baseline.md).

## Workspace status

`rule-model`, `engine-core`, and `workspace-ui` slices 1–2 are **Approved** and built in [`extension/`](extension/): a popup (on/off switch, RO import, applied/refused report) and a rule editor page (groups, rules, switches, site scoping, live validation, Export). Other specs are Draft. No `cli/` yet.

```sh
cd extension
corepack pnpm install
corepack pnpm test          # Vitest
corepack pnpm typecheck     # tsc + svelte-check
corepack pnpm build         # .output/chrome-mv3
corepack pnpm build:firefox # .output/firefox-mv3
CHROME=<Chrome for Testing binary> corepack pnpm e2e:chrome  # real-browser smoke (after build)
```
