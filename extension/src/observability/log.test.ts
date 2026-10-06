import { describe, expect, it } from 'vitest';
import type { Workspace } from '../rule-model/schema';
import {
  appendMatch,
  attributeDnr,
  countForTab,
  DYNAMIC_RULESET_ID,
  formatBadge,
  labelsFromWorkspace,
  MAX_MATCHES,
  type MatchEntry,
} from './log';

const at = new Date('2026-10-06T12:00:00.000Z');

const entry = (over: Partial<MatchEntry> = {}): MatchEntry => ({
  at: at.toISOString(),
  atMs: at.getTime(),
  key: 'k',
  ruleId: 'a',
  groupId: 'g',
  label: 'CDN: */a.js',
  url: 'https://cdn.example.com/a.js',
  tabId: 1,
  source: 'dnr',
  ...over,
});

const workspace = (): Workspace => ({
  groups: [
    {
      id: 'g',
      name: 'CDN',
      enabled: true,
      rules: [
        {
          id: 'a',
          enabled: true,
          match: { kind: 'glob', pattern: '*:8001/a.js' },
          action: { type: 'redirect', to: 'http://127.0.0.1:8002/a.js' },
        },
        {
          id: 'm',
          enabled: true,
          match: { kind: 'glob', pattern: '*/api/*' },
          action: { type: 'mock', method: 'GET', status: 200, headers: [], body: '{"secret":true}', delayMs: 0 },
        },
      ],
    },
  ],
});

describe('match log', () => {
  it('keeps the newest match first and drops past 50', () => {
    let log: MatchEntry[] = [];
    for (let i = 0; i < MAX_MATCHES + 5; i += 1) log = appendMatch(log, entry({ key: String(i), atMs: i }));
    expect(log).toHaveLength(MAX_MATCHES);
    expect(log[0]?.key).toBe(String(MAX_MATCHES + 4));
    expect(log.at(-1)?.key).toBe('5');
  });

  it('ignores a repeated key so a poll cannot count one request twice', () => {
    const first = appendMatch([], entry({ key: 'same' }));
    expect(appendMatch(first, entry({ key: 'same', url: 'https://cdn.example.com/other.js' }))).toBe(first);
  });

  it('counts only the tab, and only matches since navigation', () => {
    const log = [entry({ tabId: 1, atMs: 10 }), entry({ key: 'b', tabId: 1, atMs: 30 }), entry({ key: 'c', tabId: 2, atMs: 40 })];
    expect(countForTab(log, 1, 20)).toBe(1);
    expect(countForTab(log, 2, 0)).toBe(1);
  });

  it('does not count a poll stand-in once the request URL was logged', () => {
    const log = [
      entry({ key: 'dnr-poll:1:a:1', atMs: 30 }),
      entry({ key: 'dnr:req:a', atMs: 31, url: 'https://cdn.example.com/a.js' }),
    ];
    expect(countForTab(log, 1, 0)).toBe(1);
    expect(countForTab([entry({ key: 'dnr-poll:1:a:1' })], 1, 0)).toBe(1);
  });
});

describe('badge text', () => {
  it('is empty when the badge is off, Detour is off, or nothing matched', () => {
    expect(formatBadge(false, 4)).toBe('');
    expect(formatBadge(true, 0)).toBe('');
  });

  it('shows the count and caps at 99+', () => {
    expect(formatBadge(true, 2)).toBe('2');
    expect(formatBadge(true, 100)).toBe('99+');
  });
});

describe('rule labels', () => {
  it('uses the group name and match pattern, not the redirect target or mock body', () => {
    const labels = labelsFromWorkspace(workspace());
    expect(labels.get('g:a')).toBe('CDN: *:8001/a.js');
    expect(labels.get('g:m')).toBe('CDN: */api/*');
    expect([...labels.values()].join(' ')).not.toContain('8002');
    expect([...labels.values()].join(' ')).not.toContain('secret');
  });
});

describe('DNR attribution', () => {
  const owners = [{ dnrId: 1, groupId: 'g', ruleId: 'a' }];
  const labels = labelsFromWorkspace(workspace());

  it('maps a dynamic rule id through the apply report', () => {
    const row = attributeDnr({
      dnrId: 1,
      rulesetId: DYNAMIC_RULESET_ID,
      expectedRuleset: DYNAMIC_RULESET_ID,
      tabId: 4,
      url: 'http://localhost:8001/a.js',
      key: 'dnr:req:1',
      at,
      owners,
      labels,
    });
    expect(row).toMatchObject({ ruleId: 'a', groupId: 'g', label: 'CDN: *:8001/a.js', url: 'http://localhost:8001/a.js', source: 'dnr' });
  });

  it('drops session rules and ids that are not in the apply report', () => {
    const base = { expectedRuleset: DYNAMIC_RULESET_ID, tabId: 4, url: 'http://localhost:8001/a.js', key: 'k', at, owners, labels };
    expect(attributeDnr({ ...base, dnrId: 1, rulesetId: '_session' })).toBeUndefined();
    expect(attributeDnr({ ...base, dnrId: 9, rulesetId: DYNAMIC_RULESET_ID })).toBeUndefined();
  });
});
