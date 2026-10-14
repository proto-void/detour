# Chrome Web Store assets checklist

Manual upload only. Build the zip first (`cd extension && corepack pnpm zip`), then gather listing media.

## Required / strongly recommended

| Asset | Spec | Source / notes |
|-------|------|----------------|
| **Store icon** | 128×128 PNG | From zip / build: `extension/.output/detour/.../icons/128.png` (auto-icons from `brands/detour/icon.svg`) |
| **Small promo tile** | 440×280 | Optional but recommended; dark Protovoid canvas `#07060d` / `#0f0c1b`, Detour mark + wordmark, tagline “Point production at your code.” |
| **Marquee promo tile** | 1400×560 | Optional; same brand system; keep text large and sparse |
| **Screenshots** | ≥1280×800 (or store’s current min) | Capture from a real build — see below |

## Screenshot capture notes

Load the unpacked Detour build (or release zip), then capture:

1. **Popup** — toolbar popup with Detour enabled, Applied/Refused strip visible, dark theme.
2. **Rules** — options Rules tab with at least one group and one redirect rule open or listed.
3. **Recipes** (optional) — one recipe tile visible to show guided setup.
4. **API Tester** or **Log** (optional) — second “power” surface for reviewers.

Tips:

- Use Protovoid dark UI (default theme); avoid light theme for primary shots.
- Crop chrome browser UI if the store prefers the extension surface only; keep window large enough for store min size.
- Do not include partner/Rogers branding, internal hostnames, or customer data in screenshots.
- Prefer `localhost` / `example.com` URLs in any visible rules.

## Listing copy pointers

- Title / description: [store-listing.md](../store-listing.md)
- Permission justifications: [permissions.md](../permissions.md)
- Privacy URL: **https://detour.protovoid.com/privacy/**
- Homepage: **https://detour.protovoid.com**
- Source: **https://github.com/proto-void/detour**

## Out of scope here

Automating CWS upload APIs. Attach promo PNGs to this folder locally if useful; they need not be committed.
