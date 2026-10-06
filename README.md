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

## Stack

WXT + TypeScript + Svelte 5 + CodeMirror 6 + valibot. Local Bridge is an optional Node CLI on `127.0.0.1` (`cli/`). See [AI/DECISIONS.md](AI/DECISIONS.md) and [cli/README.md](cli/README.md).

## Workspace status

What's built is tracked in [AI/PROGRESS.md](AI/PROGRESS.md). Extension code is in [`extension/`](extension/). The bridge is in [`cli/`](cli/).

```sh
corepack pnpm install
corepack pnpm --filter @detour/cli test
corepack pnpm --filter @detour/extension test
corepack pnpm --filter @detour/extension typecheck
corepack pnpm --filter @detour/extension build
corepack pnpm --filter @detour/extension build:firefox
cd extension && CHROME=$(node scripts/install-chrome.mjs) corepack pnpm e2e:chrome
```

Serve a folder for **Serve local file** rules (token changes every start; listens on `127.0.0.1` only):

```sh
corepack pnpm --filter @detour/cli exec detour bridge ./dist
```

CI runs those checks on pull requests and `main`. Packaging, store-listing copy, and how to push are in [docs/distribution/README.md](docs/distribution/README.md).
