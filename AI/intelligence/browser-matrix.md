# Browser matrix

**Last verified:** 2026-10-06 (DNR quotas, domain conditions, page engines on Chrome 154; Firefox 157 importer, editor, inject, mock, tester). Slice 4 UI (theme, popup group toggle, localhost recipe, devtools page) verified on Chrome 154 e2e 52/52. Firefox 157 build includes `devtools_page`; BiDi could not open `moz-extension://` pages, so that UI was not re-driven in Firefox.

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

## DNR domain conditions (page scoping)

| Condition | Chrome | Firefox | Detour use |
|-----------|--------|---------|------------|
| `requestDomains` | 101+ | 128+ | `main_frame` half of a page-scoped rule |
| `initiatorDomains` | 101+ | 128+ | subresource half when `topDomains` is missing |
| `topDomains` | **145+** | **not on MDN** | subresource half when `RuleConditionKeys` lists it |

All three match subdomains too. Chrome for Testing 154 verified end to end (`pnpm e2e:chrome`, 2026-10-06, 41/41).

## Page engines (inject + mock)

| Capability | Chrome / Edge / Brave 120+ | Firefox 128+ | Safari 17+ |
|------------|----------------------------|--------------|------------|
| Inline JS | `userScripts` + user toggle (Chrome 138+ “Allow User Scripts”; earlier, Developer mode) | 136+ optional `userScripts` permission; 128–135 refused with a reason | Not available; refuse |
| JS from a URL | Bridge inserts `<script src>`; page CSP applies | Same (MAIN world 128+) | Verify |
| CSS inline / URL | `scripting.insertCSS` from the background | Same | Verify |
| fetch / XHR mock | Packaged MAIN script, `document_start`; no user-scripts toggle | Same | Verify |

Mocks and URL/CSS injection do not need the user-scripts toggle. Inline JS rules are refused (`user-scripts-unavailable`) until it is on.

## Notes

- MV3 everywhere (Firefox too, forced in `wxt.config.ts`); Firefox WebExtensions APIs differ for body rewrite
- Manifest minimums: `minimum_chrome_version: "120"`, `gecko.strict_min_version: "128.0"`
- Safari often lags DNR/scripting parity — ship after Chromium+Firefox Core
- Store review policies differ; `distribution` spec owns permission copy

## Verification policy

- CI smoke: Chromium + Firefox latest stable when implementation exists
- Manual: one ESR Firefox check before major release
