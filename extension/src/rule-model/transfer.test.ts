import { describe, expect, it } from 'vitest';
import golden from './__fixtures__/detour-export.json';
import roV1 from './__fixtures__/ro-v1.json';
import roV2Data from './__fixtures__/ro-v2-data.json';
import roV2RuleGroups from './__fixtures__/ro-v2-rulegroups.json';
import { parseRoHeaderRules } from './ro-import';
import { importWorkspace, serializeExport } from './transfer';

const sequentialIds = () => {
  let n = 0;
  return () => `id${++n}`;
};
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
            { id: 'id1', enabled: true, match: { kind: 'glob', pattern: 'https://cdn.example.com/*.js' }, action: { type: 'redirect', to: 'http://localhost:8080/*.js' } },
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
            },
          ],
        },
        {
          id: 'id5',
          name: 'https://app.example.com/*',
          enabled: false,
          rules: [{ id: 'id4', enabled: true, match: { kind: 'glob', pattern: 'https://**.example.com/*' }, action: { type: 'redirect', to: 'https://**.staging.example.com/*' } }],
        },
      ],
    });
    expect(result.skipped.map((s) => [s.code, s.group, s.rule])).toEqual([
      ['file-override-unsupported', 0, 1],
      ['file-inject-unsupported', 0, 3],
      ['empty-header-rule', 1, 1],
    ]);
    expect(result.warnings.map((w) => [w.code, w.group, w.rule])).toEqual([
      ['page-scope-dropped', 1, undefined],
      ['wildcard-groups-simplified', 1, 0],
    ]);
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
