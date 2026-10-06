import { describe, expect, it } from 'vitest';
import golden from './__fixtures__/detour-export.json';
import roV1 from './__fixtures__/ro-v1.json';
import roV2Data from './__fixtures__/ro-v2-data.json';
import roV2RuleGroups from './__fixtures__/ro-v2-rulegroups.json';
import { parsePageScope, parseRoHeaderRules } from './ro-import';
import { RESOURCE_TYPES } from './schema';
import { importWorkspace, serializeExport } from './transfer';

const sequentialIds = () => {
  let n = 0;
  return () => `id${++n}`;
};
const ALL_TYPES = [...RESOURCE_TYPES];
const importFixture = (input: unknown) => importWorkspace(input, { newId: sequentialIds() });

describe('Detour export/import', () => {
  it('round-trips the golden export byte-for-byte', () => {
    const result = importFixture(JSON.stringify(golden));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toBe('detour');
    expect(serializeExport(result.workspace)).toBe(`${JSON.stringify(golden, null, 2)}\n`);
  });

  it.each([
    ['broken JSON', '{"v": 1,', /^Not valid JSON/],
    ['a bare array', '[]', /Expected a JSON object/],
    ['the empty {} export bug', '{}', /empty object/],
    ['a wrong version', { v: 3, data: { groups: [] } }, /^v: Unsupported Detour schema version/],
    ['a bad rule deep inside', { v: 1, data: { groups: [{ id: 'g', name: '', enabled: true, rules: [{ id: 'r', enabled: true, match: { kind: 'glob', pattern: '' }, action: { type: 'block' } }] }] } }, /^data\.groups\.0\.rules\.0\.match\.pattern: Must not be empty/],
  ])('rejects %s with an actionable error', (_, input, expected) => {
    const result = importFixture(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(expected);
  });
});

describe('Resource Override import', () => {
  it('maps v1 (master) exports', () => {
    const result = importFixture(roV1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toBe('resource-override-v1');
    expect(result.workspace).toEqual({
      groups: [
        {
          id: 'id3',
          name: '*',
          enabled: true,
          rules: [
            { id: 'id1', enabled: true, match: { kind: 'glob', pattern: 'https://cdn.example.com/*.js' }, action: { type: 'redirect', to: 'http://localhost:8080/*.js' }, resourceTypes: ALL_TYPES },
            {
              id: 'id2',
              enabled: false,
              match: { kind: 'glob', pattern: 'https://api.example.com/*' },
              action: {
                type: 'modifyHeaders',
                request: [
                  { op: 'set', name: 'x-debug', value: '1' },
                  { op: 'remove', name: 'cookie' },
                ],
                response: [
                  { op: 'set', name: 'access-control-allow-origin', value: '*' },
                  { op: 'remove', name: 'content-security-policy' },
                ],
              },
              resourceTypes: ALL_TYPES,
            },
          ],
        },
        {
          id: 'id5',
          name: 'https://app.example.com/*',
          enabled: false,
          pageDomains: ['app.example.com'],
          rules: [
            {
              id: 'id4',
              enabled: true,
              match: { kind: 'glob', pattern: 'https://**.example.com/*' },
              action: { type: 'redirect', to: 'https://**.staging.example.com/*' },
              resourceTypes: ALL_TYPES,
            },
          ],
        },
      ],
    });
    expect(result.skipped.map((s) => [s.code, s.group, s.rule])).toEqual([
      ['file-override-unsupported', 0, 1],
      ['file-inject-unsupported', 0, 3],
      ['empty-header-rule', 1, 1],
    ]);
    expect(result.warnings.map((w) => [w.code, w.group, w.rule])).toEqual([['wildcard-groups-simplified', 1, 0]]);
  });

  it('never copies file bodies into notices', () => {
    const result = importFixture(roV1);
    expect(JSON.stringify(result)).not.toContain('color: red');
    expect(JSON.stringify(result)).not.toContain('console.log');
  });

  it('maps v2 { ruleGroups } exports with legacy matchUrl names and /regex/ mode', () => {
    const result = importFixture(roV2RuleGroups);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toBe('resource-override-v2');
    const [group] = result.workspace.groups;
    expect(group?.name).toBe('*');
    expect(group?.rules.map((r) => [r.match, r.action])).toEqual([
      [{ kind: 'regex', pattern: '^https://cdn\\.example\\.com/(.*)$' }, { type: 'redirect', to: 'http://localhost:8080/\\1' }],
      [{ kind: 'glob', pattern: '*' }, { type: 'modifyHeaders', request: [{ op: 'set', name: 'user-agent', value: 'Detour; test' }], response: [] }],
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('maps v2 { data } exports (post PR #73) and reports skips per rule', () => {
    const result = importFixture(roV2Data);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workspace.groups.map((g) => [g.name, g.rules.length])).toEqual([
      ['*', 1],
      ['Imported group 2', 0],
    ]);
    expect(result.skipped.map((s) => s.code)).toEqual(['file-override-unsupported', 'unknown-rule-type', 'invalid-after-mapping']);
    expect(result.skipped[2]?.message).toContain('action.request.0.name');
  });

  it('rejects unknown RO versions and malformed groups', () => {
    const bad = importFixture({ v: 7, data: [] });
    expect(bad.ok).toBe(false);
    const malformed = importFixture({ v: 1, data: [{ matchUrl: '*', rules: 'nope' }] });
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) expect(malformed.errors[0]).toMatch(/^data\.0\.rules/);
  });
});

describe('parseRoHeaderRules', () => {
  it('ignores malformed entries the way Resource Override did', () => {
    expect(parseRoHeaderRules('set A: 1: 2;bogus;remove B;')).toEqual([{ op: 'remove', name: 'b' }]);
  });
});

describe('parsePageScope', () => {
  it.each([
    ['', { kind: 'any' }],
    ['*', { kind: 'any' }],
    ['*://*/*', { kind: 'any' }],
    ['https://app.example.com/*', { kind: 'domains', domains: ['app.example.com'] }],
    ['*://*.Example.com/*', { kind: 'domains', domains: ['example.com'] }],
    ['http://localhost', { kind: 'domains', domains: ['localhost'] }],
    ['http://127.0.0.1/', { kind: 'domains', domains: ['127.0.0.1'] }],
  ])('%j → %j', (pattern, expected) => {
    expect(parsePageScope(pattern)).toEqual(expected);
  });

  it.each([
    ['http://localhost:3000/*', 'port'],
    ['https://app.example.com/admin/*', 'path'],
    ['https://app.example.com:8443/admin/*', 'port and path'],
  ])('approximates %s (drops the %s)', (pattern, part) => {
    expect(parsePageScope(pattern)).toMatchObject({ kind: 'domains', approximation: expect.stringContaining(`the ${part} part`) });
  });

  it.each(['*example.com*', 'example.com', 'https://app.*.com/*', 'https://*/admin/*', 'https://café.com/*'])('refuses %s', (pattern) => {
    expect(parsePageScope(pattern)).toMatchObject({ kind: 'unsupported' });
  });
});

describe('Resource Override page scoping', () => {
  const roWithGroup = (matchUrl: string) => ({
    v: 1,
    data: [{ id: 'd1', matchUrl, on: true, rules: [{ type: 'normalOverride', match: 'https://cdn.x.com/a.js', replace: 'http://localhost/a.js', on: true }] }],
  });

  it('keeps an approximated scope enabled and says what was lost', () => {
    const result = importFixture(roWithGroup('https://app.example.com/admin/*'));
    if (!result.ok) throw new Error(result.errors.join());
    expect(result.workspace.groups[0]).toMatchObject({ enabled: true, pageDomains: ['app.example.com'] });
    expect(result.warnings).toEqual([expect.objectContaining({ code: 'page-scope-approximated', group: 0 })]);
  });

  it('imports an inexpressible scope disabled with a reason, rather than running everywhere', () => {
    const result = importFixture(roWithGroup('*example.com*'));
    if (!result.ok) throw new Error(result.errors.join());
    expect(result.workspace.groups[0]).toMatchObject({ enabled: false, name: '*example.com*' });
    expect(result.workspace.groups[0]).not.toHaveProperty('pageDomains');
    expect(result.warnings[0]).toMatchObject({ code: 'page-scope-unsupported', message: expect.stringContaining('imported disabled') });
  });

  it('includes main_frame so page loads are overridden like in Resource Override', () => {
    const result = importFixture(roWithGroup('*'));
    if (!result.ok) throw new Error(result.errors.join());
    expect(result.workspace.groups[0]!.rules[0]!.resourceTypes).toContain('main_frame');
    expect(result.workspace.groups[0]!.rules[0]!.resourceTypes).toEqual(ALL_TYPES);
  });
});
