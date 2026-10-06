import { describe, expect, it } from 'vitest';
import type { ApplyReport } from '../engine-core/apply';
import { RESOURCE_TYPES, type Rule, type Workspace } from '../rule-model/schema';
import {
  addGroup,
  addRule,
  defaultAction,
  describeMatch,
  exportFileName,
  headerOpWith,
  isAwaitingApply,
  isDirty,
  moveGroup,
  moveRule,
  newGroup,
  newRule,
  normalizeDomains,
  previewMatch,
  removeGroup,
  removeRule,
  requestScope,
  ruleStatus,
  updateGroup,
  updateRule,
  validateGroup,
  validateRule,
  validateWorkspace,
  withRequestScope,
} from './editor';

const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};

const redirect = (pattern: string, to: string, extra: Partial<Rule> = {}): Rule => ({
  id: 'r',
  enabled: true,
  match: { kind: 'glob', pattern },
  action: { type: 'redirect', to },
  ...extra,
});

const names = (ws: Workspace) => ws.groups.map((g) => g.name);

describe('workspace operations', () => {
  const base = (): Workspace => {
    const newId = ids();
    let ws: Workspace = { groups: [] };
    for (const name of ['A', 'B', 'C']) ws = addGroup(ws, newGroup(newId, name));
    return ws;
  };

  it('adds, moves and removes groups without mutating the input', () => {
    const ws = base();
    expect(names(ws)).toEqual(['A', 'B', 'C']);
    expect(names(moveGroup(ws, 'id3', -1))).toEqual(['A', 'C', 'B']);
    expect(names(moveGroup(ws, 'id1', -1))).toEqual(['A', 'B', 'C']);
    expect(names(moveGroup(ws, 'id3', 1))).toEqual(['A', 'B', 'C']);
    expect(names(removeGroup(ws, 'id2'))).toEqual(['A', 'C']);
    expect(names(ws)).toEqual(['A', 'B', 'C']);
  });

  it('updates group fields and really drops cleared optional ones', () => {
    const ws = updateGroup(base(), 'id1', { name: 'Local', pageDomains: ['example.com'] });
    expect(ws.groups[0]).toMatchObject({ name: 'Local', pageDomains: ['example.com'] });
    const cleared = updateGroup(ws, 'id1', { pageDomains: undefined });
    expect('pageDomains' in cleared.groups[0]!).toBe(false);
  });

  it('adds, edits, moves and removes rules inside one group', () => {
    const newId = ids();
    let ws: Workspace = addGroup({ groups: [] }, newGroup(newId));
    const [r1, r2] = [newRule(newId), newRule(newId)];
    ws = addRule(addRule(ws, 'id1', r1), 'id1', r2);
    expect(ws.groups[0]!.rules.map((r) => r.id)).toEqual(['id2', 'id3']);
    ws = moveRule(ws, 'id1', 'id3', -1);
    expect(ws.groups[0]!.rules.map((r) => r.id)).toEqual(['id3', 'id2']);
    ws = updateRule(ws, 'id1', { ...r1, enabled: false });
    expect(ws.groups[0]!.rules[1]!.enabled).toBe(false);
    ws = removeRule(ws, 'id1', 'id3');
    expect(ws.groups[0]!.rules.map((r) => r.id)).toEqual(['id2']);
  });

  it('starts new rules as redirects for every request type, page loads included', () => {
    expect(newRule(ids())).toMatchObject({ enabled: true, action: { type: 'redirect', to: '' }, resourceTypes: [...RESOURCE_TYPES] });
  });

  it('detects unsaved changes', () => {
    const ws = base();
    expect(isDirty(ws, structuredClone(ws))).toBe(false);
    expect(isDirty(updateGroup(ws, 'id1', { enabled: false }), ws)).toBe(true);
  });
});

describe('rule fields', () => {
  it('gives each action type a starting value', () => {
    expect(defaultAction('block')).toEqual({ type: 'block' });
    expect(defaultAction('modifyHeaders')).toEqual({ type: 'modifyHeaders', request: [{ op: 'set', name: '', value: '' }], response: [] });
  });

  it('switches header operations, keeping the name', () => {
    expect(headerOpWith({ op: 'set', name: 'x-a', value: '1' }, 'remove')).toEqual({ op: 'remove', name: 'x-a' });
    expect(headerOpWith({ op: 'remove', name: 'x-a' }, 'append')).toEqual({ op: 'append', name: 'x-a', value: '' });
  });

  it('maps resource types to a simple request scope and back', () => {
    const rule = redirect('*', 'http://x/', { resourceTypes: [...RESOURCE_TYPES] });
    expect(requestScope(rule)).toBe('all');
    const sub = withRequestScope(rule, 'subresources');
    expect(requestScope(sub)).toBe('subresources');
    expect('resourceTypes' in sub).toBe(false);
    const custom = { ...rule, resourceTypes: ['script' as const] };
    expect(requestScope(custom)).toBe('custom');
    expect(withRequestScope(custom, 'custom')).toBe(custom);
  });

  it('normalizes site lists, forgiving pasted URLs and wildcards', () => {
    expect(normalizeDomains(' Example.com, https://app.test:8080/x  *.cdn.io,example.com ')).toEqual(['example.com', 'app.test', 'cdn.io']);
    expect(normalizeDomains('  ,  ')).toBeUndefined();
  });
});

describe('validation', () => {
  it('reports empty required fields at the field', () => {
    const { errors } = validateRule(redirect('', ''));
    expect(errors['match.pattern']).toMatch(/Enter a URL pattern/);
    expect(errors['action.to']).toMatch(/Enter where/);
  });

  it('reports schema problems by field path', () => {
    const regex: Rule = { ...redirect('', 'http://x/'), match: { kind: 'regex', pattern: '(' } };
    expect(validateRule(regex).errors['match.pattern']).toBe('Not a valid regular expression');
    const headers: Rule = { ...redirect('*', ''), action: { type: 'modifyHeaders', request: [{ op: 'set', name: 'bad name', value: '' }], response: [] } };
    expect(validateRule(headers).errors['action.request.0.name']).toMatch(/valid HTTP token/);
  });

  it('warns, without blocking, about what the engine would refuse', () => {
    const loop = validateRule(redirect('*/a.js', 'http://localhost/a.js'));
    expect(loop.errors).toEqual({});
    expect(loop.warnings['action.to']).toMatch(/^Redirect loop:/);
    expect(validateRule(redirect('https://x.com/a', 'localhost:5173/a')).warnings['action.to']).toMatch(/^Invalid redirect target/);
    expect(validateRule(redirect('https://x.com/a', 'http://l/*')).warnings['action.to']).toMatch(/^Too many wildcards/);
    expect(validateRule(redirect('https://bücher.de/*', 'http://l/*')).warnings['match.pattern']).toMatch(/^Non-ASCII/);
  });

  it("warns about request appends Chrome won't accept", () => {
    const rule: Rule = {
      ...redirect('*', ''),
      action: { type: 'modifyHeaders', request: [{ op: 'append', name: 'x-debug', value: '1' }, { op: 'append', name: 'cookie', value: 'a=1' }], response: [] },
    };
    const { errors, warnings } = validateRule(rule);
    expect(errors).toEqual({});
    expect(Object.keys(warnings)).toEqual(['action.request.0.op']);
  });

  it('names the bad site in group errors', () => {
    expect(validateGroup({ ...newGroup(ids()), pageDomains: ['ok.com', 'bad host'] }).pageDomains).toMatch(/"bad host" isn't a hostname/);
    expect(validateGroup(newGroup(ids()))).toEqual({});
  });

  it('counts blocking errors across the workspace', () => {
    const newId = ids();
    const ws = addRule(addGroup({ groups: [] }, { ...newGroup(newId), pageDomains: ['x y'] }), 'id1', newRule(newId));
    const result = validateWorkspace(ws);
    expect(result.errorCount).toBe(3);
    expect(Object.keys(result.rules.id2!.errors).sort()).toEqual(['action.to', 'match.pattern']);
  });
});

describe('describeMatch', () => {
  it.each([
    ['https://cdn.x.com/*.js', 'URLs that start with “https://cdn.x.com/” and end with “.js”. Each * matches any text, including slashes. Upper/lower case is ignored.'],
    ['*://*/api/*', 'URLs that contain “://”, then “/api/”. Each * matches any text, including slashes. Upper/lower case is ignored.'],
    ['https://x.com/app.js', 'Exactly this URL. Upper/lower case is ignored.'],
    ['**', 'Every URL.'],
    ['', ''],
  ])('%s', (pattern, expected) => {
    expect(describeMatch({ kind: 'glob', pattern })).toBe(expected);
  });

  it('explains regex and case sensitivity', () => {
    expect(describeMatch({ kind: 'regex', pattern: 'a' }, true)).toMatch(/matches anywhere.*must match/);
  });
});

describe('previewMatch', () => {
  it('shows the redirect result with captured wildcards', () => {
    expect(previewMatch(redirect('https://cdn.x.com/*/*.js', 'http://localhost:5173/*.js'), 'https://cdn.x.com/v2/app.js')).toEqual({
      kind: 'match',
      outcome: 'redirect',
      to: 'http://localhost:5173/v2.js',
    });
  });

  it('ignores case unless asked', () => {
    const rule = redirect('https://x.com/A.js', 'http://l/a.js');
    expect(previewMatch(rule, 'https://X.com/a.js').kind).toBe('match');
    expect(previewMatch({ ...rule, caseSensitive: true }, 'https://X.com/a.js').kind).toBe('no-match');
  });

  it('replaces only the matched part for regex backreferences, like DNR', () => {
    const rule: Rule = { ...redirect('', 'cdn.staging.\\1'), match: { kind: 'regex', pattern: 'cdn\\.(x\\.com)' } };
    expect(previewMatch(rule, 'https://cdn.x.com/a.js')).toMatchObject({ to: 'https://cdn.staging.x.com/a.js' });
  });

  it('handles block, header rules, empty input and bad regex', () => {
    expect(previewMatch({ ...redirect('*ads*', ''), action: { type: 'block' } }, 'https://ads.x/')).toEqual({ kind: 'match', outcome: 'block' });
    expect(previewMatch(redirect('*', 'http://l/'), ' ')).toEqual({ kind: 'empty' });
    expect(previewMatch({ ...redirect('', ''), match: { kind: 'regex', pattern: '(' } }, 'https://x').kind).toBe('invalid');
  });
});

describe('ruleStatus', () => {
  const rule = redirect('https://x.com/*', 'http://l/*');
  const saved: Workspace = { groups: [{ id: 'g', name: 'G', enabled: true, rules: [rule] }] };
  const report = (overrides: Partial<ApplyReport> = {}): ApplyReport => ({
    appliedAt: '2026-10-06T12:00:00.000Z',
    applied: [{ dnrId: 1, groupId: 'g', ruleId: 'r' }],
    refused: [],
    fallback: false,
    disabled: false,
    errors: [],
    ...overrides,
  });
  const ctx = { report: report(), saved, awaitingApply: false };

  it('walks the states in order of precedence', () => {
    expect(ruleStatus({ ...rule, note: 'edited' }, ctx)).toEqual({ kind: 'unsaved' });
    expect(ruleStatus(rule, { ...ctx, saved: { groups: [{ ...saved.groups[0]!, enabled: false }] } })).toEqual({ kind: 'off', because: 'group' });
    expect(ruleStatus(rule, { ...ctx, awaitingApply: true })).toEqual({ kind: 'pending' });
    expect(ruleStatus(rule, { ...ctx, report: report({ disabled: true, applied: [] }) })).toEqual({ kind: 'detour-off' });
    expect(ruleStatus(rule, ctx)).toEqual({ kind: 'applied' });
    expect(ruleStatus(rule, { ...ctx, report: report({ applied: [], refused: [{ groupId: 'g', ruleId: 'r', reason: 'regex-limit', message: 'm' }] }) })).toEqual({
      kind: 'refused',
      label: 'Regex limit reached',
      message: 'm',
    });
  });

  it('waits for a report newer than the save', () => {
    const at = Date.parse('2026-10-06T12:00:00.000Z');
    expect(isAwaitingApply(report(), at + 1)).toBe(true);
    expect(isAwaitingApply(report(), at)).toBe(false);
    expect(isAwaitingApply(undefined, undefined)).toBe(false);
  });
});

it('names export files by date', () => {
  expect(exportFileName(new Date('2026-10-06T23:00:00Z'))).toBe('detour-2026-10-06.json');
});
