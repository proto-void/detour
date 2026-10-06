# Gotchas

**Last verified:** 2026-10-06

## DNR limits

- Chrome allows many dynamic rules but only **~1000 dynamic `regexFilter` rules**
- Compiling every glob to regex (RO mv3) silently fails or truncates when over ceiling — **prefer `urlFilter`**
- Batch `updateDynamicRules`; one-call-per-group is slow (RO PR #73)

## `data:` redirects

- RO mv3 file overrides use `data:` URLs — hit **CSP**, opaque responses, and CORS mode limits (`no-cors` quirks; see RO #32)
- Prefer Local Bridge `http://127.0.0.1` or extension-page / redirect-to-extension strategies over giant `data:` bodies

## CORS / preflight

- Redirecting XHR/fetch can invalidate preflight (#11) — document and test header rules carefully
- 404-fallback to prod (#10) often needs CORS header strategy

## SRI

- Subresource Integrity blocks replaced scripts/styles (#45) — may need integrity attribute stripping with clear user consent / warning

## Chrome 137+ extension loading

- `--load-extension` removed from Chrome-branded builds (Chrome 137+)
- Use CDP **`Extensions.loadUnpacked`** with `--enable-unsafe-extension-debugging` for automation (RO PR #73)
- Feature-flag workarounds may stop working on newer Chrome

## Permissions UX

- Deep engine requires debugger attach — scary prompt; never enable silently
- Optional host permissions should be progressive where store policies allow

## Firefox vs Chromium

- Body rewrite APIs differ (`filterResponseData` vs debugger) — one RuleCompiler, multiple backends
