# Store listing

Manual submission only. CI does not call the Chrome, Edge, or Firefox publish APIs.

**Listing title (≤45):** Detour - Redirect & Override Requests  
**Short description (≤132):** Redirect requests, modify headers, mock fetch/XHR, inject JS/CSS, and replace bodies locally. Free open-source Chrome extension.  
**Installed name** (manifest): Detour  
**Category:** Developer Tools  
**Language:** English  
**Homepage:** https://detour.protovoid.com/  
**Privacy policy URL:** https://detour.protovoid.com/privacy/  
**Source:** https://github.com/proto-void/detour

Character counts (verify before paste): title **37**; short description **128**.

Use this copy so reviewers do not treat this as the unrelated “Detour” proxy add-on (`detour-proxy` on AMO). Confirm the final URL slug in the dashboard (ADR-003).

## Description (paste)

Detour is a free, open-source Chrome extension to redirect requests, modify headers, mock fetch and XHR, inject JS or CSS, and replace response bodies — so you can point production URLs at localhost or mock code while you debug.

Everything runs in your browser. Rules stay on your device. There is no account, no Detour cloud, and no Detour server in the middle.

### What it does

- **Redirect requests** — map production scripts, APIs, or hosts to localhost or another origin
- **Modify request and response headers** — add, rewrite, or strip headers on matched URLs
- **Block URLs** — stop selected requests from loading
- **Inject JS or CSS** — drop in debug scripts or styles on matched pages
- **Mock fetch / XHR** — stub API responses without a proxy appliance
- **Replace response bodies** — swap response content locally after you allow it

### Privacy

Detour is local-only. Your rules, mocks, and match log do not leave the browser via Detour. There is no telemetry product and no SaaS sync.

On Chrome, body override uses the debugger API only after you click **Allow debugger**. On Firefox it uses response filtering, only after you allow that permission.

### Open source

MIT license. Source and docs: https://github.com/proto-void/detour  
Product site: https://detour.protovoid.com/

### Not a proxy or SaaS

Detour is a developer tools extension for rewriting requests and page resources in-browser. It is **not** a VPN, traffic proxy, or hosted “Detour” cloud service, and it is unrelated to the “Detour” proxy add-on on other stores.

## Chrome Web Store

**Submit packet (paste-ready):** [CWS-SUBMIT.md](CWS-SUBMIT.md) — zip path, listing fields, permission justifications, screenshot checklist, and dashboard steps.

1. `cd extension && corepack pnpm zip`
2. Upload `extension/.output/detour-<version>-chrome.zip` in the [developer dashboard](https://chrome.google.com/webstore/devconsole).
3. Paste the **title**, **short description**, and **detailed description** above.
4. Category: **Developer Tools**. Privacy policy URL: **https://detour.protovoid.com/privacy/** (HTML on the product site; source: [privacy.md](privacy.md)).
5. Permission justifications: copy from [permissions.md](permissions.md).
6. Single purpose: help developers redirect and override requests and page resources while they debug (local rules only).
7. Homepage / support: **https://detour.protovoid.com/** · source **https://github.com/proto-void/detour**
8. Store screenshots and promo tiles: follow [store-assets/README.md](store-assets/README.md). Prefer captions that name the UI (“Redirect rules”, “Mock fetch”, “Applied strip”).

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
