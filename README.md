# Detour

**Redirect and override production requests in Chrome** — point production at your code.

Free · MIT · No account · No Detour server

[![Product site](https://img.shields.io/badge/site-detour.protovoid.com-7b1398)](https://detour.protovoid.com/)
[![MIT](https://img.shields.io/badge/license-MIT-0f0c1b)](LICENSE)
[![GitHub](https://img.shields.io/badge/github-proto--void%2Fdetour-4a1f9a)](https://github.com/proto-void/detour)

Product site: [detour.protovoid.com](https://detour.protovoid.com/) · Source: [github.com/proto-void/detour](https://github.com/proto-void/detour) · Privacy: [detour.protovoid.com/privacy/](https://detour.protovoid.com/privacy/)

Detour is a free, open-source browser extension to redirect requests, modify headers, mock fetch/XHR, inject JS/CSS, and replace response bodies so you can aim production URLs at localhost or mock code — locally, without a proxy appliance or paid SaaS.

<details>
<summary><strong>Install</strong></summary>

### Chrome / Edge

1. When a store listing exists, install **Detour** from the Chrome Web Store or Edge Add-ons.
2. Or load a release zip / unpacked build: open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**, choose **Load unpacked**, and select the built extension folder (or unpack a GitHub Release zip first).
3. Pin the toolbar icon if you like quick access.

Packaging and store copy live in [docs/distribution/](docs/distribution/README.md).

### Firefox

1. When listed, install from Firefox Add-ons (AMO). Extension id: `detour@protovoid.com` (Firefox 128+).
2. Or install a temporary / release zip from GitHub Releases via `about:debugging` → **This Firefox** → **Load Temporary Add-on**.

### Rogers flavor (internal)

The **Rogers** build is the same Detour app with a different theme and icons. Display name stays **Detour**. It is for internal use, not the public store listing.

**QA — Chrome zip** (`rogers-<version>-chrome.zip`): unzip first, then open `chrome://extensions` → **Developer mode** (top right) → **Load unpacked** → select the unzipped folder (`manifest.json` inside; not the `.zip`). See `extension/README-load-unpacked.md` (annotated screenshot: `extension/public/load-unpacked-steps.jpg`) or [docs/distribution](docs/distribution/README.md).

</details>

<details>
<summary><strong>Quick start (2 minutes)</strong></summary>

Your first redirect — point a production script at localhost:

1. Click the Detour toolbar icon → turn **Detour enabled** on.
2. Open **Rules** (popup tile or the full options page).
3. Click **New Group**, then **New Rule** (or **Add your first group** on an empty page).
4. In the rule drawer, keep **Match** selected. Set **Pattern type** to **Wildcard (\*)** and **Pattern** to something like `https://cdn.example.com/app.js`.
5. Open the **Action** tab. Choose **Redirect**. Set **Redirect to** to `http://localhost:5173/app.js`.
6. Wait for **Autosave**, or click **Save now**. The status strip should show the rule as **Applied**.
7. Reload the production page. The script should load from your local server.

Tip: the **Recipes** tab has **Point a site at localhost** for whole-host redirects.

</details>

## The popup

<details>
<summary><strong>Popup — on/off, counts, groups, import</strong></summary>

**What it does**  
Quick controls without opening the full rules page.

**When to use it**  
Flip Detour off for one debugging session, peek at Applied / Refused counts, or jump to Rules / API Tester / Recipes / Log.

**How to**

1. Click the Detour toolbar icon.
2. Use **Detour enabled** to turn all rules on or off.
3. Read the strip: **Applied**, **Refused**, **Off** (how many rules are live, blocked by the engine, or switched off).
4. See **N rules matched on this tab** for the current tab’s badge-style count.
5. Toggle **Groups** (first several groups) on or off; more groups live under **Rules**.
6. Use the tiles: **Rules**, **API Tester**, **Recipes**, **Log**.
7. Expand **Import rules** to import a Detour or legacy Resource Override export.
8. Footer: **Light theme** and **Match count** (toolbar badge on/off).

**Tips / limits**  
Refused rules need a fix (loop, missing permission, bridge down, and so on) — open **Rules** for details. The badge needs Chromium’s DNR feedback API; Firefox does not show the same match count on the icon.

</details>

## Rules

<details>
<summary><strong>Rules tab — groups, editor, actions</strong></summary>

**What it does**  
Full workspace: create groups and rules, reorder, match, pick an action, test a URL, import/export.

**When to use it**  
Anything beyond a quick popup toggle — editing redirects, body replaces, injects, mocks, local files.

**How to**

1. Open **Rules** from the popup or the options page.
2. **New Group** / **New Rule**, or filter by pattern / action.
3. Click a rule row to open the drawer. Sections: **Match**, **Action**, **Test**.
4. Edits **Autosave** after a short idle when valid (or **Save now** / Ctrl/Cmd+S). Use **Discard** to drop unsaved edits; **Export** downloads your rules.
5. Status strip: **Applied** / **Refused** / **Unsaved** / **Off**, plus **Bridge connected** / **Bridge not connected**.

**Tips / limits**  
Highest rule in a group wins when several match. Keep Detour **on** in the header or nothing is applied (edits still save).

<details>
<summary>Groups and rules</summary>

- Groups have a name, on/off switch, menu (**Rename**, **Edit sites…**, **Move up** / **Move down**, **Delete group**).
- **Only on these sites** (group menu → **Edit sites…**) limits the group to listed hosts; leave blank for all sites. Cross-site iframes may not be covered on older Chromium.
- Rules reorder by drag grip; each has its own on/off switch.
- Importing the same file again can replace an **Imported** group (you’ll be asked when needed).

</details>

<details>
<summary>Match / Action / Test</summary>

**Match**

| Field | Meaning |
|-------|---------|
| **Pattern** | URL (or page URL for inject) to match |
| **Pattern type** | **Wildcard (\*)** (simple `*` globs) or **Regular expression** |
| **Match upper/lower case exactly** | Case-sensitive matching |
| **Applies to** | **All requests, including page loads** · **Everything except page loads** · **Custom…** |
| **Request types** (Advanced) | Fine-grained types: page loads, scripts, fetch/XHR, and so on |

**DNR** means *declarativeNetRequest* — Chrome/Firefox’s built-in rule engine for redirect, block, and headers (fast; limited regex budget).

**Action** — pick a chip (see blocks below): Redirect, Block, Modify Headers, Inject JS, Inject CSS, Mock Fetch, Replace Body, Serve Local.

**Test** — **Try a URL (not saved)** shows whether this rule would match and what it would do. Optional **Note**.

</details>

</details>

<details>
<summary><strong>Redirect</strong></summary>

**What it does**  
Send matching requests to another URL (DNR redirect).

**When to use it**  
Point `https://cdn.example.com/app.js` at `http://localhost:5173/app.js`.

**How to**

1. Action chip: **Redirect**.
2. Set **Redirect to** (wildcards can map path segments the same way as the pattern).
3. Save / autosave, then reload the page.

**Tips / limits**  
Redirect loops are refused. Patterns must be printable ASCII. Prefer **Wildcard (\*)** over regex when you can (regex slots are scarce).

</details>

<details>
<summary><strong>Block</strong></summary>

**What it does**  
Cancel matching requests.

**When to use it**  
Stop a noisy analytics script or a bad third-party call while you debug.

**How to**

1. Action chip: **Block**.
2. Set the **Pattern** (and **Applies to** / request types if needed).
3. Save and reload.

**Tips / limits**  
Blocking a `main_frame` page load blanks the tab — usually you want scripts or fetch/XHR only.

</details>

<details>
<summary><strong>Modify Headers</strong></summary>

**What it does**  
Add, set, or remove request and/or response headers.

**When to use it**  
Add CORS headers on a response, or strip a cookie on the way out.

**How to**

1. Action chip: **Modify Headers**.
2. Edit request and response operations in the Action panel.
3. Save and reload (or re-issue the request).

**Tips / limits**  
Some headers are forbidden by the browser. The **Allow CORS** recipe sets common Access-Control-\* response headers but does not answer OPTIONS preflights by itself.

</details>

<details>
<summary><strong>Inject JS</strong></summary>

**What it does**  
Run your JavaScript on matching pages.

**When to use it**  
Patch a page quirk or log values without changing the deployed bundle.

**How to**

1. Action chip: **Inject JS**.
2. Choose **Source** (inline or URL), write or link the script, set **When** and **Run in**.
3. On Chrome, turn on **Allow User Scripts** for this extension (Chrome 138+) or Developer mode on older builds; use the banner **Open Detour’s settings** / **Check again**. On Firefox, use **Grant** when prompted.
4. Save and reload the page.

**Tips / limits**  
Inline JS stays paused until user scripts are allowed. URL-sourced scripts use a different path and may not need that toggle.

</details>

<details>
<summary><strong>Inject CSS</strong></summary>

**What it does**  
Insert a stylesheet on matching pages.

**When to use it**  
Hide a banner or tweak layout on production while you develop.

**How to**

1. Action chip: **Inject CSS**.
2. Choose inline CSS or a stylesheet URL; set **When**.
3. Save and reload.

**Tips / limits**  
Does not need Allow User Scripts. Match is against the **page** URL, not every subresource.

</details>

<details>
<summary><strong>Mock Fetch</strong></summary>

**What it does**  
Answer `fetch` / XHR in the page with a fixed status, headers, and body (no real network for that call).

**When to use it**  
Stub `https://api.example.com/users` with JSON while the backend is down.

**How to**

1. Action chip: **Mock Fetch**.
2. Set method, status, optional delay, headers, and **Response body**.
3. Save and reload / re-trigger the request from the page.

**Tips / limits**  
Mocks are in-page — they may not appear as normal Network rows the same way. Prefer this over full body replace when you only need to fake an API call.

</details>

<details>
<summary><strong>Replace Body</strong></summary>

**What it does**  
Replace the response body of a matching request — either by redirecting to a `data:` URL or by rewriting in place.

**When to use it**  
Swap a production `app.js` body for your own text without hosting a local file.

**How to**

1. Action chip: **Replace Body**.
2. Choose **Delivery**:
   - **Redirect to data: URL (works with DevTools open; no debugger)** — default; Network often shows **307 Internal Redirect** then a `data:` request.
   - **Replace in place (keeps URL; for CSP/SRI pages; uses debugger)** — keeps the original URL (needed for strict CSP / Subresource Integrity).
3. Edit **Replacement body** and optional **Content-Type**.
4. For **in place**, click **Allow debugger** (Chrome) or grant response rewriting (Firefox) when the banner says **Response body rules are paused.**

**Tips / limits**  
Redirect delivery does not need the debugger and works with DevTools open; CSP that blocks `data:` or SRI will reject it — use in place. Opening DevTools on a tab can disconnect Chrome’s debugger attach for in-place rules. Files on disk use **Serve Local** instead.

</details>

<details>
<summary><strong>Serve Local</strong></summary>

**What it does**  
Serve a file from a folder on your machine via **Local Bridge** (`detour bridge`).

**When to use it**  
Point `https://cdn.example.com/app.js` at `./dist/app.js` on disk.

**How to**

1. Start the bridge (see [Local Bridge](#local-bridge-serve-files-from-disk)).
2. On the Rules page, open **Bridge not connected** → paste **Port** and **Token** → **Connect**.
3. Action chip: **Serve Local**. Set **File in the bridge folder** (e.g. `assets/app.js`).
4. Save. With **Allow debugger** / response rewriting on, the URL stays the same; otherwise the browser redirects to `127.0.0.1`.

**Tips / limits**  
If the bridge is down or disconnected, the rule is **Refused** and production keeps loading. Token changes every bridge start.

</details>

<details>
<summary><strong>Import / export</strong></summary>

**What it does**  
Export your Detour rules as a file, or import Detour / legacy **Resource Override** exports.

**When to use it**  
Move rules between machines, or bring an old Resource Override backup into Detour.

**How to**

1. **Export** on the options header downloads the current saved rules.
2. **Import rules** from the popup, empty-state link, or Import drawer — **Choose file…** / **Open importer…**.
3. Confirm replace vs **Import as new** when Detour recognizes a prior import of the same file.

**Tips / limits**  
This is the only place the old product name **Resource Override** appears on purpose (import compatibility). Re-import can keep on/off state via import keys when the file matches.

</details>

## API Tester

<details>
<summary><strong>API Tester — send requests and see which rules apply</strong></summary>

**What it does**  
Send HTTP requests (including to localhost), manage collections and environments, and show **Which rules apply** — with **Apply Detour rules** on by default.

**When to use it**  
Probe an API the same way a page would, and verify Detour would redirect, mock, or rewrite it.

**How to**

1. Open the **API Tester** tab (options or popup tile).
2. Enter a URL (or paste a `curl` command into the URL field). Pick a method → **Send**.
3. Optional: turn **Apply Detour rules** off to hit the real network only.
4. Use sidebar **Collections**, **History**, and **Envs**; **Import** cURL or Postman Collection v2.1; **Copy as cURL**; **Save**.
5. Request sub-tabs: **Params**, **Auth**, **Headers**, **Body**, **Scripts**.
6. Response: status / time / size, **Pretty** / **Raw** / **Preview**, **Headers**, **Test results**, **Which rules apply**.

**Tips / limits**  
No Detour account or cloud sync. Scripts are saved with the request; the full sandboxed `pm` + chai runner is still landing. Later slices add more power — see plan `025`. Do not call this UI a “workspace” (that word is reserved for the rules container).

</details>

## Recipes

<details>
<summary><strong>Recipes — starter rule packs</strong></summary>

**What it does**  
One-click starter groups that become normal editable rules after you add them.

**When to use it**  
Bootstrap common setups instead of building from a blank rule.

**Built-in recipes**

| Recipe | Use |
|--------|-----|
| **Point a site at localhost** | Redirect every request on a production host to your dev server (default local origin `http://localhost:5173`). |
| **Allow CORS** | Add Access-Control-Allow-\* response headers for a request pattern. |
| **SPA fallback** | Send page loads with no file extension to `/index.html`. |

**How to**

1. Open **Recipes**.
2. Click **Use this recipe**, fill the fields, then **Add to rules**.
3. Review on **Rules** and let **Autosave** apply (or **Save now**).

**Tips / limits**  
There is no separate recipe file format yet — recipes become ordinary groups.

</details>

## Log

<details>
<summary><strong>Log — recent matches</strong></summary>

**What it does**  
Session-only list of recent rule hits (label + URL). No rule bodies stored.

**When to use it**  
Confirm a rule fired on this tab, or filter network vs body vs page matches.

**How to**

1. Open **Log** (popup tile or options tab). Heading: **Recent matches**.
2. Filter text or chips: **All**, **Network**, **Body replaced**, **Page**.
3. Expand **How to read this** for delivery notes.
4. **Clear** wipes the session list.

**Tips / limits**  
Newest ~50 rows; cleared when the browser session ends. Toolbar **Match count** uses the same data on Chromium. Firefox does not record DNR matches the same way. Mock / inject rows are in-page sources.

</details>

## DevTools panel

<details>
<summary><strong>DevTools panel</strong></summary>

**What it does**  
Shows which rules would apply to the **page load** of the inspected tab.

**When to use it**  
You’re already in DevTools and want a quick “what hits this document URL?” view.

**How to**

1. Open DevTools on a tab → find the **Detour** panel.
2. Read the headline and list for the inspected page URL.
3. Use **Open rules…** for the full editor. For a script or fetch URL, use **API Tester** instead.

**Tips / limits**  
Page-load focused only. Theme toggle matches the rest of the UI.

</details>

## Settings and permissions

<details>
<summary><strong>Settings, theme, badge, and permissions</strong></summary>

**What it does**  
Controls theme, badge, autosave, and optional powerful permissions — all local.

| Control | Where | Why |
|---------|--------|-----|
| **Detour enabled** / **Detour on** | Popup / options | Master switch for applying rules |
| **Light theme** | Popup (and theme control on options) | Dark is default |
| **Match count** | Popup | Toolbar badge with per-tab match count |
| **Autosave** | Options header | Writes valid drafts after a short idle |
| **Allow debugger** (Chrome) / response rewriting (Firefox) | Banner on options | Needed for **Replace Body** in place and in-place **Serve Local**; Chrome may show its own debugging banner |
| **Allow User Scripts** (Chrome) / grant user scripts (Firefox) | Banner / extension details | Needed for **Inject JS** inline code |
| **Local Bridge** Port / Token | Bridge drawer | Connect `detour bridge` (loopback only) |

**Permissions (privacy-friendly summary)**

| Permission | Why |
|------------|-----|
| declarativeNetRequest | Redirect, block, modify headers |
| storage / unlimitedStorage | Save rules and prefs on this device |
| scripting / userScripts | Inject CSS/JS and user-written JS |
| host access (`<all_urls>`) | Match whatever host you’re debugging |
| debugger (Chrome) | In-place body replace after you allow it |
| webRequest filter (Firefox) | Same body replace after you allow it |

Full reviewer copy: [docs/distribution/permissions.md](docs/distribution/permissions.md). Privacy: [https://detour.protovoid.com/privacy/](https://detour.protovoid.com/privacy/) ([source](docs/distribution/privacy.md)).

</details>

## Local Bridge (serve files from disk)

<details>
<summary><strong>Local Bridge — setup</strong></summary>

**What it does**  
Optional Node CLI that serves one folder on `127.0.0.1` so **Serve Local** rules can read files from disk. Not a remote server; does not phone home.

**When to use it**  
You already build to a folder (`./dist`) and want production URLs to load those files.

**How to (all OS)**

1. Install Node 24+ and, from this repo, `corepack pnpm install`.
2. Start the bridge:

```sh
corepack pnpm --filter @detour/cli exec detour bridge ./dist
```

3. The process prints `http://127.0.0.1:<port>`, the folder name, and a **token** (new every start).
4. In Detour → Rules → **Bridge not connected** → paste **Port** and **Token** → **Connect**.
5. Create a **Serve Local** rule with **File in the bridge folder** relative to that folder.

<details>
<summary>macOS / Linux</summary>

Same commands in Terminal. Use any folder you can read (not `/`). Example:

```sh
corepack pnpm --filter @detour/cli exec detour bridge ./dist --port 47321
```

</details>

<details>
<summary>Windows</summary>

Same commands in PowerShell or cmd after Node/Corepack are installed. Prefer a project folder path such as `.\dist`, not a drive root.

</details>

**Security notes**

- Binds **`127.0.0.1` only** — not reachable from other machines.
- **Token** required; changes every start. Treat it like a local password for that session.
- Do not pass the filesystem root; the CLI refuses `/`.

More detail: [cli/README.md](cli/README.md).

</details>

## Connect to a database

<details>
<summary><strong>What you need</strong></summary>

**Detour**, plus the free **Detour database helper**, installed once. Browsers can’t talk to databases directly, so a small program on your computer does it — and Detour starts and stops it for you.

</details>

<details>
<summary><strong>Install the helper (one time)</strong></summary>

### Recommended: OS pack (no Node)

Download one pack from [GitHub Releases](https://github.com/proto-void/detour/releases):

| Pack | Machine |
|------|---------|
| `detour-<ver>-windows-x64.zip` | Windows 64-bit |
| `detour-<ver>-macos-arm64.zip` | Mac Apple Silicon |
| `detour-<ver>-macos-x64.zip` | Mac Intel |
| `detour-<ver>-linux-x64.tar.gz` | Linux 64-bit |

1. Unzip the pack. Load **`extension/`** unpacked (Developer mode) — see the pack’s `README.md` or `extension/README-load-unpacked.md`.
2. Double-click **Install Detour Helper** (`.command` / `.cmd` / `install.sh`).
3. Open Detour → **Databases** → **Start**. You should see **Helper: Ready**.

**First-run warnings ($0 unsigned):** on macOS, right-click → **Open** (or `xattr -dr com.apple.quarantine <folder>`); on Windows, SmartScreen → **More info** → **Run anyway**. Details live in `helper/README.md` inside the pack (templates: `cli/pack/templates/`).

Uninstall: double-click **Uninstall Detour Helper**, or run `helper/detour-db-host uninstall`.

Store zips remain **extension-only**; OS packs are for Releases / sideloading.

<details>
<summary>Developers (Node / pnpm)</summary>

From the Detour repo with Node 24+:

```sh
corepack pnpm --filter @detour/cli exec detour db install
```

Optional `--extension-id=<id>` adds an extra Chromium id (stable unpacked ids come from the public manifest `key`). Firefox uses `detour@protovoid.com` unless you pass `--no-firefox`.

```sh
corepack pnpm --filter @detour/cli exec detour db uninstall
corepack pnpm --filter @detour/cli exec detour db doctor
```

</details>

</details>

<details>
<summary><strong>Add your first connection</strong></summary>

1. Open **Databases**.
2. Click **New connection**.
3. Pick a **Target** (Apache Cassandra, Scylla, Astra, Keyspaces, Cosmos, …).
4. Fill **Contact points**, **Local datacenter**, **Username**, and **Password** (or paste a connection URL and click **Fill from URL**).
5. Choose **Environment** (Local / Staging / Production). Production defaults to **Read-only**.
6. Click **Test connection**, then **Save**.

Passwords stay in your OS keychain via the helper. Exports never include them.

</details>

<details>
<summary><strong>Apache Cassandra / DataStax Enterprise</strong></summary>

**What you need**  
Contact points (hostnames), port (default **9042**), local datacenter name (`nodetool status` shows DC names), username/password if auth is on, optional TLS.

**Steps in Detour**  
**Target** → `apache` or `dse`. **Contact points**, **Port**, **Local datacenter**, **Username**, **Password**. Enable **TLS** if your cluster requires it.

**Example URL**  
`cassandra://cassandra:cassandra@127.0.0.1:9042/my_keyspace?localDc=datacenter1`

**Quick try (Docker, no account)**  
`docker run --rm -p 9042:9042 cassandra:4`

</details>

<details>
<summary><strong>ScyllaDB</strong></summary>

Same CQL protocol as Cassandra. **Target** → `scylla`. Default port **9042**.

**Example URL**  
`scylla://127.0.0.1:9042/ks?localDc=datacenter1`

**Quick try**  
`docker run --rm -p 9042:9042 scylladb/scylla`

</details>

<details>
<summary><strong>DataStax Astra</strong></summary>

**What you need from your Astra console**  
Secure connect bundle zip, and an application token you already created.

**Steps in Detour**  
**Target** → `astra`. Set **Secure connect bundle path** to the zip on disk. Put the token in **Password** (stored in the keychain). Optional **Keyspace**.

Detour never creates an Astra account.

</details>

<details>
<summary><strong>AWS Keyspaces</strong></summary>

**What you need**  
Region endpoint (e.g. `cassandra.us-east-1.amazonaws.com`), port **9142**, local DC often matching the region, service-specific credentials **or** SigV4 (IAM). TLS is required; Detour bundles Amazon Root CA 1.

**Steps in Detour**  
**Target** → `keyspaces`. **Auth** → Service-specific password or SigV4 (+ **Region**).

**Example URL**  
`keyspaces://USER:PASS@cassandra.us-east-1.amazonaws.com:9142/?region=us-east-1`

Live connect is on your AWS account; unit tests cover driver options only (“configuration-tested”).

</details>

<details>
<summary><strong>Azure Cosmos DB for Apache Cassandra</strong></summary>

**What you need from Azure**  
Host from the Connection String blade, port **10350**, username (account name), primary password (account key). TLS on.

**Steps in Detour**  
**Target** → `cosmos`. Fill host, port 10350, username, password.

**Example URL**  
`cosmos://myaccount:ACCOUNT_KEY@myaccount.cassandra.cosmos.azure.com:10350/`

</details>

<details>
<summary><strong>Saving queries, stopping the helper, privacy</strong></summary>

- Save CQL in **Collections** (folders). **Export** never includes passwords.
- The helper stops when you close the tab, click **Stop helper**, or sit idle (default 15 minutes).
- Secrets stay in your OS keychain and never leave your computer through Detour.

</details>

<details>
<summary><strong>PostgreSQL</strong> (also CockroachDB, YugabyteDB, TimescaleDB, Neon, Supabase, Redshift)</summary>

**What you need**  
Host, port (**5432**), database, user, password. Optional SSL. Optional SSH bastion fields.

**Steps in Detour**  
**Engine** → PostgreSQL. Fill **Host**, **Port**, **Database / keyspace**, **Username**, **Password**. Enable **TLS** if required. Optional **SSH tunnel**.

**Example URL**  
`postgres://detour:detour@127.0.0.1:5432/detour`

**Quick try**  
`docker compose -f docker-compose.db.yml up -d postgres`

</details>

<details>
<summary><strong>MySQL / MariaDB / TiDB</strong></summary>

**Engine** → MySQL or MariaDB. Default port **3306**.

**Example URL**  
`mysql://detour:detour@127.0.0.1:3306/detour`

**Quick try**  
`docker compose -f docker-compose.db.yml up -d mysql`

</details>

<details>
<summary><strong>SQL Server / Azure SQL</strong></summary>

**Engine** → SQL Server. Port **1433**. TLS often on for Azure SQL.

**Example URL**  
`mssql://sa:Your_password@127.0.0.1:1433/master`

</details>

<details>
<summary><strong>SQLite</strong></summary>

**Engine** → SQLite. Set **Database file** to a path on disk (or use `:memory:` for a throwaway DB via the helper).

</details>

<details>
<summary><strong>Oracle</strong></summary>

**Engine** → Oracle (thin mode, no Instant Client). Host, port **1521**, **Service name**, username, password.

</details>

<details>
<summary><strong>MongoDB</strong></summary>

**Engine** → MongoDB. Paste a `mongodb://` or `mongodb+srv://` **URI**, or host/port. Queries are JSON `{ "db","collection","find"|"aggregate" }`.

**Quick try**  
`docker compose -f docker-compose.db.yml up -d mongo`

</details>

<details>
<summary><strong>Redis / Valkey</strong></summary>

**Engine** → Redis / Valkey. Port **6379**. Run CLI-style commands (`PING`, `KEYS *`, `GET key`).

**Quick try**  
`docker compose -f docker-compose.db.yml up -d redis`

</details>

<details>
<summary><strong>ClickHouse</strong></summary>

**Engine** → ClickHouse. HTTP port **8123**. SQL `SELECT` works like other SQL engines.

</details>

<details>
<summary><strong>Elasticsearch / OpenSearch</strong></summary>

**Engine** → Elasticsearch or OpenSearch. Port **9200**. Body is Query DSL JSON.

</details>

<details>
<summary><strong>DynamoDB</strong></summary>

**Engine** → DynamoDB. Set **Region** and optional **Endpoint** for DynamoDB Local (`http://127.0.0.1:8000`). PartiQL `SELECT` or JSON scan/query bodies.

</details>

<details>
<summary><strong>Connection options (SSL / SSH / proxy / advanced)</strong></summary>

New connections default to the name **New Connection**. Pick **Database type** (and **Variant** when it applies). **Basic** holds host, port, user, password storage (Keychain / Ask every time / Don’t store), and database. Collapsed **Advanced** groups cover Authentication, SSL/TLS mode (Disable → Verify Full) with CA/cert/key **file paths** (Browse via the helper), SSH tunnel (password / private key / agent, jump hosts), SOCKS5 or HTTP CONNECT proxy, driver options, and timeouts.

Certificate and key **contents stay on disk** — only paths are stored. Passphrases use the OS keychain (`:sslKeyPass`, `:sshKeyPass`, `:sshPass`, `:proxyPass`, `:walletPass`).

**Driver limits (honest):** PostgreSQL GSSAPI/Kerberos is not supported by `node-postgres` (option disabled in the UI). MySQL/MariaDB Kerberos is not supported by `mysql2`. MongoDB / Cassandra DSE GSSAPI need the optional native `kerberos` module. Oracle Kerberos needs thick mode + Instant Client. SQL Server Entra interactive uses the system browser from the host.

</details>

<details>
<summary><strong>Through an SSH tunnel / bastion</strong></summary>

In **Advanced → SSH tunnel**, enable the tunnel, set bastion host/user/port, and choose Password, Private key (path + optional passphrase), or SSH agent (`SSH_AUTH_SOCK`). Optional **Jump hosts** (`user@host:port`). The helper opens a local forward; database host/port are as seen from the final bastion. Secrets stay in the OS keychain.

</details>

<details>
<summary><strong>Local containers for testing</strong></summary>

```sh
docker compose -f docker-compose.db.yml up -d cassandra postgres mysql redis mongo
DETOUR_DB_E2E=1 corepack pnpm --filter @detour/cli test:db-e2e
# TLS / SOCKS / bastion extras:
node cli/src/db/certs/generate-test-certs.mjs
docker compose -f docker-compose.db.yml --profile tls up -d postgres-tls redis-tls socks bastion
docker compose -f docker-compose.db.yml down
# then quit Docker Desktop on macOS when finished
```

Profiles exist for `mssql`, `oracle`, `clickhouse`, `opensearch`, `dynamodb`, `scylla`, `ssh`, `tls`.

</details>

<details>
<summary><strong>Troubleshooting — helper / connection</strong></summary>

- **Helper not found** — run **Install Detour Helper** from your OS pack (or `detour db install` for developers), reload the options page, click **Start**.
- **Connection refused / timeout** — check host, port, VPN/firewall, and that Cassandra is listening.
- **SSL/TLS errors** — set SSL mode to **Verify CA** / **Verify Full** and point CA/cert/key paths at readable files; for Keyspaces leave verify on (CA is bundled). Modes that skip verify are insecure.
- **File not found or unreadable** — paths are expanded from `~` on the helper; use Browse or an absolute path the helper can read.
- **Authentication failed** — re-enter password (keychain), check Astra token or Keyspaces SigV4 region.
- **Kerberos / Entra** — see driver limits above; cloud IAM is configuration-tested only.

</details>

## Privacy

- No Detour backend and no account.
- No telemetry of rule bodies or file contents.
- Rules, match log, and prefs stay in your browser (session log clears when the session ends).

See [https://detour.protovoid.com/privacy/](https://detour.protovoid.com/privacy/) ([source](docs/distribution/privacy.md)).

## Troubleshooting / FAQ

<details>
<summary>A rule doesn’t fire</summary>

1. Confirm **Detour enabled** is on and the group/rule switches are on.
2. Check **Applied** vs **Refused** / **Off** on the popup or Rules strip.
3. Use the rule’s **Test** tab or **API Tester** → **Which rules apply**.
4. Confirm **Pattern** and **Applies to** / request types match the real request.
5. For inject/mock/body, reload the page after save. Check permission banners (user scripts / debugger).

</details>

<details>
<summary>A redirect is refused (loop, non-ASCII)</summary>

- **Redirect loop** — destination still matches the same rule; narrow the pattern or change the target.
- **Non-ASCII** — patterns must be printable ASCII; encode or simplify the URL.
- Open the refused row / apply report message on **Rules** for the exact reason.

</details>

<details>
<summary>Firefox differences</summary>

- No Chromium-style DNR match feedback → toolbar **Match count** / some log rows differ.
- Body replace uses response filtering after you allow it (not Chrome’s debugger).
- Temporary add-on installs go away when Firefox restarts unless you use a permanent AMO/release install.
- Inline JS needs the Firefox user-scripts grant.

</details>

<details>
<summary>The extension icon is missing</summary>

1. Open the browser’s extensions puzzle menu and **pin** Detour.
2. Confirm the extension is enabled on `chrome://extensions` / `about:addons`.
3. After loading unpacked, reload the extension if the icon disappeared after a rebuild.

</details>

<details>
<summary>Resetting the extension</summary>

1. Turn **Detour enabled** off to stop applying rules without deleting them.
2. To wipe data: remove the extension or clear its extension storage via the browser’s extension details (this deletes rules — export first if you care).
3. Re-import from an **Export** file if you saved one.

</details>

<details>
<summary><strong>For contributors</strong></summary>

Agents: start at **[AI/README.md](AI/README.md)** (also linked from [AGENTS.md](AGENTS.md)).

| Path | Purpose |
|------|---------|
| [AI/PRODUCT.md](AI/PRODUCT.md) | Locked product strategy |
| [AI/PROGRESS.md](AI/PROGRESS.md) | What’s done / next |
| [AI/specs/](AI/specs/) | Spec-driven modules (Draft → Approved) |
| [AI/intelligence/](AI/intelligence/) | Living knowledge base |
| [AI/plans/](AI/plans/) | Implementation plans |
| [.cursor/rules/](.cursor/rules/) | Thin Cursor adapters |

**Stack:** WXT + TypeScript + Svelte 5 + CodeMirror 6 + valibot. Local Bridge is the optional Node CLI in [`cli/`](cli/).

```sh
corepack pnpm install
corepack pnpm --filter @detour/cli test
corepack pnpm --filter @detour/extension test
corepack pnpm --filter @detour/extension typecheck
corepack pnpm --filter @detour/extension build
corepack pnpm --filter @detour/extension build:firefox
cd extension && CHROME=$(node scripts/install-chrome.mjs) corepack pnpm e2e:chrome
```

**Dual-zip DoD** (when `extension/` changes): both flavors unless Hamza asks for one only:

```sh
corepack pnpm --filter @detour/extension zip
# → extension/.output/detour/detour-<version>-chrome.zip
corepack pnpm --filter @detour/extension zip:rogers
# → extension/.output/rogers/rogers-<version>-chrome.zip
```

Brand flavors use build-time `DETOUR_BRAND`. Rogers brand files under `extension/brands/rogers/` are gitignored; public tree stays Detour-only. See ADR-026.

Distribution, CI, and store listing: [docs/distribution/README.md](docs/distribution/README.md). Bridge CLI: [cli/README.md](cli/README.md).

</details>

## License

[MIT](LICENSE)
