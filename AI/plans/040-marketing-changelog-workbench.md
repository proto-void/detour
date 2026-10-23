# Plan 040 — Marketing: workbench + Changelog

**Status:** Done (2026-10-23)

## Goal

Update detour.protovoid.com and Protovoid’s products blurb so Detour markets API Tester + Databases as the local workbench, add a Changelog with 0.1.1 pending Chrome review and 0.1.2 coming soon, then redeploy both sites.

## Version framing (locked)

| Version | Public status | Changelog content |
|---------|---------------|-------------------|
| 0.1.0 | Live on CWS today | Baseline: redirects, headers, inject, mock, body replace, Local Bridge; early API Tester / Databases where accurate |
| 0.1.1 | Submitted, pending Chrome review | API Tester UX polish only (tabs, grow URL, Tools drawer, collections hierarchy, dense request bar, related editor polish). Do **not** list Databases workbench here |
| 0.1.2 | Coming soon | Databases workbench (explorer, multi query tabs, gutter Run, multi-result sets, collections tree, helper Start CTA, connection dialog polish, production rails) + small further API Tester polish |

## Checklist

- [x] Create this plan; index in `AI/plans/README.md`
- [x] detour-web home: widen hero lede; Workbench section; FAQ (helper + API Tester on-device; soft-update data-leaves-device); optional Changelog teaser
- [x] Changelog page `/changelog/` (newest-first 0.1.2 / 0.1.1 / 0.1.0); footer link between Features and Privacy
- [x] `site.config.ts` SEO title/description for API Tester + Databases; leave `chromeStoreUrl`
- [x] Privacy: detour-web + sync `docs/distribution/privacy.md`; API Tester + Databases local data; keychain via helper; bump Effective date
- [x] vs Resource Override: honest bullet for API Tester + Databases beyond classic RO
- [x] Follow-up (2026-10-23): vs RO page → side-by-side comparison table (redeployed); no extension bump
- [x] protovoid-web: Detour blurb (+ products meta if needed)
- [x] `docs/SEO.md` sanity list includes `/changelog/`
- [x] Deploy detour-web + protovoid-web; verify live URLs
- [x] PROGRESS: Done note; Next: bump extension to 0.1.2 before next CWS submit
- [x] Mark this plan Done

## Out of scope

- Extension version bump / CWS upload / new screenshots
- Edge / Firefox store work
- Fuzio redesign
- Overclaiming that CWS already has 0.1.1 or 0.1.2

## Verification

- Live: `https://detour.protovoid.com/`, `/changelog/`, `/privacy/`, `/vs-resource-override/`, footer Changelog
- Live: `https://protovoid.com/products/` Detour blurb mentions API Tester + Databases, local/MIT/no server
- Changelog statuses: 0.1.0 Current on CWS; 0.1.1 On the way / pending approval; 0.1.2 Coming soon
- Privacy Effective date bumped; Resource Override `privacy.md` synced
