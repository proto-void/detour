# Browser matrix

**Last verified:** 2026-10-06

## Supported targets (product intent)

| Browser | Minimum | Engines expected |
|---------|---------|------------------|
| Chrome | **120+** | Core DNR, Inject, Mock, Deep (debugger), Bridge |
| Edge | **120+** | Same as Chrome |
| Brave | **120+** | Same as Chrome (verify debugger policies) |
| Firefox | **128 ESR+** | Core DNR (as available), Inject, Mock, FF body (`filterResponseData`), Bridge |
| Safari | **17+** | Core subset TBD; Deep likely unavailable; track separately |

## Notes

- MV3 everywhere for Chromium; Firefox WebExtensions APIs differ for body rewrite
- Safari often lags DNR/scripting parity — ship after Chromium+Firefox Core
- Store review policies differ; `distribution` spec owns permission copy

## Verification policy

- CI smoke: Chromium + Firefox latest stable when implementation exists
- Manual: one ESR Firefox check before major release
