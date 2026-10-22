import { describe, expect, it } from 'vitest';
import type { Action, Group, Rule, Workspace } from '../rule-model/schema';
import { siteHost, testUrl } from './page-match';
import { guardCode, planPage } from './plan';

const js = (code: string, extra: Partial<Extract<Action, { type: 'injectJs' }>> = {}): Action => ({
  type: 'injectJs',
  source: { kind: 'inline', code },
  runAt: 'document_start',
  allFrames: false,
  world: 'MAIN',
  ...extra,
});
const css = (code: string): Action => ({ type: 'injectCss', source: { kind: 'inline', code }, runAt: 'document_start', allFrames: false });
const mock = (status = 200): Action => ({ type: 'mock', method: 'GET', status, headers: [], body: '{}', delayMs: 0 });

let n = 0;
const rule = (pattern: string, action: Action, enabled = true): Rule => ({ id: `r${++n}`, enabled, match: { kind: 'glob', pattern }, action });
const group = (rules: Rule[], extra: Partial<Group> = {}): Group => ({ id: `g${++n}`, name: 'g', enabled: true, rules, ...extra });
const ws = (...groups: Group[]): Workspace => ({ groups });

describe('planPage', () => {
  it('splits rules by mechanism and skips network rules', () => {
    const rules = [
      rule('https://app.test/*', js('window.A = 1')),
      rule('https://app.test/*', { type: 'injectJs', source: { kind: 'url', url: 'http://localhost:5173/dev.js' }, runAt: 'document_end', allFrames: true, world: 'MAIN' }),
      rule('https://app.test/*', css('body{color:red}')),
      rule('https://app.test/api/*', mock(201)),
      rule('https://cdn.test/*', { type: 'block' }),
    ];
    const plan = planPage(ws(group(rules)), { userScripts: true });
    expect(plan.userScripts).toHaveLength(1);
    expect(plan.userScripts[0]).toMatchObject({ ruleId: rules[0]!.id, id: `detour-${rules[0]!.id}`, matches: ['<all_urls>'], runAt: 'document_start', world: 'MAIN' });
    expect(plan.config.scripts).toEqual([expect.objectContaining({ url: 'http://localhost:5173/dev.js', runAt: 'document_end', allFrames: true })]);
    expect(plan.config.styles).toEqual([expect.objectContaining({ source: { kind: 'inline', code: 'body{color:red}' } })]);
    expect(plan.config.mocks).toEqual([expect.objectContaining({ status: 201, request: { source: '^https://app\\.test/api/.*?$', flags: 'i' } })]);
    expect(plan.injected.map((i) => i.kind)).toEqual(['js', 'js', 'css', 'mock']);
    expect(plan).toMatchObject({ needsBridge: true, needsMockRuntime: true, refused: [] });
  });

  it('follows group and rule switches', () => {
    const plan = planPage(ws(group([rule('*', css('a{}'), false)]), group([rule('*', mock())], { enabled: false })), { userScripts: true });
    expect(plan).toMatchObject({ userScripts: [], injected: [], needsBridge: false, needsMockRuntime: false });
  });

  it('needs the bridge but not the mock runtime for CSS only', () => {
    expect(planPage(ws(group([rule('*', css('a{}'))])), { userScripts: true })).toMatchObject({ needsBridge: true, needsMockRuntime: false });
  });

  it('refuses inline JS when user scripts are unavailable but keeps URL JS', () => {
    const inline = rule('*', js('x'));
    const fromUrl = rule('*', js('', { source: { kind: 'url', url: 'http://localhost/x.js' } }));
    const plan = planPage(ws(group([inline, fromUrl])), { userScripts: false });
    expect(plan.userScripts).toEqual([]);
    expect(plan.refused).toEqual([expect.objectContaining({ ruleId: inline.id, reason: 'user-scripts-unavailable' })]);
    expect(plan.injected).toEqual([expect.objectContaining({ ruleId: fromUrl.id, kind: 'js' })]);
  });

  it('carries site scoping and case sensitivity into URL tests', () => {
    const r: Rule = { ...rule('https://App.test/*', mock()), caseSensitive: true };
    const plan = planPage(ws(group([r], { pageDomains: ['app.test'] })), { userScripts: true });
    expect(plan.config.mocks[0]!.request).toEqual({ source: '^https://App\\.test/.*?$', flags: '', domains: ['app.test'] });
  });

  it('keeps regex patterns as-is (unanchored like DNR)', () => {
    const r: Rule = { id: 'rx', enabled: true, match: { kind: 'regex', pattern: '/api/v\\d+/' }, action: mock() };
    expect(planPage(ws(group([r])), { userScripts: true }).config.mocks[0]!.request.source).toBe('/api/v\\d+/');
  });
});

describe('testUrl / siteHost', () => {
  it('matches subdomains and rejects other sites', () => {
    const test = { source: '^https://.*$', flags: 'i', domains: ['example.com'] };
    expect(testUrl(test, 'https://a.example.com/', 'a.example.com')).toBe(true);
    expect(testUrl(test, 'https://example.com/', 'example.com')).toBe(true);
    expect(testUrl(test, 'https://notexample.com/', 'notexample.com')).toBe(false);
  });

  it('uses the top ancestor where exposed', () => {
    expect(siteHost({ hostname: 'frame.test', ancestorOrigins: { length: 2, 0: 'https://mid.test', 1: 'https://top.test' } })).toBe('top.test');
    expect(siteHost({ hostname: 'frame.test', ancestorOrigins: { length: 0 } })).toBe('frame.test');
    expect(siteHost({ hostname: 'frame.test' })).toBe('frame.test');
  });

  it('treats an invalid regex as no match', () => {
    expect(testUrl({ source: '(', flags: '' }, 'https://x/', 'x')).toBe(false);
  });
});

describe('guardCode', () => {
  const run = (code: string, href: string, ancestors: string[] = []) => {
    const hostname = new URL(href).hostname;
    const location = { href, hostname, ancestorOrigins: Object.assign([...ancestors], { length: ancestors.length }) };
    const ran: string[] = [];
    new Function('location', 'ran', code)(location, ran);
    return ran;
  };
  const test = { source: '^https://app\\.test/.*?$', flags: 'i', domains: ['app.test'] };

  it('runs the code only on matching pages', () => {
    const code = guardCode('ran.push("yes")', test, 'r1');
    expect(run(code, 'https://app.test/page')).toEqual(['yes']);
    expect(run(code, 'https://other.test/page')).toEqual([]);
  });

  it('scopes iframes by the top site', () => {
    const code = guardCode('ran.push("yes")', { source: '.*', flags: '', domains: ['app.test'] }, 'r1');
    expect(run(code, 'https://widget.test/', ['https://app.test'])).toEqual(['yes']);
    expect(run(code, 'https://widget.test/', ['https://other.test'])).toEqual([]);
  });

  it('survives a trailing line comment and names the source', () => {
    const code = guardCode('ran.push("yes") // done', test, 'r 1');
    expect(run(code, 'https://app.test/')).toEqual(['yes']);
    expect(code.endsWith('//# sourceURL=detour-r%201.js')).toBe(true);
  });
});
