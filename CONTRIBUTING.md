# Contributing to Detour

Thanks for helping. Detour is MIT-licensed; the public product is the Detour brand only.

## Setup

From the repo root (Node per `/.node-version`, pnpm via Corepack):

```sh
corepack pnpm install
corepack pnpm --filter @detour/extension dev
```

Run the same checks as CI when you can: see [docs/distribution/README.md](docs/distribution/README.md).

## Scope

- Prefer small, focused PRs against `main`.
- Do not commit secrets (`.env`, `*.pem`, credentials) or private partner brand trees (`extension/brands/rogers/` is gitignored).
- Legacy **Resource Override** naming stays only where import compatibility requires it.

## Questions

Product site: [https://detour.protovoid.com](https://detour.protovoid.com)  
Source: [https://github.com/proto-void/detour](https://github.com/proto-void/detour)
