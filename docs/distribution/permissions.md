# Permission justification

For Chrome Web Store, Edge, and AMO reviewers. Detour redirects and overrides requests locally in the browser. Nothing here is sent to a Detour server. There is no account.

**Single-purpose (paste):** Help developers redirect and override requests and page resources while they debug — rules stay on the device.

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
| `webRequest`, `webRequestBlocking`, `webRequestFilterResponse` (Firefox, optional) | Same body override, via `filterResponseData` | Only after the user allows response rewriting |

Turning Detour off clears the active rules and does not register page scripts. Body override stays off until the user opts in (`bodyEngineConsent`).

`<all_urls>` is required because a developer tool has to match whatever host they are debugging. Rules are not limited to one site in advance.

The `debugger` permission is the sensitive one. Chrome shows its own debugging indicator while it is attached. Detour uses it to fulfill a response with the user’s replacement text. It is not used for screenshots, cookies export, or remote control.
