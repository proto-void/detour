# Browser matrix

**Last verified:** 2026-10-06 (DNR quotas added)

## Supported targets (product intent)

| Browser | Minimum | Engines expected |
|---------|---------|------------------|
| Chrome | **120+** | Core DNR, Inject, Mock, Deep (debugger), Bridge |
| Edge | **120+** | Same as Chrome |
| Brave | **120+** | Same as Chrome (verify debugger policies) |
| Firefox | **128 ESR+** | Core DNR (as available), Inject, Mock, FF body (`filterResponseData`), Bridge |
| Safari | **17+** | Core subset TBD; Deep likely unavailable; track separately |

## Core DNR quotas

| Browser | Dynamic rules | Unsafe (redirect/headers) | Regex |
|---------|---------------|---------------------------|-------|
| Chrome / Edge 121+ | 30000 | 5000 | 1000 (dynamic + session) |
| Firefox 128+ | 5000 | (no separate cap) | 1000 per ruleset |
| Safari | `MAX_NUMBER_OF_DYNAMIC_AND_SESSION_RULES` | — | no separate cap |

Source: Chrome DNR reference + MDN (2026-10-06). Detour reads the constants at runtime.

## Notes

- MV3 everywhere (Firefox too, forced in `wxt.config.ts`); Firefox WebExtensions APIs differ for body rewrite
- Manifest minimums: `minimum_chrome_version: "120"`, `gecko.strict_min_version: "128.0"`
- Safari often lags DNR/scripting parity — ship after Chromium+Firefox Core
- Store review policies differ; `distribution` spec owns permission copy

## Verification policy

- CI smoke: Chromium + Firefox latest stable when implementation exists
- Manual: one ESR Firefox check before major release
