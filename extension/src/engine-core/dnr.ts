import type { ResourceType } from '../rule-model/schema';

/**
 * The slice of `declarativeNetRequest` Detour uses, typed with string literals so pure code and
 * tests don't depend on browser enums. `browser.declarativeNetRequest` satisfies it at runtime.
 * https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest
 */

export interface DnrHeaderInfo {
  header: string;
  operation: 'set' | 'append' | 'remove';
  value?: string;
}

export type DnrAction =
  | { type: 'block' }
  | { type: 'redirect'; redirect: { url: string } | { regexSubstitution: string } }
  | { type: 'modifyHeaders'; requestHeaders?: DnrHeaderInfo[]; responseHeaders?: DnrHeaderInfo[] };

export interface DnrCondition {
  urlFilter?: string;
  regexFilter?: string;
  isUrlFilterCaseSensitive?: boolean;
  resourceTypes?: ResourceType[];
}

export interface DnrRule {
  id: number;
  priority: number;
  action: DnrAction;
  condition: DnrCondition;
}

export interface DnrApi {
  getDynamicRules(): Promise<DnrRule[]>;
  /** Atomic: either every removal and addition applies, or the call rejects and nothing changes. */
  updateDynamicRules(options: { removeRuleIds?: number[]; addRules?: DnrRule[] }): Promise<void>;
  isRegexSupported?(options: { regex: string; isCaseSensitive?: boolean; requireCapturing?: boolean }): Promise<{ isSupported: boolean; reason?: string }>;
  readonly MAX_NUMBER_OF_DYNAMIC_RULES?: number;
  /** Chrome 120+: cap on rules whose action is not block/allow/allowAllRequests/upgradeScheme. */
  readonly MAX_NUMBER_OF_UNSAFE_DYNAMIC_RULES?: number;
  /** Firefox < 128 / Safari: combined dynamic + session cap. */
  readonly MAX_NUMBER_OF_DYNAMIC_AND_SESSION_RULES?: number;
  readonly MAX_NUMBER_OF_REGEX_RULES?: number;
}
