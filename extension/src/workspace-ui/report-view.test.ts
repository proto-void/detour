import { describe, expect, it } from 'vitest';
import type { ApplyReport } from '../engine-core/apply';
import type { Workspace } from '../rule-model/schema';
import { describeReport, summarizeRule } from './report-view';

const workspace: Workspace = {
  groups: [
    {
      id: 'g',
      name: 'Local dev',
      enabled: true,
      rules: [
        { id: 'a', enabled: true, match: { kind: 'glob', pattern: 'https://cdn.x.com/*' }, action: { type: 'redirect', to: 'http://localhost/*' } },
        { id: 'b', enabled: true, match: { kind: 'glob', pattern: '*://ads.x.com/*' }, action: { type: 'block' } },
      ],
    },
  ],
};

const report = (overrides: Partial<ApplyReport>): ApplyReport => ({
  appliedAt: '2026-10-06T12:00:00.000Z',
  applied: [],
  refused: [],
  fallback: false,
  disabled: false,
  errors: [],
  ...overrides,
});

describe('describeReport', () => {
  it('is pending before the background has written a report', () => {
    expect(describeReport(undefined, workspace).state).toBe('pending');
  });

  it('labels applied and refused rules from the workspace and dedupes split rules', () => {
    const view = describeReport(
      report({
        applied: [
          { dnrId: 1, groupId: 'g', ruleId: 'a' },
          { dnrId: 2, groupId: 'g', ruleId: 'a' },
        ],
        refused: [{ groupId: 'g', ruleId: 'b', reason: 'regex-limit', message: 'Browser limit of 1000 regex rules reached' }],
      }),
      workspace,
    );
    expect(view.state).toBe('active');
    expect(view.applied).toEqual([{ ruleId: 'a', groupName: 'Local dev', summary: 'https://cdn.x.com/* → http://localhost/*' }]);
    expect(view.refused).toEqual([
      { ruleId: 'b', groupName: 'Local dev', summary: 'Block *://ads.x.com/*', reason: 'regex-limit', reasonLabel: 'Regex limit reached', message: 'Browser limit of 1000 regex rules reached' },
    ]);
  });

  it.each([
    ['disabled', report({ disabled: true })],
    ['error', report({ errors: ['Stored workspace is invalid: data: …'] })],
    ['empty', report({})],
  ])('reports the %s state', (state, input) => {
    expect(describeReport(input, workspace).state).toBe(state);
  });

  it('survives a report that mentions a deleted rule', () => {
    const view = describeReport(report({ applied: [{ dnrId: 1, groupId: 'g', ruleId: 'gone' }] }), workspace);
    expect(view.applied[0]!.summary).toMatch(/no longer in workspace/);
  });
});

describe('summarizeRule', () => {
  it('describes header rules by change count', () => {
    expect(
      summarizeRule({ id: 'h', enabled: true, match: { kind: 'glob', pattern: '*' }, action: { type: 'modifyHeaders', request: [{ op: 'remove', name: 'cookie' }], response: [] } }),
    ).toBe('Headers on * (1 change)');
  });
});

describe('summarizeRule for page actions', () => {
  const base = { id: 'x', enabled: true, match: { kind: 'glob' as const, pattern: 'https://app/*' } };
  it.each([
    [{ type: 'injectJs', source: { kind: 'inline', code: 'x' }, runAt: 'document_start', allFrames: false, world: 'MAIN' }, 'Inject JS on https://app/*'],
    [{ type: 'injectCss', source: { kind: 'url', url: 'http://l/x.css' }, runAt: 'document_start', allFrames: false }, 'Inject CSS from http://l/x.css on https://app/*'],
    [{ type: 'mock', method: 'POST', status: 201, headers: [], body: '', delayMs: 0 }, 'Mock POST https://app/* → 201'],
    [{ type: 'mock', method: 'ANY', status: 200, headers: [], body: '', delayMs: 0 }, 'Mock https://app/* → 200'],
  ])('%j', (action, expected) => {
    expect(summarizeRule({ ...base, action } as never)).toBe(expected);
  });
});

describe('describeReport with page rules', () => {
  it('lists injected rules as applied', () => {
    const ws: Workspace = { groups: [{ id: 'g', name: 'G', enabled: true, rules: [{ id: 'm', enabled: true, match: { kind: 'glob', pattern: '*/api/*' }, action: { type: 'mock', method: 'ANY', status: 200, headers: [], body: '', delayMs: 0 } }] }] };
    const report: ApplyReport = { appliedAt: 'x', applied: [], injected: [{ groupId: 'g', ruleId: 'm', kind: 'mock' }], refused: [], fallback: false, disabled: false, errors: [] };
    expect(describeReport(report, ws)).toMatchObject({ state: 'active', applied: [{ ruleId: 'm', summary: 'Mock */api/* → 200' }] });
  });
});
