import type { Candidate, Refusal } from './compile';
import type { DnrApi } from './dnr';

export interface DnrLimits {
  maxRules: number;
  maxUnsafeRules: number;
  maxRegexRules: number;
}

/**
 * Reads quotas from the API constants. Fallbacks are the documented minimums: 5000 dynamic rules
 * (Firefox, and Chrome's unsafe cap) and 1000 regex rules.
 */
export function readLimits(dnr: DnrApi): DnrLimits {
  const maxRules = dnr.MAX_NUMBER_OF_DYNAMIC_RULES ?? dnr.MAX_NUMBER_OF_DYNAMIC_AND_SESSION_RULES ?? 5000;
  return {
    maxRules,
    maxUnsafeRules: Math.min(dnr.MAX_NUMBER_OF_UNSAFE_DYNAMIC_RULES ?? maxRules, maxRules),
    maxRegexRules: dnr.MAX_NUMBER_OF_REGEX_RULES ?? 1000,
  };
}

/** Keeps candidates in priority order while they fit; later ones are refused, never the whole set. */
export function enforceLimits(candidates: Candidate[], limits: DnrLimits): { kept: Candidate[]; refused: Refusal[] } {
  const kept: Candidate[] = [];
  const refused: Refusal[] = [];
  let unsafe = 0;
  let regex = 0;
  for (const c of candidates) {
    const refuse = (reason: Refusal['reason'], message: string) => refused.push({ groupId: c.groupId, ruleId: c.ruleId, reason, message });
    if (c.regex && regex >= limits.maxRegexRules) {
      refuse('regex-limit', `Browser limit of ${limits.maxRegexRules} regex rules reached; use a simpler glob so this rule can use urlFilter`);
    } else if (kept.length >= limits.maxRules || (c.unsafe && unsafe >= limits.maxUnsafeRules)) {
      refuse('rule-limit', `Browser limit of ${c.unsafe ? limits.maxUnsafeRules : limits.maxRules} ${c.unsafe ? 'redirect/header ' : ''}rules reached`);
    } else {
      kept.push(c);
      if (c.regex) regex++;
      if (c.unsafe) unsafe++;
    }
  }
  return { kept, refused };
}
