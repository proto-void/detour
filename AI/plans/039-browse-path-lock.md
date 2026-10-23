# Plan 039 — Browse lock + required asterisks + Connection hug height

**Status:** Done (2026-10-23)

## Goal

Path-specific Browse lock (Opening… / Cancel… on the active field only), soft-required asterisks on Connection basics, and Connection card height that hugs the footer when switching Main ↔ SSL ↔ SSH (no dead space below `modal-actions`).

## Checklist

- [x] Replace `browsing` with `activeBrowsingPath`; keep `browseGeneration` + 90s timeout; same-field Cancel via `resetBrowsingLock`
- [x] Per-field Opening…/Cancel…; disable other Browse/Clear + Test/Save/Save & connect while locked; modal Cancel stays enabled; inputs stay editable
- [x] Pass certificate / zip filters on SSL + secure-connect-bundle `pickFile` RPC (no slash normalization)
- [x] `FieldDescriptor.required` + asterisks + soft-block Test/Save/Connect when visible required empty
- [x] Connection CSS: strip conflicting bare `.conn-form` max-height/overflow; card `height: fit-content` hug
- [x] KB: gotcha (Cancel only on active Browse; fit-content hug); PROGRESS; plans README
- [x] Detour zip + focused `fields.test.ts`

## Out of scope

- File System Access API / storing TLS file bytes
- Speeding the OS dialog further (plan 031)
- Changing path storage or TLS connect semantics
- Marking SSL/SSH fields required based on mode

## Verification

- Browse: one dialog; sibling Browse disabled; footer disabled while picking; Cancel on active field; timeout message; raw Windows paths; filters where OS supports them
- Asterisks: Cassandra Main shows Name/Host/Port starred; empty Host + Test soft-blocks; User/keyspace unstarred
- Height: Main ↔ SSL ↔ SSH — no gap below footer; overflow only in `.conn-form-body` when over max-height
- `corepack pnpm --filter @detour/extension zip`
