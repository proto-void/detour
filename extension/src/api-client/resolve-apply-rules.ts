import type { ApplyDetourMode } from './model';

/**
 * Dual-scope Apply Detour rules:
 * - Global default lives in api-client settings (`applyDetourRules` boolean, default on).
 * - Per-request override: `inherit` | `on` | `off` (default inherit).
 * Explicit per-request wins; otherwise use global.
 */
export function resolveApplyDetourRules(
  globalDefault: boolean,
  perRequest: ApplyDetourMode | undefined | null,
): boolean {
  if (perRequest === 'on') return true;
  if (perRequest === 'off') return false;
  return globalDefault;
}
