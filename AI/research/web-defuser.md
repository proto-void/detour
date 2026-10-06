# Research — Web Defuser

**Last verified:** 2026-10-06  
**Upstream:** [gitlab.com/gear54/web-defuser](https://gitlab.com/gear54/web-defuser) (MIT)  
**AMO:** [Web Defuser](https://addons.mozilla.org/en-US/firefox/addon/web-defuser/) (`web-defuser`)

## Summary

Firefox-first “userscripts/styles on steroids”: rules process HTTP requests (headers, body, etc.) **before** the rendering engine — positioned below Tampermonkey-style post-DOM scripts and more granular than typical ad blockers.

## Platform

- **Firefox MV2** (and Android) — uses `webRequest` + `webRequestBlocking` + `<all_urls>`
- Author explicitly rejects Chrome MV3 for full power; may someday ship a “crippled” Chromium build
- **Not** a drop-in Detour engine for Chrome Core DNR

## Stack (from `package.json` v1.1.0)

| Piece | Choice |
|-------|--------|
| Language | TypeScript |
| UI | Vue 3 |
| Build | Vite 6 + web-ext |
| Schema | **valibot** |
| Matcher DSL | **Peggy** grammar → parser |
| Tests | Vitest |
| Package manager | pnpm |

## Model

- **Code-as-rules** — rules authored as structured/code-like definitions (interactive sandbox + snippets)
- Acts earlier in the pipeline than userscripts; can defeat CSP pain that blocks late injects
- Inspired by Resource Override; aimed at **day-to-day browsing** control, not only local-dev overrides

## What Detour should borrow

- **Action set** ideas: header/body transform vocabulary, matcher expressiveness
- **valibot** for rule validation (aligns with ADR-001)
- Peggy-style matcher grammar as optional future (not required for V1 Core)
- Snippets / recipes culture (public examples)

## What Detour should not copy blindly

- Firefox-MV2-only architecture
- Vue UI stack (Detour chose Svelte 5)
- Primary positioning as general browsing “defuser” vs developer **point production at your code**

## License

MIT — fine to learn from; do not vendor large copyrighted chunks without attribution/review.
