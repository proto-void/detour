import { describe, expect, it } from 'vitest';
import golden from './__fixtures__/detour-export.json';
import roV1 from './__fixtures__/ro-v1.json';
import roV2Data from './__fixtures__/ro-v2-data.json';
import roV2RuleGroups from './__fixtures__/ro-v2-rulegroups.json';
import { parsePageScope, parseRoHeaderRules } from './ro-import';
import { RESOURCE_TYPES } from './schema';
import { findSourceMatch, importWorkspace, mergeImported, serializeExport, sha256Hex } from './transfer';
import type { Group, ImportSource } from './schema';

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
          id: 'id4',
          name: '*',
          enabled: true,
          rules: [
            { id: 'id1', enabled: true, match: { kind: 'glob', pattern: 'https://cdn.example.com/*.js' }, action: { type: 'redirect', to: 'http://localhost:8080/*.js' }, resourceTypes: ALL_TYPES, importKey: 'r1' },
            {
              id: 'id2',
              enabled: true,
              match: { kind: 'glob', pattern: 'https://cdn.example.com/app.css' },
              action: { type: 'overrideBody', body: 'body { color: red }', delivery: 'redirect' },
              resourceTypes: ALL_TYPES,
              importKey: 'r2',
            },
            {
              id: 'id3',
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
              importKey: 'r3',
            },
          ],
          importKey: 'd1',
        },
        {
          id: 'id6',
          name: 'https://app.example.com/*',
          enabled: false,
          pageDomains: ['app.example.com'],
          rules: [
            {
              id: 'id5',
              enabled: true,
              match: { kind: 'glob', pattern: 'https://**.example.com/*' },
              action: { type: 'redirect', to: 'https://**.staging.example.com/*' },
              resourceTypes: ALL_TYPES,
              importKey: 'r5',
            },
          ],
          importKey: 'd2',
        },
      ],
    });
    expect(result.skipped.map((s) => [s.code, s.group, s.rule])).toEqual([
      ['file-inject-unsupported', 0, 3],
      ['empty-header-rule', 1, 1],
    ]);
    expect(result.warnings.map((w) => [w.code, w.group, w.rule])).toEqual([['wildcard-groups-simplified', 1, 0]]);
  });

  it('keeps file bodies on the rule and out of notices', () => {
    const result = importFixture(roV1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const notices = JSON.stringify(result.skipped) + JSON.stringify(result.warnings);
    expect(notices).not.toContain('color: red');
    expect(notices).not.toContain('console.log');
    expect(result.workspace.groups[0]?.rules[1]?.action).toEqual({ type: 'overrideBody', body: 'body { color: red }', delivery: 'redirect' });
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
      ['*', 2],
      ['Imported group 2', 0],
    ]);
    expect(result.workspace.groups[0]?.rules[1]?.action).toEqual({ type: 'overrideBody', body: '{}', delivery: 'redirect' });
    expect(result.skipped.map((s) => s.code)).toEqual(['unknown-rule-type', 'invalid-after-mapping']);
    expect(result.skipped[1]?.message).toContain('action.request.0.name');
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

describe('mergeImported', () => {
  const HASH_A = 'a'.repeat(64);
  const HASH_B = 'b'.repeat(64);
  const group = (id: string, importedFrom?: ImportSource): Group => ({ id, name: id, enabled: true, ...(importedFrom && { importedFrom }), rules: [] });
  const incoming = { groups: [group('x'), group('y')] };
  const names = (groups: Group[]) => groups.map((g) => g.name);

  it('appends and stamps provenance when nothing came from this source', () => {
    const { workspace, replaced } = mergeImported({ groups: [group('mine')] }, incoming, { file: 'ro.json', sha256: HASH_A }, sequentialIds());
    expect(replaced).toBe(0);
    expect(names(workspace.groups)).toEqual(['mine', 'x', 'y']);
    expect(workspace.groups[1]).toMatchObject({ id: 'id1', importedFrom: { file: 'ro.json', sha256: HASH_A } });
  });

  it('replaces earlier groups from the same file name in place, keeping hand-made groups', () => {
    const source = { file: 'ro.json', sha256: HASH_A };
    const base = { groups: [group('mine'), group('old1', source), group('between'), group('old2', source), group('last')] };
    const { workspace, replaced } = mergeImported(base, incoming, { file: 'ro.json', sha256: HASH_B }, sequentialIds());
    expect(replaced).toBe(2);
    expect(names(workspace.groups)).toEqual(['mine', 'x', 'y', 'between', 'last']);
  });

  it('matches identical content under a different file name', () => {
    const base = { groups: [group('old', { file: 'ro.json', sha256: HASH_A })] };
    const { workspace, replaced } = mergeImported(base, incoming, { file: 'ro (1).json', sha256: HASH_A }, sequentialIds());
    expect(replaced).toBe(1);
    expect(names(workspace.groups)).toEqual(['x', 'y']);
  });

  it('leaves groups from other sources alone', () => {
    const base = { groups: [group('other', { file: 'other.json', sha256: HASH_B })] };
    const { workspace, replaced } = mergeImported(base, incoming, { file: 'ro.json', sha256: HASH_A }, sequentialIds());
    expect(replaced).toBe(0);
    expect(names(workspace.groups)).toEqual(['other', 'x', 'y']);
  });

  it('hashes text as lowercase hex SHA-256', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('mergeImported keeps on/off switches', () => {
  const HASH_A = 'a'.repeat(64);
  const HASH_B = 'b'.repeat(64);
  const rule = (id: string, pattern: string, enabled = true, importKey?: string) => ({
    id,
    enabled,
    match: { kind: 'glob' as const, pattern },
    action: { type: 'block' as const },
    ...(importKey && { importKey }),
  });
  const old: ImportSource = { file: 'ro.json', sha256: HASH_A };

  it('pairs groups and rules by importKey and replaces everything else', () => {
    const base = {
      groups: [{ id: 'g-old', name: 'Old name', enabled: false, importedFrom: old, importKey: 'd1', rules: [rule('r-old', '*/old', false, 'r1')] }],
    };
    const incoming = { groups: [{ id: 'x', name: 'New name', enabled: true, importKey: 'd1', rules: [rule('y', '*/new', true, 'r1'), rule('z', '*/added', true, 'r2')] }] };
    const { workspace } = mergeImported(base, incoming, { file: 'ro.json', sha256: HASH_B }, sequentialIds());
    const [g] = workspace.groups;
    expect(g).toMatchObject({ name: 'New name', enabled: false, importKey: 'd1' });
    expect(g!.rules.map((r) => [r.match.pattern, r.enabled])).toEqual([
      ['*/new', false],
      ['*/added', true],
    ]);
  });

  it('falls back to position (+ match for rules) for groups imported before keys existed', () => {
    const base = { groups: [{ id: 'g', name: 'G', enabled: false, importedFrom: old, rules: [rule('a', '*/same', false), rule('b', '*/changed', false)] }] };
    const incoming = { groups: [{ id: 'x', name: 'G', enabled: true, rules: [rule('1', '*/same'), rule('2', '*/different')] }] };
    const { workspace } = mergeImported(base, incoming, old, sequentialIds());
    expect(workspace.groups[0]!.enabled).toBe(false);
    expect(workspace.groups[0]!.rules.map((r) => r.enabled)).toEqual([false, true]);
  });

  it('stamps file ids as import keys for Detour exports', () => {
    const { workspace } = mergeImported({ groups: [] }, { groups: [{ id: 'g-file', name: 'G', enabled: true, rules: [rule('r-file', '*')] }] }, old, sequentialIds());
    expect(workspace.groups[0]).toMatchObject({ id: 'id1', importKey: 'g-file' });
    expect(workspace.groups[0]!.rules[0]).toMatchObject({ id: 'id2', importKey: 'r-file' });
  });

  it('appends instead of replacing in append mode', () => {
    const base = { groups: [{ id: 'g', name: 'G', enabled: true, importedFrom: old, rules: [] }] };
    const { workspace, replaced } = mergeImported(base, { groups: [{ id: 'x', name: 'X', enabled: true, rules: [] }] }, old, sequentialIds(), 'append');
    expect(replaced).toBe(0);
    expect(workspace.groups.map((g) => g.name)).toEqual(['G', 'X']);
  });

  it('tells identical content from a name-only match', () => {
    const base = { groups: [{ id: 'g', name: 'G', enabled: true, importedFrom: old, rules: [] }] };
    expect(findSourceMatch(base, old)).toEqual({ kind: 'hash', groups: 1 });
    expect(findSourceMatch(base, { file: 'ro.json', sha256: HASH_B })).toEqual({ kind: 'name', groups: 1 });
    expect(findSourceMatch(base, { file: 'other.json', sha256: HASH_B })).toEqual({ kind: 'none', groups: 0 });
  });
});

describe('RO import keys', () => {
  it('uses RO ids, or position + type + match when ids are missing', () => {
    const result = importFixture({ v: 2, data: [{ name: '*', rules: [{ type: 'normalOverride', match: 'https://a/*', replace: 'http://b/*' }] }] });
    if (!result.ok) throw new Error(result.errors.join());
    expect(result.workspace.groups[0]!.importKey).toBe('#0');
    expect(result.workspace.groups[0]!.rules[0]!.importKey).toBe('#0:normalOverride:https://a/*');
    const v1 = importFixture(roV1);
    if (!v1.ok) throw new Error(v1.errors.join());
    expect(v1.workspace.groups[0]!.importKey).toBe('d1');
    expect(v1.workspace.groups[0]!.rules[0]!.importKey).toBe('r1');
  });
});
