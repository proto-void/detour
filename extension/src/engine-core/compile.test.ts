import { describe, expect, it } from 'vitest';
import { matchesUrl } from '../rule-model/match';
import type { Rule, Workspace } from '../rule-model/schema';
import { compileRule, compileWorkspace, globToUrlFilter, toRegexSubstitution } from './compile';

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

describe('compileWorkspace', () => {
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
