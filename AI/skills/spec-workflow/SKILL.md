---
name: spec-workflow
description: Spec-driven development gates for Detour. Use WHEN authoring, revising, or implementing from specs. Use BEFORE writing plans or code for a module. Enforces Draft → Approved before plan/implementation; specs live only under AI/specs/.
---

# Spec workflow

## Rules

- Specs live **only** under `AI/specs/`.
- Filename: `short-kebab-name.md` (capability map is `000-capability-map.md`).
- Status values: **Draft** | **Approved** | **Superseded**.
- **Gate:** A module may receive an implementation plan or code only after its spec is **Approved** by a human.
- Draft specs are for human review — agents may revise Draft text when asked, but must not treat Draft as build authority.
- Do not create `extension/` or `cli/` trees from Draft specs alone.

## Required sections (every module spec)

1. Objective
2. User stories
3. Acceptance criteria
4. Browser support table
5. Limits and gotchas
6. Out of scope
7. Verification

Also include: Status, Last updated, and links to related specs / research.

## Create / revise

1. Update `AI/specs/README.md` index and `000-capability-map.md` if modules change.
2. Keep Status **Draft** until the human explicitly Approves.
3. On Approve: set Status to Approved, bump date, then create/update a plan under `AI/plans/` via `plan-workflow`.

## Done when

Spec has all required sections, index is current, and Status matches reality (Draft until human approval).
