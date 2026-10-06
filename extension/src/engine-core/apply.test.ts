import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { Group, Rule, Workspace } from '../rule-model/schema';
import { saveEnabled, saveWorkspace, WORKSPACE_KEY } from '../rule-model/storage';
import { createFakeDnr } from '../test/fake-dnr';
import { APPLY_REPORT_KEY, applyWorkspace, syncRules } from './apply';

const fixedNow = () => new Date('2026-10-06T12:00:00Z');

const redirect = (id: string, pattern = `https://cdn.example.com/${id}.js`): Rule => ({
  id,
  enabled: true,
  match: { kind: 'glob', pattern },
  action: { type: 'redirect', to: `http://localhost:5173/${id}.js` },
});
/** A redirect that reuses a wildcard, so it can only compile to regexFilter. */
const regexRedirect = (id: string): Rule => ({
  id,
  enabled: true,
  match: { kind: 'glob', pattern: `https://cdn.example.com/${id}/*` },
  action: { type: 'redirect', to: `http://localhost:5173/${id}/*` },
});
const block = (id: string): Rule => ({ id, enabled: true, match: { kind: 'glob', pattern: `*://ads.example.com/${id}*` }, action: { type: 'block' } });
const group = (id: string, rules: Rule[], enabled = true): Group => ({ id, name: id, enabled, rules });
const ws = (...groups: Group[]): Workspace => ({ groups });

describe('applyWorkspace', () => {
  it('replaces existing dynamic rules in a single batched call', async () => {
    const { dnr, calls, rules } = createFakeDnr();
    await dnr.updateDynamicRules({ addRules: [{ id: 42, priority: 1, action: { type: 'block' }, condition: { urlFilter: 'stale' } }] });
    calls.length = 0;

    const report = await applyWorkspace(dnr, ws(group('g1', [redirect('a'), block('b')]), group('g2', [redirect('c')])), fixedNow);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.removeRuleIds).toEqual([42]);
    expect(rules().map((r) => r.id)).toEqual([1, 2, 3]);
    expect(report).toEqual({
      appliedAt: '2026-10-06T12:00:00.000Z',
      applied: [
        { dnrId: 1, groupId: 'g1', ruleId: 'a' },
        { dnrId: 2, groupId: 'g1', ruleId: 'b' },
        { dnrId: 3, groupId: 'g2', ruleId: 'c' },
      ],
      refused: [],
      fallback: false,
      disabled: false,
      errors: [],
    });
  });

  it('gives earlier groups and earlier rules strictly higher priority', async () => {
    const { dnr, rules } = createFakeDnr();
    await applyWorkspace(dnr, ws(group('g1', [redirect('a'), redirect('b')]), group('g2', [redirect('c'), redirect('d')])));
    const byPriority = [...rules()].sort((x, y) => y.priority - x.priority);
    expect(byPriority.map((r) => r.condition.urlFilter)).toEqual(['a', 'b', 'c', 'd'].map((id) => `|https://cdn.example.com/${id}.js|`));
    expect(new Set(rules().map((r) => r.priority)).size).toBe(4);
    expect(Math.min(...rules().map((r) => r.priority))).toBe(1);
  });

  it('removes DNR rules for disabled rules and groups', async () => {
    const { dnr, rules } = createFakeDnr();
    const workspace = ws(group('g1', [redirect('a'), redirect('b')]), group('g2', [redirect('c')]));
    await applyWorkspace(dnr, workspace);
    expect(rules()).toHaveLength(3);

    workspace.groups[0]!.rules[1]!.enabled = false;
    workspace.groups[1]!.enabled = false;
    const report = await applyWorkspace(dnr, workspace);
    expect(rules()).toHaveLength(1);
    expect(report.applied.map((a) => a.ruleId)).toEqual(['a']);
  });

  it('applies what fits past the 1000-regex ceiling and reports the rest', async () => {
    const { dnr, calls, rules } = createFakeDnr();
    const regexRules = Array.from({ length: 1100 }, (_, i) => regexRedirect(`re${i}`));
    const report = await applyWorkspace(dnr, ws(group('heavy', regexRules), group('plain', [redirect('late')])));

    expect(calls).toHaveLength(1);
    expect(rules().filter((r) => r.condition.regexFilter)).toHaveLength(1000);
    // urlFilter rules after the ceiling still apply.
    expect(report.applied.at(-1)).toMatchObject({ ruleId: 'late' });
    expect(report.refused).toHaveLength(100);
    expect(report.refused[0]).toMatchObject({ ruleId: 're1000', reason: 'regex-limit' });
  });

  it('keeps 1100 urlFilter-able rules entirely, unlike an all-regex compiler', async () => {
    const { dnr, rules } = createFakeDnr();
    const report = await applyWorkspace(dnr, ws(group('g', Array.from({ length: 1100 }, (_, i) => redirect(`u${i}`)))));
    expect(rules()).toHaveLength(1100);
    expect(rules().every((r) => r.condition.urlFilter && !r.condition.regexFilter)).toBe(true);
    expect(report.refused).toEqual([]);
  });

  it('caps unsafe (redirect/header) rules separately from safe block rules', async () => {
    const { dnr } = createFakeDnr({ maxRules: 4, maxUnsafeRules: 2 });
    const report = await applyWorkspace(dnr, ws(group('g', [redirect('a'), redirect('b'), redirect('c'), block('d'), block('e'), block('f')])));
    expect(report.applied.map((a) => a.ruleId)).toEqual(['a', 'b', 'd', 'e']);
    expect(report.refused.map((r) => [r.ruleId, r.reason])).toEqual([
      ['c', 'rule-limit'],
      ['f', 'rule-limit'],
    ]);
  });

  it('drops a rule the browser names in its rejection and retries the batch', async () => {
    const { dnr, calls, rules } = createFakeDnr({
      rejectRule: (r) => (r.condition.urlFilter?.includes('/b.js') ? 'specifies an incorrect value for the "urlFilter" key.' : undefined),
    });
    const report = await applyWorkspace(dnr, ws(group('g', [redirect('a'), redirect('b'), redirect('c')])));
    expect(calls).toHaveLength(2);
    expect(rules()).toHaveLength(2);
    expect(report.refused).toEqual([{ groupId: 'g', ruleId: 'b', reason: 'browser-rejected', message: 'Rule with id 2 specifies an incorrect value for the "urlFilter" key.' }]);
  });

  it('falls back to per-rule adds when a rejection names no rule, instead of applying nothing', async () => {
    const { dnr, rules } = createFakeDnr({ hiddenRegexCap: 2 });
    const report = await applyWorkspace(dnr, ws(group('g', [regexRedirect('a'), regexRedirect('b'), regexRedirect('c'), redirect('d')])));
    expect(report.fallback).toBe(true);
    expect(rules()).toHaveLength(3);
    expect(report.applied.map((a) => a.ruleId)).toEqual(['a', 'b', 'd']);
    expect(report.refused).toEqual([expect.objectContaining({ ruleId: 'c', reason: 'browser-rejected' })]);
  });

  it('pre-checks regexes with isRegexSupported and never sends unsupported ones', async () => {
    const { dnr, calls } = createFakeDnr({ isRegexSupported: (regex) => (regex.includes('(?=') ? { isSupported: false, reason: 'syntaxError' } : { isSupported: true }) });
    const lookahead: Rule = { id: 'la', enabled: true, match: { kind: 'regex', pattern: '^https://a\\.com/(?=x)' }, action: { type: 'block' } };
    const report = await applyWorkspace(dnr, ws(group('g', [lookahead, regexRedirect('ok')])));
    expect(calls[0]!.addRules).toHaveLength(1);
    expect(report.refused).toEqual([expect.objectContaining({ ruleId: 'la', reason: 'unsupported-regex' })]);
  });

  it('feature-detects topDomains so older browsers never see the key', async () => {
    const scoped = ws({ ...group('g', [{ ...redirect('a'), resourceTypes: ['main_frame', 'script'] }]), pageDomains: ['example.com'] });

    const old = createFakeDnr();
    const oldReport = await applyWorkspace(old.dnr, scoped);
    expect(oldReport.refused).toEqual([]);
    expect(old.rules().map((r) => Object.keys(r.condition).filter((k) => k.endsWith('Domains')))).toEqual([['requestDomains'], ['initiatorDomains']]);

    const modern = createFakeDnr({ topDomains: true });
    await applyWorkspace(modern.dnr, scoped);
    expect(modern.rules()[1]!.condition.topDomains).toEqual(['example.com']);
  });

  it('reports both DNR ids of a split rule against the same Detour rule', async () => {
    const { dnr } = createFakeDnr();
    const report = await applyWorkspace(dnr, ws({ ...group('g', [{ ...redirect('a'), resourceTypes: ['main_frame', 'script'] }, redirect('b')]), pageDomains: ['example.com'] }));
    expect(report.applied).toEqual([
      { dnrId: 1, groupId: 'g', ruleId: 'a' },
      { dnrId: 2, groupId: 'g', ruleId: 'a' },
      { dnrId: 3, groupId: 'g', ruleId: 'b' },
    ]);
  });

  it('includes compile refusals in the report', async () => {
    const { dnr } = createFakeDnr();
    const loop: Rule = { id: 'loop', enabled: true, match: { kind: 'glob', pattern: '*' }, action: { type: 'redirect', to: 'http://localhost/' } };
    const report = await applyWorkspace(dnr, ws(group('g', [loop])));
    expect(report.refused).toEqual([expect.objectContaining({ ruleId: 'loop', reason: 'redirect-loop' })]);
  });
});

describe('syncRules', () => {
  beforeEach(() => fakeBrowser.reset());
  const area = fakeBrowser.storage.local;

  it('applies the stored workspace and records a report', async () => {
    const { dnr, rules } = createFakeDnr();
    await saveWorkspace(area, ws(group('g', [redirect('a')])));
    const report = await syncRules(dnr, area, fixedNow);
    expect(rules()).toHaveLength(1);
    expect((await area.get(APPLY_REPORT_KEY))[APPLY_REPORT_KEY]).toEqual(report);
  });

  it('removes every rule while switched off and restores them when switched back on', async () => {
    const { dnr, rules } = createFakeDnr();
    await saveWorkspace(area, ws(group('g', [redirect('a'), redirect('b')])));
    await syncRules(dnr, area);
    expect(rules()).toHaveLength(2);

    await saveEnabled(area, false);
    const off = await syncRules(dnr, area);
    expect(rules()).toEqual([]);
    expect(off).toMatchObject({ disabled: true, applied: [], refused: [] });
    expect((await area.get(WORKSPACE_KEY))[WORKSPACE_KEY]).toBeDefined();

    await saveEnabled(area, true);
    const on = await syncRules(dnr, area);
    expect(rules()).toHaveLength(2);
    expect(on.disabled).toBe(false);
  });

  it('leaves current DNR rules alone when the stored workspace is corrupt', async () => {
    const { dnr, rules } = createFakeDnr();
    await saveWorkspace(area, ws(group('g', [redirect('a')])));
    await syncRules(dnr, area);
    await area.set({ [WORKSPACE_KEY]: { v: 1, data: { groups: [{ id: 'g' }] } } });

    const report = await syncRules(dnr, area, fixedNow);
    expect(rules()).toHaveLength(1);
    expect(report.applied).toEqual([]);
    expect(report.errors[0]).toMatch(/^Stored workspace is invalid/);
  });
});
