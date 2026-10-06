# Product strategy (locked)

**Last verified:** 2026-10-06

## Product

**Detour** — free, MIT, open-source resource override for modern browsers. Help developers **point production at their local (or mock) code** without a proxy appliance or paid SaaS.

## Brand

- **Name:** Detour
- **Tagline:** “Point production at your code.”
- **License:** MIT
- **Business model:** Free forever for core; **$0** recurring ops (no Detour backend)

## Architecture (tiered engines)

```
Rules → RuleCompiler → Core DNR | Inject scripting | Mock fetch/XHR
                     | Deep chrome.debugger | FF filterResponseData | Local Bridge CLI
```

| Tier | Engine | Role |
|------|--------|------|
| Core | declarativeNetRequest (DNR) | Redirect, header modify, block — default path |
| Inject | `chrome.scripting` / content scripts | Page JS/CSS inject |
| Mock | fetch/XHR patch (page world) | API mock responses without full body rewrite |
| Deep | `chrome.debugger` (Chromium) | Body override / advanced cases Core can't do |
| Firefox body | `filterResponseData` (where available) | Response body transform on Firefox |
| Local Bridge | Node CLI | Serve local folder / editor workflow over loopback |

## UX principles

- **Popup-first** quick toggles; full workspace in options/side panel
- **Recipes** — shareable starter rule packs (Vite, SPA fallback, CORS headers, etc.)
- **Rule tester** — paste a URL; show which rule wins (RO todo.txt wish)
- **RO import** — import Resource Override export formats where feasible
- **Dark default** UI

## Stack (planned)

WXT + TypeScript + Svelte 5 + CodeMirror 6 + valibot; Node CLI for Local Bridge. See [DECISIONS.md](DECISIONS.md) ADR-001.

## Distribution

- Chrome Web Store / Edge / Firefox AMO / optional Safari later
- GitHub releases for unpacked / CLI
- No account required

## Hard nos

- No Detour-hosted backend or mandatory cloud sync
- No paid SaaS dependency for core features
- No shipping user rule bodies / file contents as telemetry
- Do not market around gambling, adult, crypto, or politics
- No `extension/` or `cli/` implementation until module specs are **Approved**

## V1 intent (high level)

See [specs/000-capability-map.md](specs/000-capability-map.md). Exact acceptance criteria live in Draft specs under `AI/specs/`.
