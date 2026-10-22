# Permission justification

For Chrome Web Store, Edge, and AMO reviewers. Detour redirects and overrides requests locally in the browser. Nothing here is sent to a Detour server. There is no account.

**Paste-ready CWS packet (all fields + remote code):** [CWS-SUBMIT.md](CWS-SUBMIT.md).  
**Last verified:** 2026-10-15 (aligned with Chrome manifest install + optional permissions).

**Single-purpose (paste):** Help developers redirect and override requests and page resources while they debug — rules stay on the device.

| Permission | Install vs optional | Why it is in the package | When it runs |
|------------|---------------------|--------------------------|--------------|
| `declarativeNetRequest` | Install | Redirect, modify headers, and block matching requests | While Detour is on and a rule compiled to DNR is enabled |
| `declarativeNetRequestFeedback` | Install (Chromium) | Toolbar badge and the on-device match log. No install warning. Firefox has no equivalent API | While the badge or log is in use. The log stores a rule label and URL, not the rule body |
| `storage` | Install | Save the rule workspace, on/off switch, theme, and apply report on this device | On edit and on browser start |
| `unlimitedStorage` | Install | Workspaces can hold inline scripts, CSS, and mock bodies the user typed | Only for that local data |
| `scripting` | Install | Inject the packaged page bridge and CSS the user wrote | When an inject or mock rule is enabled |
| `alarms` | Install | Schedule API Tester collection runs while the browser is open | Only when the user enables a schedule in API Tester |
| `userScripts` | Install (Chrome); optional (Firefox) | Run **user-written** inline JS. Chrome requires the user to allow user scripts | Only after that grant, and only while an inline JS rule is enabled |
| `host_permissions: <all_urls>` | Install | Redirect and header changes need access to the request URL and the page that started it. Injection needs the page | While a matching rule is enabled. Not used to upload browsing history |
| `debugger` (Chrome, install time) | Install | Replace a response body in place. MV3 has no other API for that. The extension does not read the original body | Only after the user clicks **Allow debugger**, and only on http(s) tabs that match a body rule. Install does not attach |
| `nativeMessaging` | Optional | Connect to a local Databases helper host on the user’s machine | Only after grant on first Databases use; no Detour cloud |
| `notifications` | Optional | OS notify when a scheduled API Tester run fails (notify-on-fail) | Only after grant |
| `cookies` | Optional | API Tester cookie jar (view/edit for domains under test) | Only after grant on first cookie-jar use |
| `identity` | Optional | API Tester OAuth auth-code + PKCE via `launchWebAuthFlow` (Chrome) | Only after grant when the user starts that flow |
| `webRequest`, `webRequestBlocking`, `webRequestFilterResponse` (Firefox, optional) | Optional | Same body override, via `filterResponseData` | Only after the user allows response rewriting |

**Remote code (CWS Privacy practices):** Detour does not load or execute code from Detour-operated servers. Packaged page-bridge and mock-runtime scripts ship inside the extension. Inline inject JS uses `userScripts` only after “Allow user scripts,” for code the user authored. Optionally, a user may configure an inject JS/CSS rule with a URL they typed; that URL is fetched from the origin they specified (often localhost), not from Detour. No userscript marketplace.

Turning Detour off clears the active rules and does not register page scripts. Body override stays off until the user opts in (`bodyEngineConsent`). Optional Chromium permissions remain unused until granted.

`<all_urls>` is required because a developer tool has to match whatever host they are debugging. Rules are not limited to one site in advance.

The `debugger` permission is the sensitive one. Chrome shows its own debugging indicator while it is attached. Detour uses it to fulfill a response with the user’s replacement text. It is not used for screenshots, cookies export, or remote control.
