# Chrome Web Store assets checklist

Manual upload only. Build the zip first (`cd extension && corepack pnpm zip`), then gather listing media.

## Required / strongly recommended

| Asset | Spec | Source / notes |
|-------|------|----------------|
| **Store icon** | 128×128 PNG | From zip / build: `extension/.output/detour/.../icons/128.png` (auto-icons from `brands/detour/icon.svg`) |
| **Small promo tile** | Exactly **440×280**, JPEG or **24-bit PNG (no alpha)** | Optional; `promo-small-440x280.png` in this folder (skip for first CWS submit). Dark Protovoid `#07060d` / `#0f0c1b` + Detour wordmark |
| **Marquee promo tile** | Exactly **1400×560**, JPEG or **24-bit PNG (no alpha)** | Optional; `promo-marquee-1400x560.png` in this folder (skip for first CWS submit) |
| **Screenshots** | Exactly **1280×800** or **640×400**, JPEG or **24-bit PNG (no alpha)** | Max 5; at least 1 required. Capture from a real build — see below |

CWS rejects wrong pixel dimensions and PNGs with an alpha channel. Do **not** upload “≥1280×800” sources — resize/export to one of the two exact sizes first.

## Files in this folder

| File | Role |
|------|------|
| `popup.png`, `redirect.png`, `mock.png`, `log.png`, `headers.png`, `inject.png`, `body.png` | CWS-ready **1280×800** RGB 24-bit PNG (no alpha) |
| `*-source-2560x1800.png` | High-res backups before the CWS resize |
| `popup-portrait-800x1280.png` | Original portrait popup capture (reference; not for CWS upload) |
| `promo-small-440x280.png`, `promo-marquee-1400x560.png` | Optional promo tiles — skip for first CWS submit |

Paste-ready dashboard packet: [CWS-SUBMIT.md](../CWS-SUBMIT.md).

## Screenshot capture notes

Regen dark-theme product shots (demo rules on `example.com` / `localhost` only):

```bash
cd extension
CHROME=$(node scripts/install-chrome.mjs) node scripts/capture-web-screenshots.mjs
```

That writes WebP+PNG to `Project/detour-web/public/screenshots/` and copies PNGs here.

CWS upload order (highest intent first; max 5):

1. `popup.png` — Applied strip (portrait padded onto 1280×800 dark canvas)
2. `redirect.png` — Rules + redirect drawer
3. `mock.png` — Mock fetch / XHR
4. `log.png` — On-device match log
5. Optional fifth: `headers.png`, `inject.png`, or `body.png`

Tips:

- Export exactly **1280×800** (preferred) or **640×400** as **24-bit PNG with no alpha** (flatten on `#07060d` if needed). Wrong size → “The image size is incorrect.”
- Use Protovoid dark UI (default theme); avoid light theme for primary shots.
- Crop chrome browser UI if the store prefers the extension surface only.
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
