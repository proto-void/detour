# Decisions (ADRs)

**Last verified:** 2026-10-06

## ADR-001 — Stack: WXT + TypeScript + Svelte 5 + CodeMirror 6 + valibot; Node CLI

**Status:** Accepted  
**Date:** 2026-10-06

### Context

Detour needs a cross-browser MV3 extension, a serious rule/editor UX, and a Local Bridge that serves files from disk. The project must stay free with **$0** recurring ops (no backend).

### Decision

- **Extension:** [WXT](https://wxt.dev/) + **TypeScript** + **Svelte 5**
- **Editors:** **CodeMirror 6** for rule bodies / file override editing
- **Validation:** **valibot** for rule schemas and import payloads
- **Local Bridge:** **Node.js CLI** (loopback HTTP/WebSocket) — optional companion, not required for Core DNR

### Consequences

- One TS monorepo-friendly toolchain; Svelte fits options/popup complexity
- valibot aligns with learnings from Web Defuser's schema approach
- CLI is opt-in; Core remains pure extension

---

## ADR-002 — Tiered engine architecture

**Status:** Accepted  
**Date:** 2026-10-06

### Context

MV3 removed blocking `webRequest` body mutation on Chromium. A single engine cannot cover redirects, injects, API mocks, and true body overrides on all browsers.

### Decision

Compile user **Rules** through a **RuleCompiler** into the least-privilege engine that can satisfy the action:

1. **Core DNR** — redirect / modifyHeaders / block  
2. **Inject scripting** — page JS/CSS  
3. **Mock fetch/XHR** — API mock in page world  
4. **Deep** — `chrome.debugger` on Chromium when body/CDP is required  
5. **Firefox body** — `filterResponseData` where available  
6. **Local Bridge CLI** — local folder / external editor workflows  

### Consequences

- Clear capability matrix per browser (see `intelligence/browser-matrix.md`)
- UX must surface when a rule needs Deep / Bridge (permissions, attach debugger)
- Prefer Core over Deep whenever possible

---

## ADR-003 — Product name: Detour

**Status:** Accepted (with naming caveats)  
**Date:** 2026-10-06

### Context

Need a memorable name for a free resource-override successor. Checked availability 2026-10-06.

### Name check

| Channel | Result |
|---------|--------|
| **npm** `detour` | **Taken** — legacy ISC/MIT router package `detour@1.3.4` (cainus, last publish ~2017). Unrelated to browser extensions. Prefer scoped packages e.g. `@detour/cli`, `@detour/extension` (`@detour/core` was 404). |
| **Chrome Web Store** | Search for “Detour” returns a results page; no clear established resource-override extension branded Detour from automated HTML scrape. Exact listing slug still needs manual confirm before submit. |
| **AMO** | **Partial conflict** — “Detour” (`detour-proxy`) is a Firefox **proxy switcher** (unrelated). Also “triglavis-detour”. Resource-override niche appears free; exact display name “Detour” may need disambiguation (e.g. “Detour — Resource Override”). |
| **Domains** | `detour.com`, `detour.dev`, `detour.app`, `getdetour.com` resolve (taken/parked). `usedetour.com` and `detou.dev` had no A records at check time (not a purchase confirmation). |

### Decision

Keep product name **Detour**. Use scoped npm names and a store subtitle that clarifies resource override. Domain TBD — do not block development.

### Consequences

- Document store subtitle early in `distribution` spec
- Re-check CWS/AMO at publish time

---

## ADR-004 — Extension tooling: pnpm, standalone package, MV3 everywhere

**Status:** Accepted  
**Date:** 2026-10-06

### Context

tech-baseline left "pnpm or npm" open. WXT 0.21 defaults Firefox to MV2. TypeScript 7 (native compiler) is now `latest`.

### Decision

- **pnpm** (pinned through `packageManager`, run via `corepack pnpm`), with `extension/` as a standalone package; add a root workspace when `cli/` lands
- Force `manifestVersion: 3` for every target (Firefox gets an MV3 event page)
- Pin TypeScript `~6.0`; revisit 7.x when Svelte/WXT tooling supports the native compiler

### Consequences

- No global installs needed beyond Node + corepack
- One manifest shape across browsers; Firefox MV3 still needs a gecko id before AMO submission

---

## ADR-005 — Core DNR apply model

**Status:** Accepted  
**Date:** 2026-10-06

### Context

engine-core must batch updates, keep group/rule order as priority, and never drop to zero rules at a quota (RO mv3 / PR #73).

### Decision

- Each refresh **replaces all** dynamic rules in one atomic `updateDynamicRules` call; DNR ids are positional (1..n) and recorded in `applyReport`
- Priority = `n − position` over enabled rules (unique, so tie-break order never matters)
- Quotas are enforced in priority order **before** the call; later rules are refused, earlier ones always apply
- On rejection: drop the rule named in `Rule with id N` and retry; otherwise fall back to per-rule adds
- Globs compile to `urlFilter` unless they need regex

### Consequences

- Positional ids carry no meaning across refreshes, so observability must map ids through `applyReport`
- A full replace costs one call even for a single edit; that's fine at Detour scale and keeps state simple
