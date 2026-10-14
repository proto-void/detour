# Chrome Web Store — Detour 0.1.0 submit packet

Paste-ready handoff for the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).  
This file is the Phase 2 checklist. **You must capture screenshots and click Submit** — no agent can log into your Google account.

**Do not set `chromeStoreUrl` until the listing is live.** Keep it empty in `detour-web/site.config.ts`.

---

## Package (verified)

| Item | Value |
|------|--------|
| **Zip path** | `/Users/hamzakhan/Resource Override/extension/.output/detour/detour-0.1.0-chrome.zip` |
| **Version** | `0.1.0` |
| **Size** | ~460 KB (`471289` bytes) |
| **Store icon 128×128** | Inside zip at `icons/128.png` (also `extension/.output/detour/chrome-mv3/icons/128.png`) |
| **Privacy policy** | https://detour.protovoid.com/privacy/ — **HTTP 200** |
| **Homepage** | https://detour.protovoid.com/ |
| **Source** | https://github.com/proto-void/detour |

Rebuild only if extension source changed after the zip:

```bash
cd "/Users/hamzakhan/Resource Override/extension" && corepack pnpm zip
```

---

## Listing fields (paste)

### Title (≤45)

```
Detour - Redirect & Override Requests
```

### Short description (≤132)

```
Redirect requests, modify headers, mock fetch/XHR, inject JS/CSS, and replace bodies locally. Free open-source Chrome extension.
```

### Category

`Developer Tools`

### Language

`English`

### Homepage URL

```
https://detour.protovoid.com/
```

### Privacy policy URL

```
https://detour.protovoid.com/privacy/
```

### Support / contact email

```
detour@protovoid.com
```

### Detailed description (paste)

```
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
```

Sources: [store-listing.md](store-listing.md).

---

## Single purpose (paste)

```
Help developers redirect and override requests and page resources while they debug — rules stay on the device.
```

---

## Permission justifications (paste)

Use the table rows below (or the paragraphs that follow) in the dashboard privacy / permissions questionnaire.

| Permission | Why it is in the package | When it runs |
|------------|--------------------------|--------------|
| `declarativeNetRequest` | Redirect, modify headers, and block matching requests | While Detour is on and a rule compiled to DNR is enabled |
| `declarativeNetRequestFeedback` | Toolbar badge and the on-device match log (Chromium only). No install warning. Firefox has no equivalent API | While the badge or log is in use. The log stores a rule label and URL, not the rule body |
| `storage` | Save the rule workspace, on/off switch, theme, and apply report on this device | On edit and on browser start |
| `unlimitedStorage` | Workspaces can hold inline scripts, CSS, and mock bodies the user typed | Only for that local data |
| `scripting` | Inject the packaged page bridge and CSS the user wrote | When an inject or mock rule is enabled |
| `userScripts` | Run **user-written** inline JS. Chrome requires the user to allow user scripts. Firefox lists this as optional | Only after that grant, and only while an inline JS rule is enabled |
| `host_permissions: <all_urls>` | Redirect and header changes need access to the request URL and the page that started it. Injection needs the page | While a matching rule is enabled. Not used to upload browsing history |
| `debugger` (Chrome, install time) | Replace a response body in place. MV3 has no other API for that. The extension does not read the original body | Only after the user clicks **Allow debugger**, and only on http(s) tabs that match a body rule. Install does not attach |

### Paste-ready justification paragraphs

**declarativeNetRequest:** Used to redirect, modify headers, and block matching requests while Detour is on and a rule compiled to DNR is enabled. Local rules only; nothing is sent to a Detour server.

**declarativeNetRequestFeedback:** Powers the toolbar badge and the on-device match log. The log stores a rule label and URL, not the rule body. No install warning.

**storage:** Saves the rule workspace, on/off switch, theme, and apply report on this device (on edit and on browser start).

**unlimitedStorage:** Workspaces can hold inline scripts, CSS, and mock bodies the user typed — local data only.

**scripting:** Injects the packaged page bridge and CSS the user wrote when an inject or mock rule is enabled.

**userScripts:** Runs user-written inline JS only after the user allows user scripts, and only while an inline JS rule is enabled.

**host_permissions (`<all_urls>`):** Required so a developer tool can match whatever host they are debugging. Redirect and header changes need access to the request URL and the page that started it; injection needs the page. Used only while a matching rule is enabled — not used to upload browsing history. Rules are not limited to one site in advance.

**debugger:** Used only to replace a response body in place (MV3 has no other API for that). The extension does not read the original body. Attach happens only after the user clicks **Allow debugger**, and only on http(s) tabs that match a body rule. Install does not attach. Chrome shows its own debugging indicator while attached. Not used for screenshots, cookies export, or remote control.

**Additional notes for reviewers:** Turning Detour off clears active rules and does not register page scripts. Body override stays off until the user opts in (`bodyEngineConsent`). There is no account and no Detour cloud.

Source: [permissions.md](permissions.md).

---

## Screenshots (Phase 1)

Product PNGs now live under `docs/distribution/store-assets/` (demo-safe `example.com` / `localhost` rules, dark UI). Promo tiles do **not** replace screenshots.

### Ready files (upload order = CTR)

| Order | File | Size | Caption |
|------:|------|------|---------|
| 1 | `popup.png` | **800×1280** ⚠️ | `Popup with Applied strip` |
| 2 | `redirect.png` | 2560×1800 | `Redirect rules` |
| 3 | `mock.png` | 2560×1800 | `Mock fetch / XHR` |
| 4 | `log.png` | 2560×1800 | `On-device match log` |
| — | `headers.png` | 2560×1800 | `Modify headers` (optional extra) |
| — | `inject.png` | 2560×1800 | `Inject JS / CSS` (optional extra) |
| — | `body.png` | 2560×1800 | `Replace response body` (optional extra) |

**Before submit:** Confirm CWS still accepts your first screenshot size. `popup.png` is **below** the usual ≥1280×800 floor. If the dashboard rejects it, re-capture the popup at ≥1280×800 (or pad/composite on a dark Protovoid canvas) and keep it first.

### If you need to re-capture manually

1. Load unpacked: `extension/.output/detour/chrome-mv3/` (or unpack the release zip).
2. Capture **≥1280×800**. Dark theme. `localhost` / `example.com` only — no Rogers / customer data.
3. Save under `docs/distribution/store-assets/`.

Details: [store-assets/README.md](store-assets/README.md).

### Store icon

If the dashboard asks separately: upload `icons/128.png` from the zip / `extension/.output/detour/chrome-mv3/icons/128.png`.

### Promo tiles (optional — skip for first submit)

- `promo-small-440x280.png` (440×280)
- `promo-marquee-1400x560.png` (1400×560)

**Skip promo tiles for this first submission** unless you want them.

---

## Dashboard steps (Phase 2 — you)

1. Open [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) → your Detour item (new or existing draft).
2. **Package:** Upload  
   `/Users/hamzakhan/Resource Override/extension/.output/detour/detour-0.1.0-chrome.zip`
3. **Store listing:** Paste title, short description, detailed description from this file.
4. Set **Category** = Developer Tools, **Language** = English.
5. Set **Homepage**, **Privacy policy**, **Support email** (`detour@protovoid.com`).
6. **Media:** Upload ≥3 screenshots (order above). Store icon 128 if prompted. **Skip promo tiles** for first submit.
7. **Privacy / permissions:** Paste single-purpose + each permission justification from this file.
8. **Distribution:** Public (or Unlisted only if you intentionally soft-launch).
9. **Submit for review.**

Expect extra scrutiny for `<all_urls>` + `debugger`. Justifications above already cover local-only body override after **Allow debugger**.

Do not claim affiliation with other “Detour” proxy add-ons (listing copy already distinguishes).

---

## After approval (Phase 3 — do not do yet)

When the listing is public and you have the store URL:

1. Set `chromeStoreUrl` in `/Users/hamzakhan/Project/detour-web/site.config.ts` (currently `''` — **leave empty until live**).
2. Redeploy `detour-web` so Install CTA, footer, and SoftwareApplication `downloadUrl` light up — see [detour-web docs/SEO.md](/Users/hamzakhan/Project/detour-web/docs/SEO.md).
3. Add the same URL to the `proto-void/detour` README install section / badge.
4. Point Protovoid `/products/` Detour CTA at the store URL if it should install from CWS.
5. (Optional ops) Google Search Console for `detour.protovoid.com` → submit `sitemap-index.xml`.

---

## Out of scope this pass

- Edge Add-ons / Firefox AMO
- Automating CWS publish from CI
- Setting `chromeStoreUrl` before the listing is live
