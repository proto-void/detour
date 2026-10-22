---
name: write-back-kb
description: Writes durable facts back into AI/ intelligence files. Use WHEN you discover architecture, API, glossary, convention, gotcha, or ops facts that should persist. Use AFTER implementing or investigating when the KB would otherwise go stale.
---

# Write-back knowledge base

## Steps

1. Choose the file:
   - Architecture → `AI/intelligence/architecture.md`
   - Stack / free ops → `AI/intelligence/tech-baseline.md`
   - Browser support → `AI/intelligence/browser-matrix.md`
   - Conventions → `AI/intelligence/conventions.md`
   - Terms → `AI/intelligence/domain-glossary.md`
   - Pitfalls → `AI/intelligence/gotchas.md`
   - Upstream / competitor research → `AI/research/*`
   - Cross-cutting choice → `AI/DECISIONS.md`
   - Status → `AI/PROGRESS.md`
2. Add or revise short bullets; prefer facts over speculation.
3. Set **Last verified** to today's date (user timezone / session date).
4. Never write secrets, tokens, keys, credentials, or real PII.
5. Do not invent product strategy that contradicts `AI/PRODUCT.md` — propose a decision entry if strategy must change.

## Done when

The matching KB file reflects the new fact and Last verified is bumped.
