# Architecture

**Last verified:** 2026-10-06

## Pipeline

```
Rules → RuleCompiler → Core DNR
                     → Inject scripting
                     → Mock fetch/XHR
                     → Deep chrome.debugger
                     → FF filterResponseData
                     → Local Bridge CLI
```

## Modules (spec map)

| Module | Responsibility |
|--------|----------------|
| `rule-model` | Schema, groups, priority, import/export |
| `engine-core` | DNR compile/apply; urlFilter preference |
| `page-inject` | JS/CSS inject via scripting |
| `api-mock` | fetch/XHR mocks in page world |
| `engine-deep` | Chromium debugger body path |
| `local-bridge` | Node CLI loopback file server |
| `workspace-ui` | Popup, options, recipes, tester, RO import |
| `observability` | Badge, match log, errors (no rule-body telemetry) |
| `distribution` | Stores, CI artifacts, permissions narrative |

## Principles

- Least engine that works; escalate to Deep/Bridge only when needed
- RuleCompiler is the single place that maps actions → engines
- No Detour backend; storage is extension local (+ optional sync storage later, not cloud account)

## Planned packages (future)

- `extension/` — WXT app (not created until Approved)
- `cli/` — Local Bridge (not created until Approved)
