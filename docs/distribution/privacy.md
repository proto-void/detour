# Privacy policy

**Detour** (“Point production at your code.”)  
**Effective:** 2026-10-23  
**Product site:** [https://detour.protovoid.com](https://detour.protovoid.com)  
**Canonical policy URL:** [https://detour.protovoid.com/privacy/](https://detour.protovoid.com/privacy/)

Detour is a browser extension that runs on your device. It is free, MIT-licensed software. The project does not operate an account system or a server for the extension.

## Data that stays on your device

- Rules you write or import (including redirects, headers, injected code, mocks, and replacement bodies)
- Whether Detour is on, theme, and badge preference
- The apply report (which rules were installed or refused)
- A session match log: up to 50 rows with a rule label and URL. It is cleared when the browser session ends. It does not include rule bodies
- API Tester collections, request history, and environment variables (including any secrets you store there locally)
- Databases connection metadata and query collections. Connection secrets may be stored in the OS keychain via the optional local Detour Helper — not on a Detour server

Firefox’s manifest declares data collection as **none**.

## What we do not do

- No account, sign-in, or cloud sync
- No telemetry. The extension does not send rule bodies, file contents, the match log, API Tester history, or Databases credentials anywhere
- No sale of personal information
- The `debugger` permission (Chrome) and response filtering (Firefox) change responses locally after you allow them. They are not used to transmit page contents to us

## Permissions

Chrome, Edge, and Firefox will show the extension’s permissions at install. What each one is for is listed in [permissions.md](permissions.md).

## Contact

Questions about this policy or Detour go to the maintainers via the [product site](https://detour.protovoid.com), the public repository [github.com/proto-void/detour](https://github.com/proto-void/detour), or email **detour@protovoid.com**. There is no account system and no Detour cloud service for the extension.
