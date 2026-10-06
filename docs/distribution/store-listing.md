# Store listing

Manual submission only. CI does not call the Chrome, Edge, or Firefox publish APIs.

**Listing title:** Detour — Resource Override  
**Short description:** Point production at your code.  
**Installed name** (manifest): Detour

The longer title is for the store page, so reviewers do not treat this as the unrelated “Detour” proxy add-on (`detour-proxy` on AMO). If a dashboard forces the listing name to match the manifest, change the manifest `name` in that release and say so in the release notes. Confirm the final URL slug in the dashboard (ADR-003).

## Description (paste)

Detour is a free, open-source way to point production at your own code. Redirect requests, change headers, block URLs, inject JS or CSS, mock fetch/XHR, and replace a response body. Rules stay in the browser. There is no account and no Detour server.

You choose when body override is allowed. On Chrome that uses the debugger API, and only after you click Allow debugger. On Firefox it uses response filtering, and only after you allow that permission.

Source and license: MIT. See the project README for the privacy policy.

## Chrome Web Store

1. `cd extension && corepack pnpm zip`
2. Upload `extension/.output/detour-<version>-chrome.zip` in the [developer dashboard](https://chrome.google.com/webstore/devconsole).
3. Paste the title, summary, and description above.
4. Privacy policy URL: a public link to [privacy.md](privacy.md). A `github.com/<owner>/<repo>/blob/main/docs/distribution/privacy.md` link works once the repo is public. The URL is not known until the remote exists.
5. Permission justifications: copy from [permissions.md](permissions.md).
6. Single purpose: help developers rewrite requests and page resources while they debug.

Host permission `<all_urls>` and the `debugger` permission will get extra review. The justifications are written for that.

## Edge Add-ons

Use the **same Chromium zip** as Chrome (`detour-<version>-chrome.zip`). Submit in [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview). Same listing copy and privacy URL.

## Firefox AMO

1. `cd extension && corepack pnpm zip:firefox`
2. Upload `detour-<version>-firefox.zip` and the sources zip `detour-<version>-sources.zip` at [addons.mozilla.org](https://addons.mozilla.org/developers/).
3. Extension id is already `detour@protovoid.com`. Minimum Firefox is 128.
4. Data collection: none (`data_collection_permissions.required` is `none`).
5. Use the same listing title and the privacy policy URL.

## Not in this repo

Automating upload would need secrets in GitHub Actions, not in files. Do not add them until you decide to publish from CI:

| Store | Secret names the publisher CLI expects |
|-------|----------------------------------------|
| Chrome | `CHROME_EXTENSION_ID`, plus a service-account client email and private key (or a short-lived access token) |
| Edge | `EDGE_PRODUCT_ID`, `EDGE_CLIENT_ID`, `EDGE_API_KEY` |
| Firefox | `FIREFOX_JWT_ISSUER`, `FIREFOX_JWT_SECRET`, extension id `detour@protovoid.com` |

`wxt` exposes `wxt-publish-extension` for that later step. This slice does not call it. GitHub Release zips need no extra secret.
