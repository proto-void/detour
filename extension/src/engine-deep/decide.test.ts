import { describe, expect, it } from 'vitest';
import type { BodyRule } from './plan';
import { fulfillParams, pickBodyRule, replacementHeaders, resourceAllowed, utf8Base64 } from './decide';

const rule = (extra: Partial<BodyRule> = {}): BodyRule => ({
  groupId: 'g',
  ruleId: 'b',
  match: { kind: 'glob', pattern: 'https://cdn.example.com/*.js' },
  caseSensitive: false,
  resourceTypes: ['script'],
  body: 'window.A = "LOCAL"',
  ...extra,
});

describe('pickBodyRule', () => {
  it('uses the first matching rule and ignores other resource types', () => {
    const first = rule({ ruleId: 'first', body: 'one' });
    const second = rule({ ruleId: 'second', body: 'two' });
    const hit = pickBodyRule([first, second], { url: 'https://cdn.example.com/app.js', resourceType: 'Script', pageHost: 'app.example.com' });
    expect(hit?.ruleId).toBe('first');
    expect(pickBodyRule([first], { url: 'https://cdn.example.com/app.js', resourceType: 'Stylesheet', pageHost: 'app.example.com' })).toBeUndefined();
  });

  it('scopes by the page host and treats a Firefox script type like a script', () => {
    const scoped = rule({ pageDomains: ['app.example.com'] });
    expect(pickBodyRule([scoped], { url: 'https://cdn.example.com/app.js', resourceType: 'script', pageHost: 'app.example.com' })?.ruleId).toBe('b');
    expect(pickBodyRule([scoped], { url: 'https://cdn.example.com/app.js', resourceType: 'script', pageHost: 'other.example.com' })).toBeUndefined();
  });

  it('does not treat an unknown document as a page load', () => {
    const pages = rule({ resourceTypes: ['main_frame'], match: { kind: 'glob', pattern: '*' } });
    expect(resourceAllowed(pages, 'Document', undefined)).toBe(false);
    expect(resourceAllowed(pages, 'Document', true)).toBe(true);
    expect(resourceAllowed(pages, 'Document', false)).toBe(false);
  });
});

describe('replacement headers and body encoding', () => {
  it('strips encoding headers and replaces content-type', () => {
    const headers = replacementHeaders(
      [
        { name: 'Content-Encoding', value: 'gzip' },
        { name: 'Content-Length', value: '4' },
        { name: 'Content-Type', value: 'text/plain' },
        { name: 'X-Keep', value: 'yes' },
      ],
      'text/javascript; charset=utf-8',
    );
    expect(headers).toEqual([
      { name: 'Content-Type', value: 'text/javascript; charset=utf-8' },
      { name: 'X-Keep', value: 'yes' },
    ]);
  });

  it('encodes the body as UTF-8 base64 and keeps the status', () => {
    expect(utf8Base64('é')).toBe('w6k=');
    const params = fulfillParams('req', rule({ contentType: 'text/javascript' }), 200, 'OK', [{ name: 'Content-Encoding', value: 'gzip' }]);
    expect(params.responseCode).toBe(200);
    expect(params.responsePhrase).toBe('OK');
    expect(params.body).toBe(utf8Base64('window.A = "LOCAL"'));
    expect(params.responseHeaders.some((header) => header.name.toLowerCase() === 'content-encoding')).toBe(false);
    expect(params.responseHeaders).toContainEqual({ name: 'content-type', value: 'text/javascript' });
  });
});
