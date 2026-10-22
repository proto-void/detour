# Upstream source

| Field | Value |
|-------|-------|
| Repository | https://github.com/addyosmani/agent-skills.git |
| License | MIT (see `LICENSE`) |
| Install date | 2026-10-06 |
| Method | Copied from Fuzio (`Subscription Tracker`) vendor pack, then pruned |
| Kept | `skills/`, `references/`, `agents/`, `LICENSE` |
| Pruned | All `dart-*` and `flutter-*` skill directories (not applicable to Detour) |

Vendor engineering skills live under `skills/`. Project-specific skills are authored in `AI/skills/` and symlinked into `skills/` so Cursor discovers them via `.cursor/skills` → this directory.
