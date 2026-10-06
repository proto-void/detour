# Release notes

CI opens a GitHub Release only when someone pushes a `v*` tag (for example `v0.1.0`). The workflow attaches:

- `detour-<version>-chrome.zip` (Chrome and Edge)
- `detour-<version>-firefox.zip`
- `detour-<version>-sources.zip`

Notes start as GitHub’s generated commit list. Replace or extend them before you send users to the release. Mention:

- What changed for someone using the extension
- Permission or manifest changes, if any
- Browser versions you actually ran (`e2e:chrome`, and Firefox if you checked it)
- That rules still stay on the device

Do not paste rule bodies, tokens, or store credentials into the notes.

The tag should match the version you intend to ship. `extension/package.json` is `0.1.0` until you bump it. Bump the package version in the same commit you tag, so the zip name and the manifest version agree.

Store upload is a separate manual step ([store-listing.md](store-listing.md)). A GitHub Release does not publish to Chrome, Edge, or AMO.
