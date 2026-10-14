import { describe, expect, it } from 'vitest';
import { looksLikeCurl, parseCurl, toCurl, tokenizeCurl } from './curl';

const id = (() => {
  let n = 0;
  return () => `id${++n}`;
})();

describe('curl', () => {
  it('tokenizes quotes and line continuations', () => {
    expect(tokenizeCurl(`curl \\\n  -H 'Accept: application/json' \\\n  "https://example.com"`)).toEqual([
      'curl',
      '-H',
      'Accept: application/json',
      'https://example.com',
    ]);
  });

  it('parses DevTools-style GET with headers', () => {
    const result = parseCurl(`curl 'https://api.example.com/v1?x=1' -H 'Accept: application/json' -H 'Authorization: Bearer tok'`, id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.method).toBe('GET');
    expect(result.request.url).toBe('https://api.example.com/v1');
    expect(result.request.params.map((p) => p.key)).toContain('x');
    expect(result.request.auth).toEqual({ type: 'bearer', token: 'tok' });
  });

  it('parses JSON POST -d and -u', () => {
    const result = parseCurl(`curl -X POST https://example.com/a -H 'Content-Type: application/json' -d '{"a":1}' -u user:pass`, id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.method).toBe('POST');
    expect(result.request.body).toMatchObject({ mode: 'raw', language: 'json', text: '{"a":1}' });
    expect(result.request.auth).toEqual({ type: 'basic', username: 'user', password: 'pass' });
  });

  it('parses -F form fields', () => {
    const result = parseCurl(`curl -F name=Ada -F city=London https://example.com/form`, id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.body.mode).toBe('formdata');
    if (result.request.body.mode !== 'formdata') return;
    expect(result.request.body.rows.map((r) => r.key)).toEqual(['name', 'city']);
  });

  it('round-trips via toCurl for a simple POST', () => {
    const parsed = parseCurl(`curl -X POST https://example.com/a -H 'X-Test: 1' --data-raw '{"z":2}'`, id);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const again = parseCurl(toCurl(parsed.request), id);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.request.method).toBe('POST');
    expect(again.request.url).toContain('https://example.com/a');
    expect(again.request.body).toMatchObject({ mode: 'raw', text: '{"z":2}' });
  });

  it('detects curl paste', () => {
    expect(looksLikeCurl('curl https://x')).toBe(true);
    expect(looksLikeCurl('https://x')).toBe(false);
  });
});
