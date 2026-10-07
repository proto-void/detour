# Spec: local-bridge

**Status:** Approved  
**Last updated:** 2026-10-07  
**Approved by:** Hamza (2026-10-07) — localhost HTTP bridge, then in-place body (his “in-place bridge read”)  
**Build order:** 6  
**Depends on:** rule-model, engine-core, engine-deep (in-place slice)  
**Related:** [engine-deep](engine-deep.md) (inline `overrideBody` and the fulfill path), [rule-model](rule-model.md), [000-capability-map](000-capability-map.md), [ADR-001](../DECISIONS.md), [ADR-002](../DECISIONS.md), [ADR-012](../DECISIONS.md), [ADR-013](../DECISIONS.md), [ADR-015](../DECISIONS.md), [ADR-016](../DECISIONS.md), [ADR-017](../DECISIONS.md), [ADR-018](../DECISIONS.md)

## Objective

Ship an optional **Node CLI Local Bridge** that serves a local folder over loopback so a Detour rule can point a production URL at a file on disk. This is the durable path for on-disk builds. Pasted text stays `overrideBody` (engine-deep). There is no Detour backend and no cloud.

## Protocol

**Localhost HTTP**, not WebSocket and not native messaging.

- The Draft acceptance criteria already require a loopback HTTP server bound to `127.0.0.1`.
- [ADR-001](../DECISIONS.md) names a Node CLI over loopback HTTP (WebSocket was only an alternative). WebSocket does not give the page a response body. Native messaging needs an OS-registered host.
- The extension compiles a connected rule into a Core DNR **redirect** to an opaque `http://127.0.0.1` URL when the body engine is not allowed. That path needs no debugger.

When `storage.local.bodyEngineConsent` is set and the browser permission is present (Allow debugger on Chrome, Allow response rewriting on Firefox), the same rule is **not** redirected. The extension reads the file from the bridge and fulfills the original response in place, reusing the engine-deep body path (CDP `Fetch.fulfillRequest` / Firefox `filterResponseData`). The request URL stays the production URL, so a Content-Security-Policy that blocks `http://127.0.0.1` still allows the file. [ADR-013](../DECISIONS.md).

The page you are debugging can see the session token on a redirected request. It does not see the token when the body is fulfilled in place: the extension fetches loopback itself. Other sites cannot: the token is 32 random bytes, the server rejects any other request, and it does not opt private-network access in unless the token matched.

## User stories

- As a developer, I can run `detour bridge ./dist` and map `https://cdn.example.com/app.js` → a file under `./dist`.
- As a developer, I can edit that file on disk and reload; the bridge sends `Cache-Control: no-store`.
- As a developer, I can work without the Bridge. Core rules do not need it. A bridge rule that is not connected, or whose bridge is down, is refused and does not redirect.
- As a developer on a page whose Content-Security-Policy blocks `http://127.0.0.1`, I can still load the disk file after I allow response rewriting, because the address does not change.

## Rule

`serveLocal { path }` — `path` is relative to the folder passed to the CLI (`assets/app.js`). No absolute paths, no `..`.

Resource Override `fileOverride` still imports as inline `overrideBody`. Those exports contain file bytes, not a disk path. Disk mapping is a `serveLocal` rule the user writes (or will write) against a running bridge.

## Acceptance criteria

- [x] CLI `detour bridge <folder> [--port 47321]` listens on `127.0.0.1` only. There is no flag to bind `0.0.0.0`.
- [x] Each start prints a new 64-hex token. `GET /health` with `Authorization: Bearer <token>` returns `{ ok, rootLabel }` where `rootLabel` is the folder’s basename, not a full path.
- [x] `GET /d/<token>/<base64url-path>` serves that file. The URL does not include the filename, so a pattern like `*.js` does not also match the bridge and loop. Wrong token, traversal, symlink escape, and directories are 404. No directory listing.
- [x] The extension stores the token only after the user connects and `/health` succeeds (`storage.local.bridgeSession`). Disconnect clears it.
- [x] While connected and healthy, an enabled `serveLocal` rule compiles to a DNR redirect when response rewriting is not allowed. Refusal messages and the match log do not contain the token or file bytes.
- [x] Not connected → `bridge-not-connected`. Health check fails → `bridge-down`. The production URL is left alone.
- [x] Package name `@detour/cli` (unscoped `detour` is taken). Not published to npm in this slice.
- [x] With body-engine consent, a healthy bridge, and a safe relative path, `serveLocal` is armed on the body engine and is not a DNR redirect. The extension `GET`s only `http://127.0.0.1:<port>/d/<token>/<base64url path>` and replaces the response. The page URL is unchanged. The fulfilled status is 200, `Cache-Control` is `no-store`, and `Content-Type` follows the file. A read that fails or exceeds 8 MiB leaves the production response.
- [x] Without that consent, behavior stays the redirect above. Allow debugger / Allow response rewriting is the same `bodyEngineConsent` control as inline body override.
- [x] The rules page says which mode is active, and a disconnected bridge still shows `bridge-not-connected`. The apply report and match log still omit the token and file bytes.

## Browser support table

| Browser | Min | This slice |
|---------|-----|------------|
| Chrome / Edge / Brave | 120+ | In-place via `chrome.debugger` Fetch when Allow debugger is on. Otherwise DNR redirect to `http://127.0.0.1`. |
| Firefox | 128 ESR+ | In-place via `filterResponseData` when Allow response rewriting is on. Otherwise the same redirect. |
| Safari | 17+ | Not verified. |

A page with a Content-Security-Policy that does not allow `http://127.0.0.1` blocks the redirect. In-place keeps the original URL, so that policy still applies to the production address. While that in-place rule is armed, HTML documents get a SHA-384 `integrity` of the file for matching script and stylesheet tags ([ADR-014](../DECISIONS.md)). The same hash is used when page JavaScript assigns `integrity` ([ADR-015](../DECISIONS.md)), passes the tag to `innerHTML` / `insertAdjacentHTML` ([ADR-016](../DECISIONS.md)), inserts markup that runs scripts through `createContextualFragment` or `setHTMLUnsafe` ([ADR-017](../DECISIONS.md)), passes the tag to `outerHTML` / a shadow root's `innerHTML` or copies the attribute with `setAttributeNS` ([ADR-018](../DECISIONS.md)), or passes the tag to `setHTMLUnsafe` when scripts are off ([ADR-019](../DECISIONS.md)), or passes the string to `Document.parseHTMLUnsafe` or `DOMParser` with type `text/html` ([ADR-020](../DECISIONS.md)), or moves that attribute with `setAttributeNode` or `setAttributeNodeNS` ([ADR-021](../DECISIONS.md)). Nodes moved from that document into the page carry the hash. The redirect path does not rewrite the document, so the page's hash can still reject the file. Inline `overrideBody` uses the same hash update.

## Limits and gotchas

- Bind `127.0.0.1` only. `localhost` may be `::1`, which this process does not listen on. Rules use `127.0.0.1`.
- Do not pass `/` or a drive root. The CLI refuses the filesystem root.
- Host header must be `127.0.0.1` with the bridge port (DNS rebinding).
- The token is in the redirect URL. Treat a shared bridge folder as readable by the page you override.
- Private Network Access: `Access-Control-Allow-Private-Network` is sent only after the token matches.
- HTTPS → `http://127.0.0.1` is a secure context in current Chrome and Firefox, and CSP can still block the redirect. In-place avoids that navigation.
- CORS: file responses after a good token send `Access-Control-Allow-Origin: *` so a redirected `fetch` can read them. No cookies. In-place responses keep the production URL, so that page origin applies.
- In-place uses the body engine: Chrome’s debugging banner, one debugger client per tab, and DevTools disconnect. Cancelling the banner leaves that tab on the production response until the body plan changes. There is no per-tab redirect fallback.
- The extension’s loopback `GET` carries the token in the path. Do not log that URL. The match log stores the page’s request URL.
- Files larger than 8 MiB are not copied into the service worker. The production response is left in place.
- A failed Firefox read can pass the original bytes through after `content-encoding` was stripped. Chrome `continueResponse` leaves the original response intact.

## Out of scope

- Cloud file sync, accounts, telemetry of paths or file bytes
- Replacing a MITM proxy
- Listening on non-loopback addresses
- HTTPS local certificates
- npm publish and a GitHub Release of the CLI (distribution stays store zips only)
- Changing RO `fileOverride` import away from `overrideBody`

## Verification

- CLI tests: fixture file over `127.0.0.1`, traversal and symlink 404, wrong token 404, Host mismatch 404, bind address is `127.0.0.1`
- Extension tests: redirect URL when up and rewriting is off; no redirect and a body-engine arm when rewriting is on; refusals when down or disconnected; refusal text and the apply report have no token
- Body-engine tests: Chrome fulfill uses the bridge bytes and status 200, and continues when the read fails; Firefox writes those bytes. Neither log includes the token
- `pnpm test`, `pnpm typecheck`, Chrome and Firefox builds
- Chrome e2e: with Allow debugger already on, a page whose `script-src` is `'self'` on port 8001 still runs the disk script (the bridge listens on another port). The script URL stays on port 8001
- Firefox: same mechanisms, unit-tested. UI e2e is still blocked (BiDi cannot open `moz-extension://` pages)
