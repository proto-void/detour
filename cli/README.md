# @detour/cli

Optional Local Bridge for [Detour](../README.md). It serves one folder on `127.0.0.1` so a **Serve local file** rule can redirect a production URL at a file on disk. It is not a remote server and it does not phone home.

## Run

From the repo root, after `corepack pnpm install` (Node 24):

```sh
corepack pnpm --filter @detour/cli exec detour bridge ./dist
```

Or, without the package bin:

```sh
node --experimental-strip-types cli/src/cli.ts bridge ./dist
node --experimental-strip-types cli/src/cli.ts bridge ./dist --port 47321
```

The process prints `http://127.0.0.1:<port>`, the folder’s name, and a token. On the Detour rules page, paste that token and connect. The token changes every start.

There is no `--host` flag. The process binds `127.0.0.1` only. Do not pass `/` — the filesystem root is refused.

## Tests

```sh
corepack pnpm --filter @detour/cli test
corepack pnpm --filter @detour/cli typecheck
```
