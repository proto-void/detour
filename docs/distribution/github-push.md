# Push Detour to GitHub (Protovoid org)

Use your **Protovoid** organization account (not `HamzaKhan-Rogers`). Create empty public repos first if they do not exist: `proto-void/detour` and `proto-void/detour-web`.

## Extension → `proto-void/detour`

From the local checkout (folder may still be named `Resource Override`):

```sh
cd "/Users/hamzakhan/Resource Override"
git remote remove origin 2>/dev/null || true
git remote add origin git@github.com:proto-void/detour.git
# Review and commit your launch changes first, then:
git push -u origin main
```

Optional first release after CI is green:

```sh
git tag v0.1.0
git push origin v0.1.0
```

Chrome zip for manual CWS upload (already built locally):

`extension/.output/detour/detour-0.1.0-chrome.zip`

Privacy / homepage for the store listing:

- https://detour.protovoid.com/privacy/
- https://detour.protovoid.com

## Product site → `proto-void/detour-web`

```sh
cd "/Users/hamzakhan/Project/detour-web"
git remote remove origin 2>/dev/null || true
git remote add origin git@github.com:proto-void/detour-web.git
git push -u origin main
```

Or create + push in one step:

```sh
cd "/Users/hamzakhan/Project/detour-web"
gh repo create proto-void/detour-web --public --source=. --remote=origin --push
```

## Deploy site (after `wrangler login`)

```sh
cd "/Users/hamzakhan/Project/detour-web"
npm run deploy
```

See `~/Project/detour-web/docs/DEPLOY.md` for DNS notes.
