import type { DnrHeaderInfo, DnrRule } from '../engine-core/dnr';

/** Headers browsers refuse on fetch(); set via short-lived DNR session rules instead. */
export const FORBIDDEN_FETCH_HEADERS = new Set(['cookie', 'origin', 'referer', 'user-agent', 'host']);

export interface DnrSessionApi {
  getSessionRules(): Promise<DnrRule[]>;
  updateSessionRules(options: { removeRuleIds?: number[]; addRules?: DnrRule[] }): Promise<void>;
}

export function splitForbiddenHeaders(headers: Record<string, string>): {
  allowed: Record<string, string>;
  forbidden: Record<string, string>;
} {
  const allowed: Record<string, string> = {};
  const forbidden: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (FORBIDDEN_FETCH_HEADERS.has(key.toLowerCase())) forbidden[key] = value;
    else allowed[key] = value;
  }
  return { allowed, forbidden };
}

/** Prefer urlFilter for the exact request URL (no regex). */
export function buildSessionHeaderRule(id: number, url: string, forbidden: Record<string, string>): DnrRule {
  const requestHeaders: DnrHeaderInfo[] = Object.entries(forbidden).map(([header, value]) => ({
    header,
    operation: 'set',
    value,
  }));
  return {
    id,
    priority: 1,
    action: { type: 'modifyHeaders', requestHeaders },
    condition: {
      urlFilter: `|${url}`,
      resourceTypes: ['xmlhttprequest', 'other'],
    },
  };
}

export async function withForbiddenHeaderRule<T>(
  dnr: DnrSessionApi,
  url: string,
  forbidden: Record<string, string>,
  run: () => Promise<T>,
): Promise<T> {
  if (Object.keys(forbidden).length === 0) return run();

  const existing = await dnr.getSessionRules();
  const used = new Set(existing.map((r) => r.id));
  let id = 900_000;
  while (used.has(id)) id++;
  const rule = buildSessionHeaderRule(id, url, forbidden);
  await dnr.updateSessionRules({ addRules: [rule] });
  try {
    return await run();
  } finally {
    try {
      await dnr.updateSessionRules({ removeRuleIds: [id] });
    } catch {
      // cleanup best-effort
    }
  }
}
