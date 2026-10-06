import type { Workspace } from '../rule-model/schema';
import type { StorageAreaLike } from '../rule-model/storage';

/** `storage.local`. Missing means the badge is on. */
export const SHOW_BADGE_KEY = 'showBadge';
/** `storage.session`. Cleared with the browser session. Never synced. */
export const MATCH_LOG_KEY = 'matchLog';
export const MAX_MATCHES = 50;
export const DYNAMIC_RULESET_ID = '_dynamic';

const MAX_URL = 2000;
const MAX_LABEL = 160;

export type MatchSource = 'dnr' | 'page' | 'mock' | 'body';

/** One observed match. `label` is a group name and match pattern, never an action body. */
export interface MatchEntry {
  at: string;
  atMs: number;
  key: string;
  ruleId: string;
  groupId: string;
  label: string;
  url: string;
  tabId: number;
  source: MatchSource;
}

export interface ObservedMatch {
  groupId: string;
  ruleId: string;
  url: string;
  tabId: number;
  source: Exclude<MatchSource, 'dnr'> | 'dnr';
}

export function clipUrl(url: string): string {
  return url.length <= MAX_URL ? url : url.slice(0, MAX_URL);
}

export function isLoggableUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** Empty when the badge is off, Detour is off, or nothing has matched. */
export function formatBadge(active: boolean, count: number): string {
  if (!active || count <= 0) return '';
  if (count > 99) return '99+';
  return String(count);
}

/** Poll stand-ins use this prefix. A later debug row for the same match replaces them in the count. */
export const POLL_KEY_PREFIX = 'dnr-poll:';

export function countForTab(log: readonly MatchEntry[], tabId: number, sinceMs = 0): number {
  const rows = log.filter((row) => row.tabId === tabId && row.atMs >= sinceMs);
  const hasRequest = rows.some((row) => row.source === 'dnr' && !row.key.startsWith(POLL_KEY_PREFIX));
  let count = 0;
  for (const row of rows) {
    if (hasRequest && row.key.startsWith(POLL_KEY_PREFIX)) continue;
    count += 1;
  }
  return count;
}

/** Newest first. A repeated key is left as-is so a poll cannot double-count. */
export function appendMatch(log: readonly MatchEntry[], entry: MatchEntry, max = MAX_MATCHES): MatchEntry[] {
  if (log.some((row) => row.key === entry.key)) return log as MatchEntry[];
  return [entry, ...log].slice(0, max);
}

export function sourceLabel(source: MatchSource): string {
  if (source === 'dnr') return 'Network';
  if (source === 'mock') return 'Mock';
  if (source === 'body') return 'Body';
  return 'Page';
}

/** Group name plus the match pattern. Action fields are not read. */
export function labelsFromWorkspace(workspace: Workspace): Map<string, string> {
  const labels = new Map<string, string>();
  for (const group of workspace.groups) {
    for (const rule of group.rules) {
      const text = `${group.name}: ${rule.match.pattern}`;
      labels.set(`${group.id}:${rule.id}`, text.length <= MAX_LABEL ? text : text.slice(0, MAX_LABEL));
    }
  }
  return labels;
}

export function attributeDnr(input: {
  dnrId: number;
  rulesetId: string;
  expectedRuleset: string;
  tabId: number;
  url: string;
  key: string;
  at: Date;
  owners: { dnrId: number; groupId: string; ruleId: string }[];
  labels: ReadonlyMap<string, string>;
}): MatchEntry | undefined {
  if (input.rulesetId !== input.expectedRuleset) return undefined;
  if (input.tabId < 0 || !isLoggableUrl(input.url)) return undefined;
  const owner = input.owners.find((row) => row.dnrId === input.dnrId);
  if (!owner) return undefined;
  return {
    at: input.at.toISOString(),
    atMs: input.at.getTime(),
    key: input.key,
    ruleId: owner.ruleId,
    groupId: owner.groupId,
    label: input.labels.get(`${owner.groupId}:${owner.ruleId}`) ?? owner.ruleId,
    url: clipUrl(input.url),
    tabId: input.tabId,
    source: 'dnr',
  };
}

function isMatchEntry(value: unknown): value is MatchEntry {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<MatchEntry>;
  return (
    typeof row.at === 'string' &&
    typeof row.atMs === 'number' &&
    typeof row.key === 'string' &&
    typeof row.ruleId === 'string' &&
    typeof row.groupId === 'string' &&
    typeof row.label === 'string' &&
    typeof row.url === 'string' &&
    typeof row.tabId === 'number' &&
    (row.source === 'dnr' || row.source === 'page' || row.source === 'mock' || row.source === 'body')
  );
}

export async function loadMatches(area: StorageAreaLike): Promise<MatchEntry[]> {
  const stored = (await area.get(MATCH_LOG_KEY))[MATCH_LOG_KEY];
  return Array.isArray(stored) ? stored.filter(isMatchEntry) : [];
}

export async function clearMatches(area: StorageAreaLike): Promise<void> {
  await area.set({ [MATCH_LOG_KEY]: [] });
}
