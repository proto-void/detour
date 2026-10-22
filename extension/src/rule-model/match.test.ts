import { describe, expect, it } from 'vitest';
import { compileMatcher, countWildcards, globToRegexSource, matchesUrl } from './match';

const glob = (pattern: string) => ({ kind: 'glob' as const, pattern });

describe('globToRegexSource', () => {
  it('anchors and escapes literals', () => {
    expect(globToRegexSource('https://a.com/x?y=(1)')).toBe('^https://a\\.com/x\\?y=\\(1\\)$');
  });

  it('collapses wildcard runs and captures only the first N', () => {
    expect(globToRegexSource('https://**.a.com/*', 1)).toBe('^https://(.*?)\\.a\\.com/.*?$');
    expect(countWildcards('https://**.a.com/*')).toBe(2);
  });

  it('handles leading and trailing wildcards', () => {
    expect(globToRegexSource('*.js*', 2)).toBe('^(.*?)\\.js(.*?)$');
  });
});

describe('glob matching', () => {
  it.each([
    ['https://cdn.example.com/*', 'https://cdn.example.com/a/b.js', true],
    ['https://cdn.example.com/*', 'https://cdn.example.com/', true],
    ['https://cdn.example.com/*', 'https://evil.com/?https://cdn.example.com/', false],
    ['*://*.example.com/app.*.js', 'https://www.example.com/app.3f2a.js', true],
    ['*://*.example.com/app.*.js', 'https://www.example.com/app.3f2a.js?v=1', false],
    ['https://a.com/x.js', 'https://a.com/x.js', true],
    ['https://a.com/x.js', 'https://a.com/xxjs', false],
    ['*', 'anything', true],
  ])('%s vs %s → %s', (pattern, url, expected) => {
    expect(matchesUrl(glob(pattern), url)).toBe(expected);
  });

  it('is case-insensitive unless asked otherwise', () => {
    expect(matchesUrl(glob('https://a.com/App.js'), 'https://a.com/app.js')).toBe(true);
    expect(matchesUrl(glob('https://a.com/App.js'), 'https://a.com/app.js', true)).toBe(false);
  });

  it('captures lazily left to right', () => {
    expect(compileMatcher(glob('https://*.com/*')).exec('https://a.b.com/c.com/d')?.slice(1)).toEqual(['a.b', 'c.com/d']);
  });
});

describe('regex matching', () => {
  it('is unanchored like DNR regexFilter', () => {
    expect(matchesUrl({ kind: 'regex', pattern: 'ads\\.' }, 'https://x.ads.com/')).toBe(true);
  });
});
