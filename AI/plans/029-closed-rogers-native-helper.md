# Plan 029 — Closed Rogers native helper (public hooks + private path)

**Status:** Public hooks Done; private go-spike + ext-build + pack:all/verify Done; **engine parity + connection options in private helper-go Done** (2026-10-09); **Defender-safe source packs** (no shipped helper binary; `detour-*` zips; minify-only) Done; real-machine smoke + Edge/Firefox pending  
**Spec:** [db-client](../specs/db-client.md) partner-helper amendment + [distribution](../specs/distribution.md) + [ADR-030](../DECISIONS.md)  
**Source:** Cursor plan `closed_rogers_native_helper_64704dd3.plan.md` (Hamza “Go and approved”); Defender follow-up `defender_zip_options_bfa281e3.plan.md`

## Goal

Public MIT repo gains small generic hooks so a **private** partner repo can ship a closed helper + sideload extension. Private packs now ship **Go source + install scripts** (build on the user’s machine; no prebuilt `.exe`/Mach-O/ELF) and a **minify-only** extension. Public Detour helper stays Node/SEA MIT. No Rogers brand assets or Go helper source in this tree.

## Checklist

### Public (this repo)

- [x] Spec/ADR amendment: `DETOUR_BRAND_DIR`, `nativeHostName`, `hello`/capabilities, `DETOUR_DB_HOST_CMD`, manifest key notes; ADR-030; this plan + indexes
- [x] Implement `DETOUR_BRAND_DIR` in `extension/wxt.config.ts`
- [x] `nativeHostName` on brand + wire Databases / protocol (default `com.detour.db`)
- [x] Host + extension `hello` handshake; mismatch UX; capability-gated engines
- [x] `cli/src/db/contract.e2e.test.ts` honors `DETOUR_DB_HOST_CMD`
- [x] Unit tests; dual zip (`zip` + `zip:rogers`); write-back KB

### Private (out of tree — not in public MIT)

- [x] Create private `rogers-detour` repo scaffold (`https://github.com/HamzaKhan-Rogers/rogers-detour`): helper-go stub, private AI/ Draft, scripts README; **submodule pin blocked** until public Detour has a remote + tag; brand assets copied from local gitignored `extension/brands/rogers/`
- [x] Go spike (private `~/rogers-detour`): NM framing, hello/ping, caller check, Chrome install, keychain, SQLite + Postgres; `DETOUR_DB_HOST_CMD` contract hello green; garble build
- [x] Private extension build: `DETOUR_BRAND_DIR`, no sourcemaps, minify-only (obfuscator removed — broke popup / Defender), structural load-unpacked smoke (manual Chrome TBD)
- [x] `pnpm pack:all` four `detour-<ver>-<os>-<arch>.zip` (helper source + install scripts; **zero** shipped binaries) + `pack:verify`
- [ ] Real-machine smoke (macOS arm64/Intel, Windows/Ubuntu VMs)
- [x] Engine parity + connection options in Go (private `rogers-detour/helper-go`; mapper table tests; hello advertises full engine set; Astra bundle / Keyspaces SigV4 / thick Oracle / entra-interactive still config-or-error gaps)
- [ ] Edge manifests; Firefox route decision

## Out of scope (public)

- Partner trademarks, closed helper source, garble/obfuscation pipelines, partner OS packs

## Verification

- Specs Approved; ADR-030 present
- Public hooks: tests green; Detour zip always; Rogers zip when local `brands/rogers/` exists
- Private phases documented if GitHub private-repo creation is blocked
