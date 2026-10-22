# Research — Upstream Resource Override

**Last verified:** 2026-10-06  
**Upstream:** [kylepaulsen/ResourceOverride](https://github.com/kylepaulsen/ResourceOverride) (MIT)  
**Branches:** `master` (MV2 legacy), `mv3` (unfinished), `firefox-alpha`

## Why Kyle stopped

- Chrome forced **MV2 → MV3**; blocking `webRequest` body/redirect patterns that RO relied on were gutted.
- Author states development **stopped indefinitely**; recommends Chrome DevTools **Local Overrides** for many workflows.
- Unfinished **`mv3` branch** is untested and unsupported.
- Motivation: dislike of MV3 constraints + belief many modern workflows don't need an extension like RO.

### MV3 unfinished approach (observed)

- File overrides redirect to **`data:` URLs** (base64) via `declarativeNetRequest` (`src/netRequestRules.js` on `mv3`).
- **CSP / CORS** break many `data:` and redirect cases (community: #4 CSP, #11 preflight, #32 data: + cors mode).
- Every match compiled to **`regexFilter`** → hits Chrome's **1000 dynamic regex** ceiling hard (PR #73 notes prefer `urlFilter`).

### Store status

- Issue **#72**: Chrome Web Store listing flagged / **delisted** (“not following best practices”); extension unavailable on CWS at report time.
- Firefox AMO listing historically existed (`resourceoverride`).

## End goal & unfinished wishes

| Wish | Source | Notes |
|------|--------|-------|
| Local folder → URL rules | #54 | Avoid paste-on-rebuild; Local Bridge target for Detour |
| External editor | #2 | In-extension editor painful; Bridge + editor |
| Breakpoints in replacement | #15 | Replacement not in DevTools Sources |
| Dynamic filenames | #43 | Hash-busted / changing script names |
| Rule tester | `todo.txt` | “request url tester that shows what rule it will hit” |

Other `todo.txt` items: autocomplete, collapse domain state, script inject timing, sync-close editors, drag tab groups, better `*` help.

## Issue themes

| Theme | Examples |
|-------|----------|
| MV3 / cross-browser | README stop notice; `mv3` branch; Firefox alpha |
| CSP / CORS / SRI | #4, #11, #32, #45 (SRI strip PR) |
| Local / Vite | #65 Vite; #54 local directory |
| Storage / sync | #22 rules don't sync; todo sync updates |
| Mock / custom responses | #12 custom response |
| Inject / workers | #57 SharedWorker; inject timing in todo |
| UI | Badge PR #28; SVG icons #40; editor UX #2 |
| Matching | Dynamic names #43; glob/`*` help |
| Migration | #69 migrate to Requestly |

## PR triage (takeaways for Detour)

| PR | Takeaway |
|----|----------|
| **#73** | Export shape `{ v: 2, data }`; **batch** `updateDynamicRules`; handle **1000 regex** ceiling with feedback; group/rule **priority**; prefer **`urlFilter`** later; E2E via CDP `Extensions.loadUnpacked` (Chrome 137 removed `--load-extension`) |
| **#28** | Optional **badge** count of matched rules per tab |
| **#10** | **404-only** fallback redirect (local → prod assets) |
| **#45** | **SRI** strip (mutation events + FF HTML rewrite) — fragile; need Detour strategy |
| **#55** | Upload file UX preference (local server / file pick) |
| **#40** | SVG icons over raster |

## Implications for Detour

- Do not ship `data:`-only file overrides as the primary strategy.
- Compiler must prefer `urlFilter`; reserve regex; surface ceiling errors.
- RO import compatibility is a product feature (`workspace-ui` / `rule-model`).
- Local Bridge + rule tester are first-class, not afterthoughts.
