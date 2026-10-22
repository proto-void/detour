---
name: plan-workflow
description: Creates and executes numbered implementation plans under AI/plans/ only. Use WHEN scoping multi-step work, recording a setup plan, or continuing a numbered plan. Use WHEN the user asks for a plan or phased rollout.
---

# Plan workflow

## Rules

- Plans live **only** under `AI/plans/`.
- Filename: `NNN-short-kebab-name.md` (zero-padded).
- Update `AI/plans/README.md` index when adding a plan.
- Update `AI/PROGRESS.md` when plan status changes.
- Do not start implementation plans for a module until its `AI/specs/` file is **Approved** (see `spec-workflow`).

## Create

1. Next number after the highest existing `NNN`.
2. Include: Goal, Status, Checklist, Out of scope, Verification.
3. Keep product facts in `PRODUCT.md` / intelligence — plans link to them, don't fork strategy.

## Execute

1. Open the plan file; work checklist items in order.
2. Prefer small verified increments (`incremental-implementation` if needed).
3. Write durable facts back (`write-back-kb`).
4. Mark items done; set Status to Done when complete.

## Done when

Checklist is accurate, README index is current, and PROGRESS reflects next step.
