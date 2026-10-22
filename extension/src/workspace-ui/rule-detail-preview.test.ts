import { describe, expect, it } from 'vitest';
import type { Rule } from '../rule-model/schema';
import { dropInsertIndex, ruleDetailPreview } from './rule-detail-preview';

const base = { id: 'r1', enabled: true, match: { kind: 'glob' as const, pattern: 'https://cdn/*' } };

function rule(action: Rule['action'], note?: string): Rule {
  return { ...base, action, ...(note ? { note } : {}) } as Rule;
}

describe('ruleDetailPreview', () => {
  it('describes block', () => {
    expect(ruleDetailPreview(rule({ type: 'block' }))).toEqual({
      lines: ['Blocks matching requests'],
      note: undefined,
    });
  });

  it('describes redirect', () => {
    expect(ruleDetailPreview(rule({ type: 'redirect', to: 'http://localhost:5173/*.js' }))).toEqual({
      lines: ['Redirect to: http://localhost:5173/*.js'],
      note: undefined,
    });
  });

  it('describes serveLocal', () => {
    expect(ruleDetailPreview(rule({ type: 'serveLocal', path: 'assets/app.js' }))).toEqual({
      lines: ['Local path: assets/app.js'],
      note: undefined,
    });
  });

  it('shows overrideBody with delivery and truncated code', () => {
    const preview = ruleDetailPreview(
      rule({ type: 'overrideBody', body: 'hello world', delivery: 'inPlace' }),
      { maxCodeChars: 8 },
    );
    expect(preview.lines).toEqual(['Body override (in-place)']);
    expect(preview.code).toBe('hello w…');
  });

  it('defaults overrideBody delivery to redirect', () => {
    expect(ruleDetailPreview(rule({ type: 'overrideBody', body: 'x', delivery: 'redirect' })).lines).toEqual([
      'Body override (redirect)',
    ]);
  });

  it('describes mock with method, status, and body', () => {
    const preview = ruleDetailPreview(
      rule({
        type: 'mock',
        method: 'POST',
        status: 201,
        headers: [],
        body: '{"ok":true}',
        delayMs: 0,
      }),
    );
    expect(preview.lines).toEqual(['Mock POST → 201']);
    expect(preview.code).toBe('{"ok":true}');
  });

  it('describes injectJs inline and url', () => {
    expect(
      ruleDetailPreview(
        rule({
          type: 'injectJs',
          source: { kind: 'inline', code: 'console.log(1)' },
          runAt: 'document_start',
          allFrames: false,
          world: 'MAIN',
        }),
      ),
    ).toMatchObject({ lines: ['Inject JS (inline)'], code: 'console.log(1)' });

    expect(
      ruleDetailPreview(
        rule({
          type: 'injectJs',
          source: { kind: 'url', url: 'https://cdn/x.js' },
          runAt: 'document_start',
          allFrames: false,
          world: 'MAIN',
        }),
      ),
    ).toEqual({
      lines: ['Inject JS from URL', 'https://cdn/x.js'],
      note: undefined,
    });
  });

  it('describes injectCss', () => {
    expect(
      ruleDetailPreview(
        rule({
          type: 'injectCss',
          source: { kind: 'inline', code: 'body{color:red}' },
          runAt: 'document_start',
          allFrames: false,
        }),
      ).lines,
    ).toEqual(['Inject CSS (inline)']);
  });

  it('lists modifyHeaders ops', () => {
    expect(
      ruleDetailPreview(
        rule({
          type: 'modifyHeaders',
          request: [{ op: 'set', name: 'x-a', value: '1' }],
          response: [{ op: 'remove', name: 'cookie' }],
        }),
      ).lines,
    ).toEqual(['Request: set x-a=1', 'Response: remove cookie']);
  });

  it('includes optional note', () => {
    expect(ruleDetailPreview(rule({ type: 'block' }, 'temp')).note).toBe('temp');
  });
});

describe('dropInsertIndex', () => {
  it('inserts before an anchor below the source', () => {
    // [a,b,c] drag a before c → [b,a,c]
    expect(dropInsertIndex(0, 2, 'before')).toBe(1);
  });

  it('inserts after an anchor above the source', () => {
    // [a,b,c] drag c after a → [a,c,b]
    expect(dropInsertIndex(2, 0, 'after')).toBe(1);
  });

  it('is a no-op when dropping on self before/after collapses to same index', () => {
    expect(dropInsertIndex(1, 1, 'before')).toBe(1);
    expect(dropInsertIndex(1, 1, 'after')).toBe(1);
  });
});
