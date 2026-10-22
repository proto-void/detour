# Research — Competitors

**Last verified:** 2026-10-06

## Requestly

- Full-featured HTTP intercept / redirect / modify / mock; cloud team features
- Common migration target from abandoned RO (#69)
- **Detour wedge:** free MIT, local-first, no account, Local Bridge for folders, RO import

## ModHeader

- Focused on request/response **headers**; simple UX
- Not a full resource/file override suite
- **Detour:** headers are Core DNR `modifyHeaders`; not the whole product

## Chrome DevTools Local Overrides

- Built-in; Kyle's recommended RO replacement for many cases
- Per-session / folder mapping; weak for always-on recipes, multi-project packs, Firefox parity, popup toggles
- **Detour:** persist rules, recipes, rule tester, cross-browser, badge, import/export

## Redirector

- Lightweight URL redirect extension (multi-browser)
- No rich file override / mock / inject / bridge story
- **Detour:** redirects are a subset of Core

## Proxyman / Charles

- Desktop proxy appliances — powerful body rewrite, HTTPS MITM
- Heavier install; cert trust; not “popup in the browser”
- **Detour:** stay in-browser + optional Local Bridge; no MITM CA required for Core

## Positioning table

| Need | Detour stance |
|------|----------------|
| Free / OSS / no backend | Primary |
| RO import + rule tester | Differentiator |
| Local folder / Vite | Local Bridge |
| Team cloud sync | Out of scope (export files OK) |
| Full MITM proxy | Out of scope |

## Also noted

- Community MV3 RO forks exist (varying quality) — study for pitfalls, don't assume maintenance.
- Web Defuser (Firefox) — see [web-defuser.md](web-defuser.md).
