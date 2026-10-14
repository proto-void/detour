# Brand template

Copy this folder to `brands/<slug>/` for a white-label build.

Required files:

- `brand.ts` — export default `{ name, shortName, description, slug, defaultTheme }`
- `tokens.css` — CSS variables for light/dark (see `brands/detour/tokens.css`)
- `icon.svg` — toolbar / store icon source for `@wxt-dev/auto-icons`
- `logo.svg` — header wordmark (optional but recommended)
- `mark.svg` — compact mark tile (optional)

Optional:

- `partner-logo.svg` — co-brand lockup in options/popup header
- `fonts/` — licensed font files referenced from `tokens.css` (do not commit proprietary fonts to a public repo)

Build with:

```bash
DETOUR_BRAND=<slug> corepack pnpm --filter @detour/extension zip
```

Private partner brands (e.g. Rogers) should stay **gitignored** so the public MIT tree never ships their marks. Use display name **Detour**; partner identity lives in tokens, icons, and optional `partner-logo.svg` (lockup reads `Detour | [partner]`).
