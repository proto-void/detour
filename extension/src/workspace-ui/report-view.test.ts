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
