# Intelligence — read/write protocol

**Last verified:** 2026-10-07

## Read-first

Before grepping or exploring code for a topic, open the matching file:

| Topic | File |
|-------|------|
| System shape, modules, data flow | [architecture.md](architecture.md) |
| Locked stack, free ops | [tech-baseline.md](tech-baseline.md) |
| Browser support matrix | [browser-matrix.md](browser-matrix.md) |
| Naming, style, TS/Svelte norms | [conventions.md](conventions.md) |
| Domain terms | [domain-glossary.md](domain-glossary.md) |
| Known pitfalls | [gotchas.md](gotchas.md) |

Product strategy stays in `AI/PRODUCT.md`. Decisions in `AI/DECISIONS.md`. Specs in `AI/specs/`. Research in `AI/research/`.

## Write-back

When you learn a durable fact:

1. Update the matching file (or `DECISIONS.md` for cross-cutting choices).
2. Set **Last verified** to today's date.
3. Prefer short bullets over essays.
4. **Never** write secrets, tokens, keys, or PII samples.

Use project skill `write-back-kb` for the full checklist.
