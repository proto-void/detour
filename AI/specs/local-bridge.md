# Spec: local-bridge

**Status:** Approved  
**Last updated:** 2026-10-07  
**Approved by:** Hamza (2026-10-07) — his “1” on the next-module choice  
**Build order:** 6  
**Depends on:** rule-model, engine-core  
**Related:** [engine-deep](engine-deep.md) (inline `overrideBody`), [rule-model](rule-model.md), [000-capability-map](000-capability-map.md), [ADR-001](../DECISIONS.md), [ADR-002](../DECISIONS.md), [ADR-012](../DECISIONS.md)

## Objective

Ship an optional **Node CLI Local Bridge** that serves a local folder over loopback so a Detour rule can point a production URL at a file on disk. This is the durable path for on-disk builds. Pasted text stays `overrideBody` (engine-deep). There is no Detour backend and no cloud.

## Protocol

**Localhost HTTP**, not WebSocket and not native messaging.

- The Draft acceptance criteria already require a loopback HTTP server bound to `127.0.0.1`.
- [ADR-001](../DECISIONS.md) names a Node CLI over loopback HTTP (WebSocket was only an alternative). WebSocket does not give the page a response body. Native messaging needs an OS-registered host.
- The extension compiles a connected rule into a Core DNR **redirect** to an opaque `http://127.0.0.1` URL. That is the least-privilege engine and works without the debugger.

The page you are debugging can see the session token on that redirected request. Other sites cannot: the token is 32 random bytes, the server rejects any other request, and it does not opt private-network access in unless the token matched.

## User stories

- As a developer, I can run `detour bridge ./dist` and map `https://cdn.example.com/app.js` → a file under `./dist`.
- As a developer, I can edit that file on disk and reload; the bridge sends `Cache-Control: no-store`.
- As a developer, I can work without the Bridge. Core rules do not need it. A bridge rule that is not connected, or whose bridge is down, is refused and does not redirect.

## Rule

`serveLocal { path }` — `path` is relative to the folder passed to the CLI (`assets/app.js`). No absolute paths, no `..`.

Resource Override `fileOverride` still imports as inline `overrideBody`. Those exports contain file bytes, not a disk path. Disk mapping is a `serveLocal` rule the user writes (or will write) against a running bridge.

## Acceptance criteria

- [ ] CLI `detour bridge <folder> [--port 47321]` listens on `127.0.0.1` only. There is no flag to bind `0.0.0.0`.
- [ ] Each start prints a new 64-hex token. `GET /health` with `Authorization: Bearer <token>` returns `{ ok, rootLabel }` where `rootLabel` is the folder’s basename, not a full path.
- [ ] `GET /d/<token>/<base64url-path>` serves that file. The URL does not include the filename, so a pattern like `*.js` does not also match the bridge and loop. Wrong token, traversal, symlink escape, and directories are 404. No directory listing.
- [ ] The extension stores the token only after the user connects and `/health` succeeds (`storage.local.bridgeSession`). Disconnect clears it.
- [ ] While connected and healthy, an enabled `serveLocal` rule compiles to a DNR redirect. Refusal messages and the match log do not contain the token or file bytes.
- [ ] Not connected → `bridge-not-connected`. Health check fails → `bridge-down`. The production URL is left alone.
- [ ] Package name `@detour/cli` (unscoped `detour` is taken). Not published to npm in this slice.

## Browser support table

| Browser | Min | This slice |
|---------|-----|------------|
| Chrome / Edge / Brave | 120+ | DNR redirect to `http://127.0.0.1`. `<all_urls>` already covers the probe. |
| Firefox | 128 ESR+ | Same redirect. No extra permission. |
| Safari | 17+ | Not verified. |

A page with a Content-Security-Policy that does not allow `http://127.0.0.1` can still block the redirected script. Inline `overrideBody` keeps the original URL for that case. Replacing the body in place from the bridge is a later slice.

## Limits and gotchas

- Bind `127.0.0.1` only. `localhost` may be `::1`, which this process does not listen on. Rules use `127.0.0.1`.
- Do not pass `/` or a drive root. The CLI refuses the filesystem root.
- Host header must be `127.0.0.1` with the bridge port (DNS rebinding).
- The token is in the redirect URL. Treat a shared bridge folder as readable by the page you override.
- Private Network Access: `Access-Control-Allow-Private-Network` is sent only after the token matches.
- HTTPS → `http://127.0.0.1` is a secure context in current Chrome and Firefox, and CSP can still block it.
- CORS: file responses after a good token send `Access-Control-Allow-Origin: *` so a redirected `fetch` can read them. No cookies.

## Out of scope

- Cloud file sync, accounts, telemetry of paths or file bytes
- Replacing a MITM proxy
- Listening on non-loopback addresses
- HTTPS local certificates
- In-place body fulfill (debugger / `filterResponseData`) fed by the bridge
- npm publish and a GitHub Release of the CLI (distribution stays store zips only)
- Changing RO `fileOverride` import away from `overrideBody`

## Verification

- CLI tests: fixture file over `127.0.0.1`, traversal and symlink 404, wrong token 404, Host mismatch 404, bind address is `127.0.0.1`
- Extension tests: redirect URL when up, refusals when down or disconnected, refusal text has no token
- `pnpm test`, `pnpm typecheck`, Chrome and Firefox builds
- Chrome e2e: one script on an `http://127.0.0.1` page is served from the real CLI
- Firefox: same DNR mechanism, no Firefox-only API. UI e2e is still blocked (BiDi cannot open `moz-extension://` pages)
