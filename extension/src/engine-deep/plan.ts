import type { Refusal } from '../engine-core/compile';
import { compileMatcher } from '../rule-model/match';
import type { Match, ResourceType, Workspace } from '../rule-model/schema';

const PRINTABLE_ASCII = /^[\x20-\x7e]*$/;

/** One armed body rule, in workspace order (first match wins). */
export interface BodyRule {
  groupId: string;
  ruleId: string;
  match: Match;
  caseSensitive: boolean;
  /** Omitted = every type except main_frame, same as DNR. */
  resourceTypes?: ResourceType[];
  pageDomains?: string[];
  body: string;
  contentType?: string;
}

/** CDP Fetch.RequestPattern. `urlPattern` uses `*` / `?` wildcards. */
export interface FetchPattern {
  urlPattern: string;
  requestStage: 'Response';
}

export interface BodyPlan {
  rules: BodyRule[];
  /** Empty when nothing is armed. A single `*` when any rule cannot be narrowed. */
  patterns: FetchPattern[];
  /** True when Fetch must pause every response and the handler filters. */
  broad: boolean;
  refused: Refusal[];
}

/** Escape CDP wildcards that a Detour glob treats as literal. `*` stays a wildcard. */
export function globToFetchUrlPattern(pattern: string): string {
  return pattern.replace(/[\\?]/g, (ch) => `\\${ch}`);
}

const isBroadGlob = (pattern: string) => /^\*+$/.test(pattern);

/**
 * Enabled overrideBody rules, in workspace order. Patterns are hints for Chrome's
 * Fetch.enable; the handler still matches with the rule's own glob or regex.
 * Pass an empty workspace when Detour is off.
 */
export function planBody(workspace: Workspace): BodyPlan {
  const rules: BodyRule[] = [];
  const refused: Refusal[] = [];
  const narrowed: string[] = [];
  let broad = false;

  for (const group of workspace.groups) {
    if (!group.enabled) continue;
    for (const rule of group.rules) {
      if (!rule.enabled || rule.action.type !== 'overrideBody') continue;
      const ids = { groupId: group.id, ruleId: rule.id };
      if (!PRINTABLE_ASCII.test(rule.match.pattern)) {
        refused.push({
          ...ids,
          reason: 'non-ascii-pattern',
          message: 'Patterns must be ASCII: percent-encode paths and use punycode for hostnames',
        });
        continue;
      }
      try {
        compileMatcher(rule.match, rule.caseSensitive ?? false);
      } catch (e) {
        refused.push({ ...ids, reason: 'unsupported-regex', message: e instanceof Error ? e.message : String(e) });
        continue;
      }
      const { action } = rule;
      rules.push({
        ...ids,
        match: rule.match,
        caseSensitive: rule.caseSensitive ?? false,
        ...(rule.resourceTypes && { resourceTypes: rule.resourceTypes }),
        ...(group.pageDomains && { pageDomains: group.pageDomains }),
        body: action.body,
        ...(action.contentType && { contentType: action.contentType }),
      });
      if (rule.match.kind === 'regex' || isBroadGlob(rule.match.pattern)) broad = true;
      else narrowed.push(globToFetchUrlPattern(rule.match.pattern));
    }
  }

  const patterns: FetchPattern[] = rules.length === 0 ? [] : broad ? [{ urlPattern: '*', requestStage: 'Response' }] : [...new Set(narrowed)].map((urlPattern) => ({ urlPattern, requestStage: 'Response' as const }));
  return { rules, patterns, broad: rules.length > 0 && broad, refused };
}
