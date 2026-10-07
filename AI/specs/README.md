# Specs (Spec-Driven Development)

**Last verified:** 2026-10-07

Specs live **only** here. Status is **Draft** until a human Approves. See project skill `spec-workflow`.

## Build order

| # | Spec | Status |
|---|------|--------|
| 1 | [rule-model](rule-model.md) | **Approved** (Hamza, 2026-10-06) |
| 2 | [engine-core](engine-core.md) | **Approved** (Hamza, 2026-10-06) |
| 3 | [page-inject](page-inject.md) | **Approved** (Hamza, 2026-10-06) |
| 4 | [api-mock](api-mock.md) | **Approved** (Hamza, 2026-10-06) |
| 5 | [engine-deep](engine-deep.md) | **Approved** — body override (Hamza, 2026-10-06). Amended 2026-10-07: bridge bytes, SRI hashes, page-world integrity, markup integrity, script-running markup, inert markup, setHTMLUnsafe with scripts off, `Document.parseHTMLUnsafe`, then `setAttributeNode` |
| 6 | [local-bridge](local-bridge.md) | **Approved** (Hamza, 2026-10-07) — localhost HTTP, plus in-place body when rewriting is allowed |
| 7 | [workspace-ui](workspace-ui.md) | **Approved — slices 1–4** (popup, editor, rule tester, remainder) (Hamza, 2026-10-06) |
| 8 | [observability](observability.md) | **Approved** — badge + match log (Hamza, 2026-10-06). Local Bridge still Draft |
| 9 | [distribution](distribution.md) | **Approved — CI + packaging** (Hamza, 2026-10-07). Local Bridge and store-API upload stay out |

Capability overview: [000-capability-map.md](000-capability-map.md).

## Required sections

Objective · User stories · Acceptance criteria · Browser support table · Limits and gotchas · Out of scope · Verification

## Gate

| Status | Meaning |
|--------|---------|
| Draft | Human review; **no** implementation plan/code authority |
| Approved | May plan and implement |
| Superseded | Replaced by a newer spec |
