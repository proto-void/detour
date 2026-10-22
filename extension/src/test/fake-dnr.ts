import type { DnrApi, DnrRule } from '../engine-core/dnr';

export interface FakeDnrOptions {
  maxRules?: number;
  maxUnsafeRules?: number;
  maxRegexRules?: number;
  /** Return an error message to reject a rule the way Chrome does ("Rule with id N …"). */
  rejectRule?: (rule: DnrRule) => string | undefined;
  /** Return `{ isSupported: false }` to emulate RE2 rejections; omit to drop `isRegexSupported`. */
  isRegexSupported?: (regex: string) => { isSupported: boolean; reason?: string };
  /** Expose Chrome 145+'s RuleConditionKeys with topDomains; otherwise topDomains is rejected like older Chrome. */
  topDomains?: boolean;
  /** Enforce this hidden regex cap with an error that names no rule (quota mis-estimate). */
  hiddenRegexCap?: number;
}

/** In-memory declarativeNetRequest with Chrome's atomic update semantics. */
export function createFakeDnr(options: FakeDnrOptions = {}) {
  let rules = new Map<number, DnrRule>();
  const calls: { removeRuleIds: number[]; addRules: DnrRule[] }[] = [];

  const dnr: DnrApi = {
    MAX_NUMBER_OF_DYNAMIC_RULES: options.maxRules ?? 30000,
    MAX_NUMBER_OF_UNSAFE_DYNAMIC_RULES: options.maxUnsafeRules ?? 5000,
    MAX_NUMBER_OF_REGEX_RULES: options.maxRegexRules ?? 1000,
    async getDynamicRules() {
      return [...rules.values()].map((r) => structuredClone(r));
    },
    async updateDynamicRules({ removeRuleIds = [], addRules = [] }) {
      calls.push({ removeRuleIds, addRules });
      const next = new Map(rules);
      for (const id of removeRuleIds) next.delete(id);
      for (const rule of addRules) {
        if (next.has(rule.id)) throw new Error(`Rule with id ${rule.id} does not have a unique ID.`);
        if (rule.condition.topDomains && !options.topDomains) throw new Error(`Rule with id ${rule.id}: Unexpected property "topDomains".`);
        const rejection = options.rejectRule?.(rule);
        if (rejection) throw new Error(`Rule with id ${rule.id} ${rejection}`);
        next.set(rule.id, structuredClone(rule));
      }
      const all = [...next.values()];
      const regexCount = all.filter((r) => r.condition.regexFilter !== undefined).length;
      if (regexCount > (options.hiddenRegexCap ?? Infinity) || regexCount > dnr.MAX_NUMBER_OF_REGEX_RULES!) {
        throw new Error('The number of regular expression rules exceeds the limit.');
      }
      if (all.length > dnr.MAX_NUMBER_OF_DYNAMIC_RULES!) throw new Error('Dynamic rule count exceeded.');
      rules = next;
    },
    ...(options.topDomains && { RuleConditionKeys: { URL_FILTER: 'urlFilter', TOP_DOMAINS: 'topDomains' } }),
    ...(options.isRegexSupported && {
      isRegexSupported: async ({ regex }: { regex: string }) => options.isRegexSupported!(regex),
    }),
  };

  return { dnr, calls, rules: () => [...rules.values()] };
}
