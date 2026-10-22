import { describe, expect, it } from 'vitest';
import { matchesUrl } from '../rule-model/match';
import type { Rule, Workspace } from '../rule-model/schema';
import { compileRule, compileWorkspace, globToUrlFilter, scopeToPages, toRegexSubstitution } from './compile';

/** Reference implementation of DNR urlFilter syntax (`*`, `|`, `||`, `^`) for cross-checking. */
function urlFilterRegExp(filter: string, caseSensitive: boolean): RegExp {
  let body = filter;
  let prefix = '';
  let suffix = '';
  if (body.startsWith('||')) [prefix, body] = ['^[a-z][a-z0-9+.-]*://([^/]*\\.)?', body.slice(2)];
  else if (body.startsWith('|')) [prefix, body] = ['^', body.slice(1)];
  if (body.endsWith('|')) [suffix, body] = ['$', body.slice(0, -1)];
  const source = [...body]
    .map((c) => (c === '*' ? '.*' : c === '^' ? '(?:[^A-Za-z0-9_.%-]|$)' : c.replace(/[.+?${}()|[\]\\/]/g, '\\$&')))
    .join('');
  return new RegExp(prefix + source + suffix, caseSensitive ? '' : 'i');
}

/** Applies a compiled redirect the way DNR does: first match of regexFilter replaced by the substitution. */
function simulateSubstitution(regexFilter: string, substitution: string, url: string): string {
  return url.replace(new RegExp(regexFilter, 'i'), substitution.replace(/\\(\d)/g, '$$$1'));
}

const rule = (overrides: Partial<Rule>): Rule => ({
  id: 'r',
  enabled: true,
  match: { kind: 'glob', pattern: 'https://cdn.example.com/*' },
  action: { type: 'block' },
  ...overrides,
});

describe('globToUrlFilter', () => {
  it.each([
    ['https://cdn.example.com/app.js', '|https://cdn.example.com/app.js|'],
    ['https://cdn.example.com/*', '|https://cdn.example.com/*'],
    ['*://*.example.com/*.js', '*://*.example.com/*.js|'],
    ['**/x/**', '*/x/*'],
  ])('%s → %s', (glob, urlFilter) => {
    expect(globToUrlFilter(glob)).toEqual({ urlFilter });
  });

  it('matches everything for a bare wildcard', () => {
    expect(globToUrlFilter('***')).toEqual({});
  });

  it('refuses globs containing urlFilter operators', () => {
    expect(globToUrlFilter('https://a.com/a|b')).toBeUndefined();
    expect(globToUrlFilter('https://a.com/a^b')).toBeUndefined();
  });

  const urls = [
    'https://cdn.example.com/app.js',
    'https://cdn.example.com/app.js?v=2',
    'https://www.example.com/static/app.js',
    'http://cdn.example.com/app.js',
    'https://evil.com/?u=https://cdn.example.com/app.js',
    'https://CDN.example.com/App.JS',
  ];
  const globs = ['https://cdn.example.com/app.js', 'https://cdn.example.com/*', '*://*.example.com/*.js', '*app.js*', 'https://*/app.js'];

  it.each(globs)('urlFilter for %s agrees with the glob matcher', (pattern) => {
    const { urlFilter } = globToUrlFilter(pattern)!;
    for (const caseSensitive of [false, true]) {
      for (const url of urls) {
        expect([url, urlFilterRegExp(urlFilter!, caseSensitive).test(url)]).toEqual([url, matchesUrl({ kind: 'glob', pattern }, url, caseSensitive)]);
      }
    }
  });
});

describe('compileRule', () => {
  it('uses urlFilter for a plain glob redirect', () => {
    const result = compileRule(rule({ action: { type: 'redirect', to: 'http://localhost:5173/app.js' } }));
    expect(result).toEqual({
      ok: true,
      value: {
        regex: false,
        unsafe: true,
        action: { type: 'redirect', redirect: { url: 'http://localhost:5173/app.js' } },
        condition: { urlFilter: '|https://cdn.example.com/*', isUrlFilterCaseSensitive: false },
      },
    });
  });

  it('falls back to regexFilter + regexSubstitution when the target reuses wildcards', () => {
    const result = compileRule(
      rule({ match: { kind: 'glob', pattern: 'https://*.example.com/*/app.js' }, action: { type: 'redirect', to: 'http://*.localhost:8080/app.js' } }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.regex).toBe(true);
    // Only the first wildcard is captured because the target only uses one.
    expect(result.value.condition.regexFilter).toBe('^https://(.*?)\\.example\\.com/.*?/app\\.js$');
    expect(result.value.action).toEqual({ type: 'redirect', redirect: { regexSubstitution: 'http://\\1.localhost:8080/app.js' } });
  });

  it('produces substitutions that rewrite URLs like Resource Override did', () => {
    const result = compileRule(
      rule({ match: { kind: 'glob', pattern: 'https://cdn.example.com/*/*.js' }, action: { type: 'redirect', to: 'http://localhost:8080/*/*.js' } }),
    );
    if (!result.ok || result.value.action.type !== 'redirect' || !('regexSubstitution' in result.value.action.redirect)) throw new Error('expected substitution');
    expect(simulateSubstitution(result.value.condition.regexFilter!, result.value.action.redirect.regexSubstitution, 'https://cdn.example.com/v2/app.js')).toBe(
      'http://localhost:8080/v2/app.js',
    );
  });

  it('uses regexFilter for regex rules and keeps backreferences', () => {
    const result = compileRule(rule({ match: { kind: 'regex', pattern: '^https://cdn\\.x\\.com/(.*)$' }, action: { type: 'redirect', to: 'http://localhost/\\1' } }));
    expect(result.ok && result.value).toMatchObject({ regex: true, condition: { regexFilter: '^https://cdn\\.x\\.com/(.*)$' }, action: { redirect: { regexSubstitution: 'http://localhost/\\1' } } });
  });

  it('compiles block as a safe rule and passes resource types and case sensitivity through', () => {
    const result = compileRule(rule({ resourceTypes: ['script', 'main_frame'], caseSensitive: true }));
    expect(result).toEqual({
      ok: true,
      value: {
        regex: false,
        unsafe: false,
        action: { type: 'block' },
        condition: { urlFilter: '|https://cdn.example.com/*', isUrlFilterCaseSensitive: true, resourceTypes: ['script', 'main_frame'] },
      },
    });
  });

  it('maps header operations and omits empty sides', () => {
    const result = compileRule(
      rule({
        action: {
          type: 'modifyHeaders',
          request: [],
          response: [
            { op: 'set', name: 'access-control-allow-origin', value: '*' },
            { op: 'remove', name: 'content-security-policy' },
          ],
        },
      }),
    );
    expect(result.ok && result.value.action).toEqual({
      type: 'modifyHeaders',
      responseHeaders: [
        { header: 'access-control-allow-origin', operation: 'set', value: '*' },
        { header: 'content-security-policy', operation: 'remove' },
      ],
    });
  });

  it('escapes literal backslashes in substitutions', () => {
    expect(toRegexSubstitution('http://h/a\\b/*')).toBe('http://h/a\\\\b/\\1');
  });

  it.each([
    ['non-ascii-pattern', rule({ match: { kind: 'glob', pattern: 'https://café.com/*' } })],
    ['invalid-redirect', rule({ action: { type: 'redirect', to: 'localhost:5173/app.js' } })],
    ['invalid-redirect', rule({ action: { type: 'redirect', to: 'javascript:alert(1)' } })],
    ['invalid-redirect', rule({ action: { type: 'redirect', to: 'http://exa mple.com/' } })],
    ['too-many-captures', rule({ action: { type: 'redirect', to: 'http://localhost/*/*' } })],
    ['too-many-captures', rule({ match: { kind: 'glob', pattern: 'https://h/' + '*/'.repeat(10) }, action: { type: 'redirect', to: 'http://l/' + '*/'.repeat(10) } })],
    ['redirect-loop', rule({ action: { type: 'redirect', to: 'https://cdn.example.com/other.js' } })],
  ])('refuses %s', (reason, input) => {
    expect(compileRule(input)).toMatchObject({ ok: false, reason });
  });
});

describe('scopeToPages', () => {
  const base = (resourceTypes?: Rule['resourceTypes']) => {
    const result = compileRule(rule({ ...(resourceTypes && { resourceTypes }) }));
    if (!result.ok) throw new Error('compile failed');
    return result.value;
  };

  it('splits page loads (requestDomains) from subresources (initiatorDomains)', () => {
    const scoped = scopeToPages(base(['main_frame', 'script', 'xmlhttprequest']), ['app.example.com']);
    expect(scoped.map((c) => c.condition)).toEqual([
      { urlFilter: '|https://cdn.example.com/*', isUrlFilterCaseSensitive: false, resourceTypes: ['main_frame'], requestDomains: ['app.example.com'] },
      { urlFilter: '|https://cdn.example.com/*', isUrlFilterCaseSensitive: false, resourceTypes: ['script', 'xmlhttprequest'], initiatorDomains: ['app.example.com'] },
    ]);
  });

  it('uses topDomains for subresources when the browser supports it', () => {
    const [main, sub] = scopeToPages(base(['main_frame', 'script']), ['example.com'], { topDomains: true });
    expect(main!.condition).toMatchObject({ requestDomains: ['example.com'] });
    expect(main!.condition).not.toHaveProperty('topDomains');
    expect(sub!.condition).toMatchObject({ resourceTypes: ['script'], topDomains: ['example.com'] });
    expect(sub!.condition).not.toHaveProperty('initiatorDomains');
  });

  it('keeps the DNR default (no main_frame) as a single rule', () => {
    const scoped = scopeToPages(base(), ['example.com']);
    expect(scoped).toHaveLength(1);
    expect(scoped[0]!.condition).toEqual({ urlFilter: '|https://cdn.example.com/*', isUrlFilterCaseSensitive: false, initiatorDomains: ['example.com'] });
  });

  it('emits only the page-load rule for main_frame-only rules', () => {
    const scoped = scopeToPages(base(['main_frame']), ['example.com']);
    expect(scoped.map((c) => c.condition.resourceTypes)).toEqual([['main_frame']]);
  });
});

describe('compileWorkspace', () => {
  it('scopes rules of groups with pageDomains, keeping both halves adjacent and owned by the rule', () => {
    const { candidates } = compileWorkspace({
      groups: [
        { id: 'g', name: 'g', enabled: true, pageDomains: ['example.com'], rules: [rule({ id: 'a', resourceTypes: ['main_frame', 'script'] }), rule({ id: 'b' })] },
      ],
    });
    expect(candidates.map((c) => [c.ruleId, c.condition.resourceTypes])).toEqual([
      ['a', ['main_frame']],
      ['a', ['script']],
      ['b', undefined],
    ]);
  });

  const ws: Workspace = {
    groups: [
      { id: 'g1', name: 'first', enabled: true, rules: [rule({ id: 'a' }), rule({ id: 'b', enabled: false }), rule({ id: 'c' })] },
      { id: 'g2', name: 'off', enabled: false, rules: [rule({ id: 'd' })] },
      { id: 'g3', name: 'last', enabled: true, rules: [rule({ id: 'e', action: { type: 'redirect', to: 'nope' } }), rule({ id: 'f' })] },
    ],
  };

  it('keeps workspace order, skips disabled groups/rules, and reports refusals with ids', () => {
    const { candidates, refused } = compileWorkspace(ws);
    expect(candidates.map((c) => `${c.groupId}/${c.ruleId}`)).toEqual(['g1/a', 'g1/c', 'g3/f']);
    expect(refused).toEqual([expect.objectContaining({ groupId: 'g3', ruleId: 'e', reason: 'invalid-redirect' })]);
  });
});

describe('page actions', () => {
  it('are skipped by the DNR compiler (page and in-place body rules use their own engines)', () => {
    const ws: Workspace = {
      groups: [
        {
          id: 'g',
          name: 'g',
          enabled: true,
          rules: [
            { id: 'js', enabled: true, match: { kind: 'glob', pattern: '*' }, action: { type: 'injectJs', source: { kind: 'inline', code: 'x' }, runAt: 'document_start', allFrames: false, world: 'MAIN' } },
            { id: 'mock', enabled: true, match: { kind: 'glob', pattern: '*/api/*' }, action: { type: 'mock', method: 'ANY', status: 200, headers: [], body: '', delayMs: 0 } },
            { id: 'body', enabled: true, match: { kind: 'glob', pattern: 'https://cdn.example.com/a.js' }, action: { type: 'overrideBody', body: 'x', delivery: 'inPlace' }, resourceTypes: ['script'] },
            { id: 'b', enabled: true, match: { kind: 'glob', pattern: '*ads*' }, action: { type: 'block' } },
          ],
        },
      ],
    };
    const { candidates, refused } = compileWorkspace(ws);
    expect(candidates.map((c) => c.ruleId)).toEqual(['b']);
    expect(refused).toEqual([]);
    expect(() => compileRule(ws.groups[0]!.rules[0]!)).toThrow(/not a network rule/);
  });
});

describe('overrideBody redirect delivery', () => {
  it('compiles switch.json to a data: URL with application/json', () => {
    const ws: Workspace = {
      groups: [
        {
          id: 'g',
          name: 'g',
          enabled: true,
          rules: [
            {
              id: 'switch',
              enabled: true,
              match: { kind: 'glob', pattern: 'https://qa07.example.com/*/switch.json' },
              action: { type: 'overrideBody', body: '{"route":"/cloud/serveflow"}', delivery: 'redirect' },
              resourceTypes: ['xmlhttprequest'],
            },
          ],
        },
      ],
    };
    const { candidates, refused } = compileWorkspace(ws);
    expect(refused).toEqual([]);
    expect(candidates).toHaveLength(1);
    const action = candidates[0]!.action;
    expect(action.type).toBe('redirect');
    if (action.type !== 'redirect' || !('url' in action.redirect)) throw new Error('expected static redirect');
    const url = action.redirect.url;
    expect(url.startsWith('data:application/json;charset=UTF-8;base64,')).toBe(true);
    const b64 = url.slice('data:application/json;charset=UTF-8;base64,'.length);
    expect(Buffer.from(b64, 'base64').toString('utf8')).toBe('{"route":"/cloud/serveflow"}');
    expect(candidates[0]!.condition.urlFilter).toBeTruthy();
    expect(candidates[0]!.condition.regexFilter).toBeUndefined();
  });

  it('round-trips a non-ASCII body and uses contentType when set', () => {
    const body = 'console.log("café");';
    const ws: Workspace = {
      groups: [
        {
          id: 'g',
          name: 'g',
          enabled: true,
          rules: [
            {
              id: 'js',
              enabled: true,
              match: { kind: 'glob', pattern: 'https://cdn.example.com/app.js' },
              action: { type: 'overrideBody', body, contentType: 'text/javascript', delivery: 'redirect' },
              resourceTypes: ['script'],
            },
          ],
        },
      ],
    };
    const { candidates } = compileWorkspace(ws);
    const action = candidates[0]!.action;
    expect(action.type).toBe('redirect');
    if (action.type !== 'redirect' || !('url' in action.redirect)) throw new Error('expected static redirect');
    expect(action.redirect.url.startsWith('data:text/javascript;charset=UTF-8;base64,')).toBe(true);
    const b64 = action.redirect.url.slice('data:text/javascript;charset=UTF-8;base64,'.length);
    expect(Buffer.from(b64, 'base64').toString('utf8')).toBe(body);
  });

  it('defaults missing delivery to redirect', () => {
    const ws: Workspace = {
      groups: [
        {
          id: 'g',
          name: 'g',
          enabled: true,
          rules: [
            {
              id: 'css',
              enabled: true,
              match: { kind: 'glob', pattern: 'https://cdn.example.com/x.css' },
              action: { type: 'overrideBody', body: 'x{}', delivery: 'redirect' },
              resourceTypes: ['stylesheet'],
            },
          ],
        },
      ],
    };
    const { candidates } = compileWorkspace(ws);
    const action = candidates[0]!.action;
    expect(action.type).toBe('redirect');
    if (action.type !== 'redirect' || !('url' in action.redirect)) throw new Error('expected static redirect');
    expect(action.redirect.url.startsWith('data:text/css;charset=UTF-8;base64,')).toBe(true);
  });
});

describe('serveLocal', () => {
  const token = 'ab'.repeat(32);
  const rule = {
    id: 's',
    enabled: true,
    match: { kind: 'glob' as const, pattern: 'https://cdn.example.com/*.js' },
    action: { type: 'serveLocal' as const, path: 'assets/app.js' },
    resourceTypes: ['script' as const],
  };
  const ws: Workspace = { groups: [{ id: 'g', name: 'g', enabled: true, rules: [rule] }] };

  it('stays out of DNR until the bridge is connected and healthy', () => {
    expect(compileWorkspace(ws).refused.map((r) => r.reason)).toEqual(['bridge-not-connected']);
    const down = compileWorkspace(ws, { bridge: { session: { port: 47321, token }, up: false } });
    expect(down.candidates).toEqual([]);
    expect(down.refused.map((r) => r.reason)).toEqual(['bridge-down']);
    expect(JSON.stringify(down)).not.toContain(token);
  });

  it('compiles to an opaque loopback redirect that a *.js pattern does not also match', () => {
    const { candidates, refused } = compileWorkspace(ws, { bridge: { session: { port: 47321, token }, up: true } });
    expect(refused).toEqual([]);
    const url = candidates[0]?.action.type === 'redirect' ? candidates[0].action.redirect : undefined;
    expect(url).toEqual({ url: `http://127.0.0.1:47321/d/${token}/YXNzZXRzL2FwcC5qcw` });
    expect(JSON.stringify(candidates[0]?.condition)).toContain('cdn.example.com');
  });

  it('refuses a pattern that would also match the bridge, without the token', () => {
    const broad: Workspace = { groups: [{ id: 'g', name: 'g', enabled: true, rules: [{ ...rule, match: { kind: 'glob', pattern: '*' } }] }] };
    const { refused } = compileWorkspace(broad, { bridge: { session: { port: 47321, token }, up: true } });
    expect(refused.map((r) => r.reason)).toEqual(['redirect-loop']);
    expect(refused[0]?.message).not.toContain(token);
  });

  it('emits no redirect when the body engine will serve the file in place', () => {
    const { candidates, refused } = compileWorkspace(ws, { bridge: { session: { port: 47321, token }, up: true, inPlace: true } });
    expect(candidates).toEqual([]);
    expect(refused).toEqual([]);
    expect(JSON.stringify({ candidates, refused })).not.toContain(token);
    const broad: Workspace = { groups: [{ id: 'g', name: 'g', enabled: true, rules: [{ ...rule, match: { kind: 'glob', pattern: '*' } }] }] };
    expect(compileWorkspace(broad, { bridge: { session: { port: 47321, token }, up: true, inPlace: true } }).refused).toEqual([]);
  });
});
