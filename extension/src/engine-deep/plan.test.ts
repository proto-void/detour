import { describe, expect, it } from 'vitest';
import type { Rule, Workspace } from '../rule-model/schema';
import { planBody } from './plan';

const body = (id: string, pattern: string, text = 'local', extra: Partial<Rule> = {}): Rule => ({
  id,
  enabled: true,
  match: { kind: 'glob', pattern },
  action: { type: 'overrideBody', body: text, delivery: 'inPlace' },
  resourceTypes: ['script'],
  ...extra,
});

const ws = (rules: Rule[], extra: Partial<Workspace['groups'][number]> = {}): Workspace => ({
  groups: [{ id: 'g', name: 'g', enabled: true, rules, ...extra }],
});

describe('planBody', () => {
  it('skips non-body rules and turns a glob into a Fetch pattern', () => {
    const plan = planBody(
      ws([
        { id: 'r', enabled: true, match: { kind: 'glob', pattern: 'https://cdn.example.com/app.js' }, action: { type: 'redirect', to: 'http://127.0.0.1/app.js' } },
        body('b', 'https://cdn.example.com/app.js', 'window.A = 1'),
      ]),
    );
    expect(plan.rules.map((rule) => rule.ruleId)).toEqual(['b']);
    expect(plan.patterns).toEqual([
      { urlPattern: 'https://cdn.example.com/app.js', requestStage: 'Response' },
      { urlPattern: '*', resourceType: 'Document', requestStage: 'Response' },
    ]);
    expect(plan.broad).toBe(false);
    expect(plan.refused).toEqual([]);
    expect(JSON.stringify(plan.patterns)).not.toContain('window.A');
  });

  it('pauses every response when a rule is a regex or a bare star', () => {
    const plan = planBody(
      ws([
        body('g', 'https://cdn.example.com/a.js'),
        { ...body('re', 'https://cdn.example.com/.*'), match: { kind: 'regex', pattern: 'https://cdn\\.example\\.com/.*' } },
      ]),
    );
    expect(plan.broad).toBe(true);
    expect(plan.patterns).toEqual([{ urlPattern: '*', requestStage: 'Response' }]);
  });

  it('escapes literal ? in a glob and refuses non-ASCII patterns', () => {
    const plan = planBody(ws([body('q', 'https://cdn.example.com/a.js?v=1'), body('bad', 'https://ünicode.example/*')]));
    expect(plan.patterns).toEqual([
      { urlPattern: 'https://cdn.example.com/a.js\\?v=1', requestStage: 'Response' },
      { urlPattern: '*', resourceType: 'Document', requestStage: 'Response' },
    ]);
    expect(plan.refused).toEqual([expect.objectContaining({ ruleId: 'bad', reason: 'non-ascii-pattern' })]);
  });

  it('arms a local file only when the caller asked for in-place, and refuses an escaping path', () => {
    const local: Rule = {
      id: 's',
      enabled: true,
      match: { kind: 'glob', pattern: 'https://cdn.example.com/app.js' },
      action: { type: 'serveLocal', path: 'assets/app.js' },
      resourceTypes: ['script'],
    };
    expect(planBody(ws([local])).rules).toEqual([]);
    const plan = planBody(ws([body('b', 'https://cdn.example.com/app.js', 'INLINE'), local]), { bridgeInPlace: true });
    expect(plan.rules.map((rule) => rule.ruleId)).toEqual(['b', 's']);
    expect(plan.rules[1]).toMatchObject({ bridgePath: 'assets/app.js', body: '' });
    expect(plan.patterns.map((pattern) => pattern.urlPattern)).toEqual(['https://cdn.example.com/app.js', '*']);
    expect(plan.patterns[1]).toMatchObject({ resourceType: 'Document' });
    const escaped = planBody(ws([{ ...local, action: { type: 'serveLocal', path: '../secret' } }]), { bridgeInPlace: true });
    expect(escaped.rules).toEqual([]);
    expect(escaped.refused).toEqual([expect.objectContaining({ reason: 'invalid-bridge-path' })]);
    expect(escaped.refused[0]?.message).not.toContain('secret');
  });

  it('is empty when the group is off, and keeps site scope', () => {
    expect(planBody(ws([body('b', '*')], { enabled: false })).rules).toEqual([]);
    const scoped = planBody(ws([body('b', 'https://cdn.example.com/a.js')], { pageDomains: ['app.example.com'] }));
    expect(scoped.rules[0]).toMatchObject({ pageDomains: ['app.example.com'], body: 'local' });
  });

  it('skips redirect-delivery overrideBody (those are DNR)', () => {
    const plan = planBody(
      ws([
        {
          id: 'r',
          enabled: true,
          match: { kind: 'glob', pattern: 'https://cdn.example.com/switch.json' },
          action: { type: 'overrideBody', body: '{"ok":true}', delivery: 'redirect' },
          resourceTypes: ['xmlhttprequest'],
        },
        body('p', 'https://cdn.example.com/app.js', 'inline'),
      ]),
    );
    expect(plan.rules.map((rule) => rule.ruleId)).toEqual(['p']);
  });
});
