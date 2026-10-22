# Agent entrypoint

Before any non-trivial work:

1. Read **[AI/README.md](AI/README.md)** (master router).
2. Read **[AI/PRODUCT.md](AI/PRODUCT.md)** and **[AI/PROGRESS.md](AI/PROGRESS.md)**.
3. Open matching files under **[AI/intelligence/](AI/intelligence/)** before grepping the codebase.
4. For engineering process, follow **[.cursor/rules/agent-skills.mdc](.cursor/rules/agent-skills.mdc)** — pick 1–3 skills; do not load all vendor skills.
5. Specs are Draft until human approval — use `AI/skills/spec-workflow`. Plans live only under `AI/plans/`. Write durable facts back via `AI/skills/write-back-kb`.

Product facts in `AI/` win over vendor skill defaults. No secrets in the knowledge base. No `extension/` or `cli/` code until specs are Approved.

## Extension delivery

- **Detour zip only:** every extension delivery that changes `extension/` ends with:
  - `corepack pnpm --filter @detour/extension zip` → `extension/.output/detour/detour-<version>-chrome.zip`
- Report the Detour zip path in the delivery summary.
- Brand system remains build-time `DETOUR_BRAND` (default `detour`) with committed `brands/detour/` + `_template/`. Partner Rogers product retired (plan 033); do not revive `zip:rogers` or a private `rogers-detour` tree.
- Subagent prompts that change `extension/` must include this Detour-only zip DoD.
