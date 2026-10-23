# @detour/cli

Optional companions for [Detour](../README.md):

- **Local Bridge** — serve a folder on `127.0.0.1` for **Serve Local** rules ([root README](../README.md#local-bridge-serve-files-from-disk)). Loopback HTTP; not native messaging.
- **Databases host** — native messaging helper `com.detour.db` for the **Databases** tab ([Connect to a database](../README.md#connect-to-a-database)).

Neither is a remote server. Neither phones home.

## Local Bridge

```sh
corepack pnpm --filter @detour/cli exec node --experimental-strip-types src/cli.ts bridge ./dist
# or from repo root:
node --experimental-strip-types cli/src/cli.ts bridge ./dist --port 47321
```

The process prints `http://127.0.0.1:<port>`, the folder’s name, and a **token**. In Detour open **Rules** → **Bridge not connected**, paste **Port** and **Token**, then **Connect**.

There is no `--host` flag. The process binds `127.0.0.1` only.

## Databases host

```sh
corepack pnpm --filter @detour/cli exec node --experimental-strip-types src/cli.ts db install --extension-id=<chrome-extension-id>
corepack pnpm --filter @detour/cli exec node --experimental-strip-types src/cli.ts db uninstall
```

(`pnpm exec detour` is not linked: no workspace package depends on `@detour/cli`. Use `node … src/cli.ts` or `node bin/detour.js` instead.)

Then open **Databases** → **Start**. Day to day, Detour starts and stops the helper; you do not leave a terminal open.

User guide (all engines): [Connect to a database](../README.md#connect-to-a-database).

Local containers:

```sh
docker compose -f docker-compose.db.yml up -d cassandra postgres mysql redis mongo
DETOUR_DB_E2E=1 corepack pnpm --filter @detour/cli test:db-e2e
```

SEA spike: `corepack pnpm --filter @detour/cli sea:build` → `cli/.sea/`.

## Tests

```sh
corepack pnpm --filter @detour/cli test
corepack pnpm --filter @detour/cli typecheck
```
