import { describe, expect, it } from 'vitest';
import { compileRule } from '../engine-core/compile';
import { matchesUrl } from '../rule-model/match';
import { parseWorkspace } from '../rule-model/schema';
import { previewMatch } from './editor';
import { installRecipe, RECIPES } from './recipes';

const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};

const install = (id: string, values: Record<string, string>) => installRecipe({ groups: [] }, id, values, ids());

describe('starter recipes', () => {
  it('lists the three built-in packs', () => {
    expect(RECIPES.map((recipe) => recipe.id)).toEqual(['localhost', 'cors', 'spa']);
  });

  it('points a host at localhost, including the path', () => {
    const result = install('localhost', { host: 'CDN.Example.com', origin: 'http://localhost:5173' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(parseWorkspace(result.workspace).ok).toBe(true);
    expect(result.group.name).toBe('cdn.example.com → localhost:5173');
    const https = result.group.rules[0]!;
    const http = result.group.rules[1]!;
    expect(compileRule(https).ok).toBe(true);
    expect(compileRule(http).ok).toBe(true);
    expect(previewMatch(https, 'https://cdn.example.com/assets/app.js')).toEqual({
      kind: 'match',
      outcome: 'redirect',
      to: 'http://localhost:5173/assets/app.js',
    });
    expect(previewMatch(http, 'http://cdn.example.com/app.js')).toMatchObject({ kind: 'match', to: 'http://localhost:5173/app.js' });
  });

  it('refuses a redirect of the local server onto itself', () => {
    const result = install('localhost', { host: 'localhost:5173', origin: 'http://localhost:5173' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.origin).toMatch(/itself/);
  });

  it('refuses a local origin that includes a path', () => {
    const result = install('localhost', { host: 'cdn.example.com', origin: 'http://localhost:5173/app' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.origin).toMatch(/path/);
  });

  it('adds CORS headers on the given glob', () => {
    const result = install('cors', { pattern: 'https://api.example.com/*' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rule = result.group.rules[0]!;
    expect(compileRule(rule).ok).toBe(true);
    expect(rule.action).toMatchObject({
      type: 'modifyHeaders',
      response: [
        { op: 'set', name: 'access-control-allow-origin', value: '*' },
        { op: 'set', name: 'access-control-allow-methods' },
        { op: 'set', name: 'access-control-allow-headers', value: '*' },
      ],
    });
  });

  it('sends extension-less page loads to index.html and leaves files alone', () => {
    const result = install('spa', { origin: 'https://app.example.com' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rule = result.group.rules[0]!;
    expect(compileRule(rule).ok).toBe(true);
    expect(rule.resourceTypes).toEqual(['main_frame']);
    expect(matchesUrl(rule.match, 'https://app.example.com/dashboard')).toBe(true);
    expect(matchesUrl(rule.match, 'https://app.example.com/index.html')).toBe(false);
    expect(matchesUrl(rule.match, 'https://app.example.com/assets/app.js')).toBe(false);
    expect(previewMatch(rule, 'https://app.example.com/dashboard')).toMatchObject({ to: 'https://app.example.com/index.html' });
  });

  it('appends the group and does not touch groups already there', () => {
    const existing = { groups: [{ id: 'keep', name: 'Mine', enabled: true, rules: [] }] };
    const result = installRecipe(existing, 'cors', { pattern: '*' }, ids());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workspace.groups.map((group) => group.name)).toEqual(['Mine', 'Allow CORS']);
    expect(existing.groups).toHaveLength(1);
  });
});
