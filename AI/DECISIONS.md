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

## ADR-006 — Page scoping and the global switch

**Status:** Accepted  
**Date:** 2026-10-06 (Hamza's answers to plan 002 questions + workspace-ui slice 1)

### Context

Resource Override gates groups by tab URL; DNR has no tab condition. The popup needs an on/off switch that doesn't lose rules.

### Decision

- Groups carry optional `pageDomains`. A scoped rule compiles to a `main_frame` rule with `requestDomains`, plus a subresource rule with `topDomains` (feature-detected via `RuleConditionKeys`), falling back to `initiatorDomains`
- RO tab patterns map to hosts. Port/path parts produce a warning. A pattern that can't be expressed imports the group disabled with a reason
- Imported RO rules list all resource types, including `main_frame`
- Global off = `storage.local.enabled === false` → apply an empty rule set; the workspace is untouched
- Keep the single-rule fallback on unexplained rejections

### Consequences

- Firefox / Chrome < 145 scope subresources by initiator, so a cross-site iframe on a scoped page isn't covered. Accepted by Hamza (2026-10-06); warned about in the editor on those browsers only
- One Detour rule can cost two DNR rules toward quotas

## ADR-007 — Import provenance and the editor save model

**Status:** Accepted  
**Date:** 2026-10-06 (Hamza's answers to plan 003 questions + workspace-ui slice 2)

### Decision

- Imported groups carry `importedFrom { file, sha256 }`. A new import replaces every group whose file name **or** content hash matches, at the first such group's position. Otherwise it appends. Groups the user created never carry `importedFrom`, so imports never touch them
- Editing a group by hand doesn't clear `importedFrom`: re-importing the file deliberately overwrites it, and the import summary says how many groups were replaced
- The editor works on a draft and writes only on an explicit **Save** (validated with the same schemas as storage). Group and rule switches are part of the draft
- CI will run `pnpm e2e:chrome` once the `distribution` spec is Approved

### Consequences

- Two unrelated exports that share a file name (e.g. both `export.json`) replace each other. The summary makes this visible; matching by name is what makes "re-export after editing in RO" work
- Switch flips in the editor need a Save; the editor makes unsaved state obvious
- Amended 2026-10-06 (workspace-ui slice 4): popup group switches are the exception. They write that group's `enabled` flag immediately, the same way the global switch writes `enabled`. The editor treats the write as an external change
- Amended 2026-10-06 (Hamza): re-import keeps each group's/rule's on/off state via `importKey`. A name-only match asks (Replace / Import as new / Cancel); identical content replaces silently

## ADR-008 — Page-world engines: userScripts for user code, packaged runtimes for the rest

**Status:** Accepted  
**Date:** 2026-10-06 (page-inject + api-mock approved)

### Context

`scripting.registerContentScripts` takes only packaged file paths, and main-world content scripts are subject to the page's CSP (Chrome content-scripts doc). Chrome says `userScripts` "is required for extensions that run scripts provided by the user that cannot be shipped as part of your extension package". It needs a user toggle (Chrome) or an optional permission (Firefox 136+).

### Decision

- **Inline JS** → `userScripts.register`. If it's unavailable, refuse the rule with an actionable reason. Never `eval`, `new Function` or inline `<script>` text as a fallback (store-policy risk, and CSP-blocked anyway)
- **JS URL** → a packaged bridge inserts `<script src>`. The page loads it, page CSP applies, and failures are reported
- **CSS** → `scripting.insertCSS` from the background on the bridge's request (not subject to page CSP); URL CSS is fetched by the background
- **Mocks** → a packaged MAIN-world runtime (`registerContentScripts`, `document_start`, `allFrames`) patches fetch/XHR synchronously and gets its config from the bridge, holding early requests until the config arrives. No toggle needed
- Registrations exist only while matching enabled rules exist; nothing is registered when Detour is off
- Permissions: `scripting` + `userScripts` (Chrome `permissions`; Firefox `optional_permissions`)

### Consequences

- Inline JS needs one-time user action (toggle or permission). The editor explains it, and the rules are refused (not silently dropped) until then
- A mock wins over DNR for the same URL, because the request never leaves the page
- The page can observe the patched fetch and the mock config
