# Agent entrypoint

Before any non-trivial work:

1. Read **[AI/README.md](AI/README.md)** (master router).
2. Read **[AI/PRODUCT.md](AI/PRODUCT.md)** and **[AI/PROGRESS.md](AI/PROGRESS.md)**.
3. Open matching files under **[AI/intelligence/](AI/intelligence/)** before grepping the codebase.
4. For engineering process, follow **[.cursor/rules/agent-skills.mdc](.cursor/rules/agent-skills.mdc)** — pick 1–3 skills; do not load all vendor skills.
5. Specs are Draft until human approval — use `AI/skills/spec-workflow`. Plans live only under `AI/plans/`. Write durable facts back via `AI/skills/write-back-kb`.

Product facts in `AI/` win over vendor skill defaults. No secrets in the knowledge base. No `extension/` or `cli/` code until specs are Approved.

## Extension delivery

- **Dual-zip DoD (default):** every extension delivery that changes `extension/` ends with **both** flavors unless Hamza explicitly asks for Detour-only or Rogers-only:
  1. Detour: `corepack pnpm --filter @detour/extension zip` → `extension/.output/detour/detour-<version>-chrome.zip`
  2. Rogers: `corepack pnpm --filter @detour/extension zip:rogers` → `extension/.output/rogers/rogers-<version>-chrome.zip`
- Report **both** zip paths in the delivery summary. Single-flavor is only when explicitly requested.
- Rogers brand files live under `extension/brands/rogers/` and are **gitignored** (public MIT tree stays Detour-only). Display name is **Detour**; Rogers is theme/tokens/icons only. See ADR-026.
- Subagent prompts that change `extension/` must include this dual-zip DoD.
