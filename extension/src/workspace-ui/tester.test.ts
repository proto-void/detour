import { describe, expect, it } from 'vitest';
import type { Group, Rule, Workspace } from '../rule-model/schema';
import { describeResolution, resolveProbe, type Probe } from './tester';

const rule = (id: string, action: Rule['action'], extra: Partial<Rule> = {}): Rule => ({
  id,
  enabled: true,
  match: { kind: 'glob', pattern: '*' },
  action,
  ...extra,
});

const group = (id: string, name: string, rules: Rule[], extra: Partial<Group> = {}): Group => ({
  id,
  name,
  enabled: true,
  rules,
  ...extra,
});

const ws = (...groups: Group[]): Workspace => ({ groups });

const redirect = (id: string, pattern: string, to: string, extra: Partial<Rule> = {}) =>
  rule(id, { type: 'redirect', to }, { match: { kind: 'glob', pattern }, resourceTypes: ['main_frame'], ...extra });

const probe = (url: string, extra: Partial<Probe> = {}): Probe => ({ url, ...extra });

const lines = (workspace: Workspace, input: Probe) => describeResolution(resolveProbe(workspace, input));

describe('resolveProbe precedence', () => {
  it('says nothing until there is a URL', () => {
    const view = lines(ws(group('g', 'Local', [redirect('a', '*', 'http://localhost/')])), probe('  '));
    expect(view.headline).toBe('Paste a URL to see which rule wins.');
    expect(view.lines).toEqual([]);
  });

  it('says when nothing matches', () => {
    const view = lines(ws(group('g', 'Local', [redirect('a', 'https://cdn.example.com/*', 'http://localhost/*')])), probe('https://other.test/'));
    expect(view.headline).toBe('No rule matches.');
    expect(view.lines).toEqual([]);
  });

  it('lets the earlier group win over a later one', () => {
    const view = lines(
      ws(
        group('g1', 'First', [redirect('a', 'https://cdn.example.com/*', 'http://first/*')]),
        group('g2', 'Second', [redirect('b', 'https://cdn.example.com/*', 'http://second/*')]),
      ),
      probe('https://cdn.example.com/app.js'),
    );
    expect(view.headline).toBe('This rule wins.');
    expect(view.lines).toEqual([
      { groupName: 'First', summary: 'Redirect https://cdn.example.com/*', outcome: 'Redirects to http://first/app.js.' },
    ]);
  });

  it('lets the earlier rule in a group win', () => {
    const view = lines(
      ws(group('g', 'Local', [redirect('a', 'https://cdn.example.com/*', 'http://first/'), redirect('b', 'https://cdn.example.com/*', 'http://second/')])),
      probe('https://cdn.example.com/app.js'),
    );
    expect(view.lines[0]).toMatchObject({ outcome: 'Redirects to http://first/.' });
  });

  it('skips a rule or group that is off and uses the next match', () => {
    const offRule = lines(
      ws(group('g', 'Local', [redirect('a', 'https://cdn.example.com/*', 'http://off/', { enabled: false }), redirect('b', 'https://cdn.example.com/*', 'http://on/')])),
      probe('https://cdn.example.com/a'),
    );
    expect(offRule.lines[0]).toMatchObject({ outcome: 'Redirects to http://on/.' });

    const offGroup = lines(
      ws(
        group('g1', 'Off', [redirect('a', 'https://cdn.example.com/*', 'http://off/')], { enabled: false }),
        group('g2', 'On', [redirect('b', 'https://cdn.example.com/*', 'http://on/')]),
      ),
      probe('https://cdn.example.com/a'),
    );
    expect(offGroup.lines[0]).toMatchObject({ groupName: 'On', outcome: 'Redirects to http://on/.' });
  });

  it('does not let a refused redirect win', () => {
    const view = lines(
      ws(
        group('g', 'Local', [
          redirect('loop', '*/loop.js', 'http://127.0.0.1:8002/loop.js'),
          redirect('ok', '*/ok.js', 'http://127.0.0.1:8002/ok.js'),
        ]),
      ),
      probe('http://127.0.0.1:8001/loop.js'),
    );
    expect(view.lines).toEqual([]);
    expect(view.headline).toBe('No rule is applied.');
    expect(view.notes[0]).toMatch(/Local/);
    expect(view.notes[0]).toMatch(/loop/);
  });

  it('uses a later valid rule when an earlier one is refused', () => {
    const view = lines(
      ws(group('g', 'Local', [redirect('loop', '*', 'http://cdn.example.com/app.js'), redirect('ok', 'https://cdn.example.com/*', 'http://localhost/app.js')])),
      probe('https://cdn.example.com/app.js'),
    );
    expect(view.lines[0]).toMatchObject({ summary: 'Redirect https://cdn.example.com/*', outcome: 'Redirects to http://localhost/app.js.' });
    expect(view.notes.some((n) => /not applied/i.test(n))).toBe(true);
  });

  it('matches a page load only when the rule includes main_frame', () => {
    const scriptOnly = redirect('a', 'https://cdn.example.com/*', 'http://localhost/*', { resourceTypes: ['script'] });
    expect(lines(ws(group('g', 'Local', [scriptOnly])), probe('https://cdn.example.com/app.js')).headline).toBe('No rule matches.');
    expect(lines(ws(group('g', 'Local', [scriptOnly])), probe('https://cdn.example.com/app.js', { resourceType: 'script' })).lines[0]?.outcome).toBe(
      'Redirects to http://localhost/app.js.',
    );
  });

  it('treats an omitted resource type list as everything except a page load', () => {
    const implicit = redirect('a', 'https://cdn.example.com/*', 'http://localhost/*', { resourceTypes: undefined });
    expect(lines(ws(group('g', 'Local', [implicit])), probe('https://cdn.example.com/app.js')).headline).toBe('No rule matches.');
    expect(lines(ws(group('g', 'Local', [implicit])), probe('https://cdn.example.com/app.js', { resourceType: 'script' })).lines).toHaveLength(1);
  });

  it('scopes a page load by the request host, including subdomains', () => {
    const scoped = group('g', 'App', [redirect('a', 'https://*example.com/*', 'http://localhost/', { resourceTypes: ['main_frame'] })], {
      pageDomains: ['example.com'],
    });
    expect(lines(ws(scoped), probe('https://app.example.com/')).lines).toHaveLength(1);
    expect(lines(ws(scoped), probe('https://example.com/')).lines).toHaveLength(1);
    expect(lines(ws(scoped), probe('https://evil-example.com/')).headline).toBe('No rule matches.');
    expect(lines(ws(scoped), probe('https://cdn.other.test/app.js')).headline).toBe('No rule matches.');
  });

  it('scopes a subresource by the page host, not the request host', () => {
    const scoped = group('g', 'App', [redirect('a', 'https://cdn.example.com/*', 'http://localhost/*', { resourceTypes: ['script'] })], {
      pageDomains: ['app.example.com'],
    });
    const url = 'https://cdn.example.com/app.js';
    expect(lines(ws(scoped), probe(url, { resourceType: 'script', pageUrl: 'https://app.example.com/' })).lines).toHaveLength(1);
    expect(lines(ws(scoped), probe(url, { resourceType: 'script', pageUrl: 'https://other.test/' })).headline).toBe('No rule matches.');
  });

  it('is case-insensitive unless the rule says otherwise', () => {
    const pattern = 'https://cdn.example.com/App.js';
    const sensitive = redirect('a', pattern, 'http://localhost/app.js', { caseSensitive: true, resourceTypes: ['script'] });
    expect(lines(ws(group('g', 'Local', [sensitive])), probe('https://cdn.example.com/app.js', { resourceType: 'script' })).headline).toBe('No rule matches.');
    expect(lines(ws(group('g', 'Local', [redirect('a', pattern, 'http://localhost/app.js', { resourceTypes: ['script'] })])), probe('https://cdn.example.com/app.js', { resourceType: 'script' })).lines).toHaveLength(1);
  });

  it('expands regex substitutions the way the compiler does', () => {
    const view = lines(
      ws(
        group('g', 'Local', [
          rule('a', { type: 'redirect', to: 'http://localhost/\\1' }, { match: { kind: 'regex', pattern: '^https://cdn\\.example\\.com/(.+)$' }, resourceTypes: ['script'] }),
        ]),
      ),
      probe('https://cdn.example.com/app.js', { resourceType: 'script' }),
    );
    expect(view.lines[0]?.outcome).toBe('Redirects to http://localhost/app.js.');
  });
});

describe('resolveProbe action lanes', () => {
  it('lets the first matching mock win a fetch, and ignores network rules', () => {
    const view = lines(
      ws(
        group('g', 'API', [
          redirect('redir', '*/api/*', 'http://127.0.0.1:9/mocked', { resourceTypes: ['xmlhttprequest'] }),
          rule('mock', { type: 'mock', method: 'GET', status: 201, headers: [{ name: 'content-type', value: 'application/json' }], body: '{"ok":true}', delayMs: 0 }, { match: { kind: 'glob', pattern: '*/api/*' } }),
          rule('later', { type: 'mock', method: 'ANY', status: 500, headers: [], body: 'no', delayMs: 0 }, { match: { kind: 'glob', pattern: '*/api/*' } }),
        ]),
      ),
      probe('https://app.example.com/api/items', { resourceType: 'xmlhttprequest', method: 'GET' }),
    );
    expect(view.headline).toBe('This rule wins.');
    expect(view.lines).toEqual([
      {
        groupName: 'API',
        summary: 'Mock GET */api/*',
        outcome: 'Returns 201 with body "{\\"ok\\":true}".',
      },
    ]);
  });

  it('does not let a mock win a script request, and respects method', () => {
    const mock = rule('mock', { type: 'mock', method: 'GET', status: 201, headers: [], body: '{}', delayMs: 0 }, { match: { kind: 'glob', pattern: '*/api/*' } });
    const redir = redirect('redir', '*/api/*', 'http://127.0.0.1:9/mocked', { resourceTypes: ['script', 'xmlhttprequest'] });
    expect(lines(ws(group('g', 'API', [mock, redir])), probe('https://app.example.com/api/a', { resourceType: 'script' })).lines[0]).toMatchObject({
      outcome: 'Redirects to http://127.0.0.1:9/mocked.',
    });
    expect(lines(ws(group('g', 'API', [mock])), probe('https://app.example.com/api/a', { resourceType: 'xmlhttprequest', method: 'POST' })).headline).toBe('No rule matches.');
  });

  it('sends no mock body for HEAD and empty statuses', () => {
    const mock = rule('mock', { type: 'mock', method: 'ANY', status: 204, headers: [], body: 'hidden', delayMs: 0 }, { match: { kind: 'glob', pattern: '*' } });
    expect(lines(ws(group('g', 'API', [mock])), probe('https://app.example.com/api', { resourceType: 'xmlhttprequest' })).lines[0]?.outcome).toBe('Returns 204 with no body.');
  });

  it('applies every matching header rule, with the earlier set winning and a later append kept', () => {
    const first = rule('a', { type: 'modifyHeaders', request: [], response: [{ op: 'set', name: 'X-Debug', value: '1' }] }, { match: { kind: 'glob', pattern: '*' }, resourceTypes: ['script'] });
    const second = rule(
      'b',
      {
        type: 'modifyHeaders',
        request: [],
        response: [
          { op: 'set', name: 'x-debug', value: '2' },
          { op: 'append', name: 'X-Debug', value: 'extra' },
        ],
      },
      { match: { kind: 'glob', pattern: '*' }, resourceTypes: ['script'] },
    );
    const view = lines(ws(group('g', 'CORS', [first]), group('h', 'More', [second])), probe('https://cdn.example.com/a.js', { resourceType: 'script' }));
    expect(view.headline).toBe('These header rules apply.');
    expect(view.lines.map((l) => l.outcome)).toEqual(['Sets response X-Debug: 1.', 'Appends response X-Debug: extra.']);
  });

  it('shows a block as the winner and still lists header rules', () => {
    const view = lines(
      ws(
        group('g', 'Ads', [
          rule('block', { type: 'block' }, { match: { kind: 'glob', pattern: '*ads*' }, resourceTypes: ['script'] }),
          rule('h', { type: 'modifyHeaders', request: [{ op: 'remove', name: 'Cookie' }], response: [] }, { match: { kind: 'glob', pattern: '*' }, resourceTypes: ['script'] }),
        ]),
      ),
      probe('https://ads.example/a.js', { resourceType: 'script' }),
    );
    expect(view.headline).toBe('This rule wins.');
    expect(view.lines.map((l) => [l.summary, l.outcome])).toEqual([
      ['Block *ads*', 'Blocks the request.'],
      ['Change headers *', 'Removes request Cookie.'],
    ]);
  });

  it('runs every matching inject on a page that loads', () => {
    const view = lines(
      ws(
        group('g', 'Page', [
          rule('js', { type: 'injectJs', source: { kind: 'inline', code: 'window.X = 1' }, runAt: 'document_start', allFrames: false, world: 'MAIN' }, { match: { kind: 'glob', pattern: 'https://app.example.com/*' } }),
          rule('css', { type: 'injectCss', source: { kind: 'url', url: 'https://localhost/a.css' }, runAt: 'document_start', allFrames: false }, { match: { kind: 'glob', pattern: 'https://app.example.com/*' } }),
        ]),
      ),
      probe('https://app.example.com/'),
    );
    expect(view.headline).toBe('These rules run on this page.');
    expect(view.lines.map((l) => l.outcome)).toEqual(['Injects JavaScript.', 'Injects CSS from https://localhost/a.css.']);
  });

  it('does not inject into a page load that is redirected or blocked', () => {
    const inject = rule('js', { type: 'injectJs', source: { kind: 'inline', code: 'window.X = 1' }, runAt: 'document_start', allFrames: false, world: 'MAIN' }, { match: { kind: 'glob', pattern: '*' } });
    const redirected = lines(
      ws(group('g', 'Page', [redirect('r', 'https://app.example.com/*', 'http://localhost/', { resourceTypes: ['main_frame'] }), inject])),
      probe('https://app.example.com/'),
    );
    expect(redirected.lines.map((l) => l.summary)).toEqual(['Redirect https://app.example.com/*']);
    expect(redirected.notes.some((n) => /do not run/i.test(n) && /redirected/i.test(n))).toBe(true);

    const blocked = lines(ws(group('g', 'Page', [rule('b', { type: 'block' }, { match: { kind: 'glob', pattern: '*' }, resourceTypes: ['main_frame'] }), inject])), probe('https://app.example.com/'));
    expect(blocked.lines.map((l) => l.outcome)).toEqual(['Blocks the request.']);
    expect(blocked.notes.some((n) => /blocked/i.test(n))).toBe(true);
  });

  it('still injects on the page when a subresource is redirected', () => {
    const view = lines(
      ws(
        group('g', 'Page', [
          rule('js', { type: 'injectJs', source: { kind: 'url', url: 'https://localhost/a.js' }, runAt: 'document_start', allFrames: false, world: 'MAIN' }, { match: { kind: 'glob', pattern: 'https://app.example.com/' } }),
          redirect('r', 'https://cdn.example.com/*', 'http://localhost/*', { resourceTypes: ['script'] }),
        ]),
      ),
      probe('https://cdn.example.com/app.js', { resourceType: 'script', pageUrl: 'https://app.example.com/' }),
    );
    expect(view.lines.map((l) => l.outcome)).toEqual(['Redirects to http://localhost/app.js.', 'Injects JavaScript from https://localhost/a.js.']);
  });

  it('skips top-frame-only injects when the page is inside a frame', () => {
    const inject = rule('js', { type: 'injectJs', source: { kind: 'inline', code: 'window.X = 1' }, runAt: 'document_start', allFrames: false, world: 'MAIN' }, { match: { kind: 'glob', pattern: '*' } });
    expect(lines(ws(group('g', 'Page', [inject])), probe('https://app.example.com/frame.html', { resourceType: 'sub_frame' })).headline).toBe('No rule matches.');
    const all = rule('js', { type: 'injectJs', source: { kind: 'inline', code: 'window.X = 1' }, runAt: 'document_start', allFrames: true, world: 'MAIN' }, { match: { kind: 'glob', pattern: '*' } });
    expect(lines(ws(group('g', 'Page', [all])), probe('https://app.example.com/widget', { resourceType: 'script', subframe: true })).lines).toHaveLength(1);
  });

  it('does not apply inline JavaScript when user scripts are off', () => {
    const inject = rule('js', { type: 'injectJs', source: { kind: 'inline', code: 'window.X = 1' }, runAt: 'document_start', allFrames: false, world: 'MAIN' }, { match: { kind: 'glob', pattern: '*' } });
    const css = rule('css', { type: 'injectCss', source: { kind: 'inline', code: 'h1{}' }, runAt: 'document_start', allFrames: false }, { match: { kind: 'glob', pattern: '*' } });
    const view = lines(ws(group('g', 'Page', [inject, css])), probe('https://app.example.com/', { userScripts: false }));
    expect(view.lines.map((l) => l.summary)).toEqual(['Inject CSS *']);
    expect(view.notes.some((n) => /user scripts/i.test(n))).toBe(true);
  });

  it('lets an earlier in-place body replacement win, and notes a redirect on the same URL', () => {
    const body = rule(
      'body',
      { type: 'overrideBody', body: 'local', contentType: 'text/javascript', delivery: 'inPlace' },
      { match: { kind: 'glob', pattern: 'https://cdn.example.com/*.js' }, resourceTypes: ['script'] },
    );
    const later = redirect('r', 'https://cdn.example.com/*', 'http://127.0.0.1/*', { resourceTypes: ['script'] });
    const view = lines(ws(group('g', 'Files', [body, later])), probe('https://cdn.example.com/app.js', { resourceType: 'script' }));
    expect(view.headline).toBe('This rule wins.');
    expect(view.lines.map((line) => line.outcome)).toEqual(['Replaces the response body and sets Content-Type to text/javascript.']);
    expect(view.notes.some((note) => /redirect/i.test(note) && /body/i.test(note))).toBe(true);

    const redirectFirst = lines(ws(group('g', 'Files', [later, body])), probe('https://cdn.example.com/app.js', { resourceType: 'script' }));
    expect(redirectFirst.lines[0]?.outcome).toMatch(/^Redirects to /);
    expect(redirectFirst.notes.some((note) => /body replacement/i.test(note))).toBe(true);
  });

  it('attributes redirect-delivery body rules as a truncated data: redirect', () => {
    const body = rule(
      'body',
      { type: 'overrideBody', body: '{"ok":true}', delivery: 'redirect' },
      { match: { kind: 'glob', pattern: 'https://cdn.example.com/switch.json' }, resourceTypes: ['xmlhttprequest'] },
    );
    const view = lines(ws(group('g', 'JSON', [body])), probe('https://cdn.example.com/switch.json', { resourceType: 'xmlhttprequest' }));
    expect(view.headline).toBe('This rule wins.');
    expect(view.lines[0]?.outcome).toBe('Body replaced (redirect) → data:application/json (11 bytes).');
  });

  it('lets a fetch mock win over a body replacement', () => {
    const mock = rule('m', { type: 'mock', method: 'ANY', status: 201, headers: [], body: '{}', delayMs: 0 }, { match: { kind: 'glob', pattern: '*' } });
    const body = rule(
      'b',
      { type: 'overrideBody', body: 'nope', delivery: 'inPlace' },
      { match: { kind: 'glob', pattern: '*' }, resourceTypes: ['xmlhttprequest'] },
    );
    const view = lines(ws(group('g', 'API', [body, mock])), probe('https://api.example.com/x', { resourceType: 'xmlhttprequest' }));
    expect(view.lines.map((line) => line.outcome)).toEqual(['Returns 201 with body "{}".']);
  });

  it('describes a local file without a bridge token', () => {
    const local = rule('s', { type: 'serveLocal', path: 'assets/app.js' }, { match: { kind: 'glob', pattern: 'https://cdn.example.com/*.js' }, resourceTypes: ['script'] });
    const view = lines(ws(group('g', 'Disk', [local])), probe('https://cdn.example.com/app.js', { resourceType: 'script' }));
    expect(view.headline).toBe('This rule wins.');
    expect(view.lines[0]?.outcome).toContain('assets/app.js');
    expect(view.lines[0]?.outcome).not.toMatch(/[0-9a-f]{64}/);
  });

  it('scopes mocks and injects to the page host', () => {
    const mock = rule('mock', { type: 'mock', method: 'ANY', status: 200, headers: [], body: 'ok', delayMs: 0 }, { match: { kind: 'glob', pattern: '*' } });
    const scoped = group('g', 'App', [mock], { pageDomains: ['app.example.com'] });
    expect(lines(ws(scoped), probe('https://cdn.example.com/api', { resourceType: 'xmlhttprequest', pageUrl: 'https://app.example.com/' })).lines).toHaveLength(1);
    expect(lines(ws(scoped), probe('https://cdn.example.com/api', { resourceType: 'xmlhttprequest', pageUrl: 'https://other.test/' })).headline).toBe('No rule matches.');
  });
});
