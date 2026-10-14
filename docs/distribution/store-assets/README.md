# Chrome Web Store assets checklist

Manual upload only. Build the zip first (`cd extension && corepack pnpm zip`), then gather listing media.

## Required / strongly recommended

| Asset | Spec | Source / notes |
|-------|------|----------------|
| **Store icon** | 128×128 PNG | From zip / build: `extension/.output/detour/.../icons/128.png` (auto-icons from `brands/detour/icon.svg`) |
| **Small promo tile** | 440×280 | Optional; `promo-small-440x280.png` in this folder (skip for first CWS submit). Dark Protovoid `#07060d` / `#0f0c1b` + Detour wordmark |
| **Marquee promo tile** | 1400×560 | Optional; `promo-marquee-1400x560.png` in this folder (skip for first CWS submit) |
| **Screenshots** | ≥1280×800 (or store’s current min) | Capture from a real build — see below |

## Files in this folder

| File | Role |
|------|------|
| `popup.png`, `redirect.png`, `mock.png`, `log.png`, `headers.png`, `inject.png`, `body.png` | Product screenshots for CWS (and site) |
| `promo-small-440x280.png`, `promo-marquee-1400x560.png` | Optional promo tiles — skip for first CWS submit |

Paste-ready dashboard packet: [CWS-SUBMIT.md](../CWS-SUBMIT.md).

## Screenshot capture notes

Regen dark-theme product shots (demo rules on `example.com` / `localhost` only):

```bash
cd extension
CHROME=$(node scripts/install-chrome.mjs) node scripts/capture-web-screenshots.mjs
```

That writes WebP+PNG to `Project/detour-web/public/screenshots/` and copies PNGs here.

CWS upload order (highest intent first):

1. `popup.png` — Applied strip (portrait; if dashboard rejects, use a padded ≥1280×800 crop or `popup-portrait-800x1280.png` as reference)
2. `redirect.png` — Rules + redirect drawer
3. `mock.png` or `inject.png` — stub / inject surface
4. `body.png` — replace body
5. `log.png` — on-device match log

Tips:

- Use Protovoid dark UI (default theme); avoid light theme for primary shots.
- Crop chrome browser UI if the store prefers the extension surface only; keep window large enough for store min size.
- Do not include partner/Rogers branding, internal hostnames, or customer data in screenshots.
- Prefer `localhost` / `example.com` URLs in any visible rules.
- File names and CWS captions should describe the UI (“Redirect rules”, “Mock fetch”), not generic “screenshot1”.

## Listing copy pointers

- Title / description: [store-listing.md](../store-listing.md)
- Permission justifications: [permissions.md](../permissions.md)
- Privacy URL: **https://detour.protovoid.com/privacy/**
- Homepage: **https://detour.protovoid.com**
- Source: **https://github.com/proto-void/detour**

## Out of scope here

Automating CWS upload APIs. Attach promo PNGs to this folder locally if useful; they need not be committed.
