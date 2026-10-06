# Progress

**Last verified:** 2026-10-07

## Done

- [x] Workspace git init + root agent entrypoints (`AGENTS.md`, `README.md`, ignores)
- [x] Cursor thin rules + `.cursor/skills` → vendor skills
- [x] addyosmani agent-skills pack installed (Flutter/Dart pruned)
- [x] Project skills: `start-session`, `write-back-kb`, `plan-workflow`, `spec-workflow`
- [x] KB core: `PRODUCT`, `DECISIONS`, `intelligence/*`, `research/*`
- [x] Spec-driven Phase 0 + Specify: capability map + Draft module specs
- [x] Plans `000-workspace-setup`, `001-research-and-specs`
- [x] **rule-model** + **engine-core** specs Approved (Hamza, 2026-10-06)
- [x] Plan `002-rule-model-engine-core`: `extension/` scaffold (WXT 0.21, TS 6, Svelte 5 module, valibot, Vitest 5, pnpm), rule schema, matcher, storage, Detour export/import, RO v1/v2 import, DNR compiler, limits, atomic apply, coalescer, background wiring. 87 unit tests; Chrome + Firefox MV3 builds green

- [x] Hamza's plan-002 answers applied: gecko id `detour@protovoid.com`; RO page scoping preserved via `pageDomains` (ADR-006); imported RO rules include `main_frame`; single-rule fallback kept
- [x] **workspace-ui slice 1** Approved (Hamza, 2026-10-06) and built (plan 003): Svelte 5 popup with a global switch, RO/Detour import, and an applied/refused report. 130 unit tests; Chrome + Firefox builds warning-free; real Chrome 154 smoke `pnpm e2e:chrome` 14/14

- [x] Hamza's plan-003 answers: re-import replaces same-file groups (`importedFrom`, ADR-007); iframe gap accepted and warned about in the editor; CI e2e recorded in the `distribution` spec (not built)
- [x] **workspace-ui slice 2** Approved (Hamza, 2026-10-06) and built (plan 004): options-page rule editor (CRUD, reorder, group/rule switches, site scoping, live validation, preview, Save, inline status, Export). 164 unit tests; Chrome + Firefox builds clean; `pnpm e2e:chrome` 23/23
- [x] Hamza's plan-004 answers: re-import keeps on/off via `importKey`; name-only match asks (content-hash match replaces silently); request types live in a collapsed Advanced section
- [x] **page-inject** + **api-mock** Approved (Hamza, 2026-10-06) and built (plan 005, ADR-008): inline and URL JS/CSS, MAIN-world fetch/XHR mocks, CodeMirror 6 on the options page, apply-report refusals and session page failures. 239 unit tests; Chrome + Firefox builds clean; `pnpm e2e:chrome` 41/41 on Chrome for Testing 154
- [x] **workspace-ui slice 3 (rule tester)** Approved (Hamza, 2026-10-06) and built (plan 006): paste a URL on the rules page (popup opens it) and see which rule wins, using engine precedence across redirect, block, headers, inject, and mock. 263 unit tests; Chrome + Firefox builds clean; `pnpm e2e:chrome` 45/45
- [x] **Firefox check** (plans 003–006) on Firefox 157.0.1: headless temporary add-on, 43/43. Tab importer (RO export, file override skipped, port warning), editor create/save for redirect, block, headers, inject, and mock, Detour on/off, iframe warning (`RuleConditionKeys` null), CSS inject, fetch/XHR mock, inline JS after Allow user scripts, rule tester (win / no match / loop)
- [x] **workspace-ui slice 4** Approved (Hamza, 2026-10-06) and built (plan 007): light theme (persisted, dark default), popup group switches (first 8, immediate save), three starter recipes (localhost/Vite, CORS headers, SPA fallback), DevTools panel that reuses the rule tester for a page load. 281 unit tests; Chrome + Firefox builds clean; `pnpm e2e:chrome` 52/52. Firefox 157 installed the add-on headlessly; BiDi could not open extension pages
- [x] **engine-deep body override** Approved (Hamza, 2026-10-06) and built (plan 008, ADR-009): `overrideBody` via CDP Fetch on Chrome and `filterResponseData` on Firefox. RO `fileOverride` imports as that action. Allow debugger gates attach (`bodyEngineConsent`); Chrome `debugger` is install-time. 304 unit tests; Chrome + Firefox builds clean; `pnpm e2e:chrome` 57/57 (replaced script `LOCAL`, sibling `PROD`). Firefox 157 BiDi still cannot open extension pages, so the live filter path was not driven. Local Bridge stays Draft
- [x] **observability** Approved for badge + match log (Hamza, 2026-10-06) and built (plan 009, ADR-010): per-tab toolbar count, session match log (newest 50, label + URL, no action bodies). Chromium `declarativeNetRequestFeedback`. Popup badge switch and options `#log`. 327 unit tests; Chrome + Firefox builds clean; `pnpm e2e:chrome` 62/62. Firefox UI e2e not driven (BiDi). Chrome `debugger` unchanged. Local Bridge stays Draft
- [x] **distribution** Approved for CI + packaging (Hamza, 2026-10-07) and built (plan 010, ADR-011): GitHub Actions on pull requests and `main` (unit tests, typecheck, Chrome + Firefox builds, `e2e:chrome` on Chrome for Testing stable, store zips). `v*` tags attach the zips to a GitHub Release with `GITHUB_TOKEN` only. Reviewer docs in `docs/distribution/`. Local check: 327 tests, typecheck clean, both builds, `CI=1` e2e 62/62 on Chrome 155, three zips. No store secrets. Not pushed (no remote). Local Bridge stays Draft
- [x] **local-bridge** Approved (Hamza, 2026-10-07) and built (plan 011, ADR-012): `@detour/cli` serves a folder on `127.0.0.1` only. `serveLocal` redirects after the user connects and `/health` succeeds; otherwise the rule is refused and the production URL stays. RO `fileOverride` stays inline `overrideBody`. 18 CLI tests, 342 extension tests, typecheck clean, Chrome + Firefox builds clean, `pnpm e2e:chrome` 65/65 (script from disk is `DISK`). Firefox UI still not driven (BiDi). Not pushed
- [x] **local-bridge in-place** Approved (Hamza, 2026-10-07) and built (plan 012, ADR-013): when Allow debugger / Allow response rewriting is on, `serveLocal` keeps the original URL and the extension reads the file from the bridge. Otherwise it still redirects. 18 CLI tests, 351 extension tests, typecheck clean, Chrome + Firefox builds clean, `pnpm e2e:chrome` 68/68 (disk script on a `script-src 'self'` page). Firefox live filter still not driven (BiDi). Not pushed
- [x] **SRI hashes** Approved (Hamza, 2026-10-07) and built (plan 013, ADR-014): while a body rule is armed, UTF-8 HTML gets a SHA-384 `integrity` of the override on matching script and stylesheet tags. Other tags keep the page's hashes. Redirect mode does not rewrite the document. 363 extension tests, typecheck clean, Chrome + Firefox builds clean, `pnpm e2e:chrome` 72/72 on Chrome for Testing 155 (override runs, valid sibling runs, bad sibling stays blocked, in-place disk file runs). Firefox document path is unit-tested. Not pushed

## Next

1. CI will not run until a git remote exists and `main` is pushed. Store upload stays manual until publisher secrets are added on purpose
2. npm publish of `@detour/cli` is still out of scope. JavaScript that sets `integrity` after the document is parsed is still out of scope

## Open questions (not blocking)

- Should recipes grow a shareable file format, or is "built-in packs that become normal groups" enough?
- Should Allow CORS also answer the OPTIONS preflight, or only add headers to responses the server sends?
- SPA fallback always targets `/index.html` and skips paths that contain a dot. Is that the fallback you want?
- The match log is a session list, not a DevTools network panel. Do you want a per-request list later?
- Packed Chromium rows store the tab URL, not the subresource. Is that enough, or should packed builds stay limited to unpacked-style request URLs some other way?
- Firefox does not record DNR matches (no feedback API; `webRequest` was not added). Is that gap acceptable?
- Inline JS injections are not log rows. Worth a later note, or leave them to the apply report?
- A bundler that sets `script.integrity` from JavaScript, after the HTML is parsed, still gets the page's hash. Worth a later MAIN-world patch?

## Blocked

- Nothing for code. Further modules wait for their specs to be Approved
