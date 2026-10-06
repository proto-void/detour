import { describe, expect, it } from 'vitest';
import { parseEnvelope, parseRule, parseWorkspace } from './schema';

const redirect = {
  id: 'r1',
  enabled: true,
  match: { kind: 'glob', pattern: 'https://cdn.example.com/app.*.js' },
  action: { type: 'redirect', to: 'http://localhost:5173/app.*.js' },
};

describe('RuleSchema', () => {
  it.each([
    ['glob redirect', redirect],
    ['regex block', { id: 'r2', enabled: false, match: { kind: 'regex', pattern: '^https://ads\\.' }, action: { type: 'block' } }],
    [
      'modifyHeaders with resource types',
      {
        id: 'r3',
        enabled: true,
        match: { kind: 'glob', pattern: '*://api.example.com/*' },
        action: { type: 'modifyHeaders', response: [{ op: 'set', name: 'Access-Control-Allow-Origin', value: '*' }] },
        resourceTypes: ['xmlhttprequest'],
      },
    ],
  ])('accepts %s', (_, rule) => {
    expect(parseRule(rule).ok).toBe(true);
  });

  it('fills modifyHeaders defaults', () => {
    const result = parseRule({
      ...redirect,
      action: { type: 'modifyHeaders', request: [{ op: 'remove', name: 'Cookie' }] },
    });
    expect(result.ok && result.value.action).toEqual({ type: 'modifyHeaders', request: [{ op: 'remove', name: 'Cookie' }], response: [] });
  });

  it.each([
    ['empty pattern', { ...redirect, match: { kind: 'glob', pattern: '  ' } }, 'match.pattern: Must not be empty'],
    ['bad regex', { ...redirect, match: { kind: 'regex', pattern: '(' } }, 'match.pattern: Not a valid regular expression'],
    ['unknown action', { ...redirect, action: { type: 'teleport' } }, 'action.type'],
    ['no header ops', { ...redirect, action: { type: 'modifyHeaders' } }, 'at least one request or response header'],
    ['bad header name', { ...redirect, action: { type: 'modifyHeaders', request: [{ op: 'remove', name: 'Bad Name' }] } }, 'action.request.0.name'],
    ['set without value', { ...redirect, action: { type: 'modifyHeaders', request: [{ op: 'set', name: 'X-A' }] } }, 'action.request.0.value'],
    ['empty resourceTypes', { ...redirect, resourceTypes: [] }, 'resourceTypes'],
    ['unknown resourceType', { ...redirect, resourceTypes: ['scripts'] }, 'resourceTypes.0'],
    ['missing enabled', { ...redirect, enabled: undefined }, 'enabled'],
  ])('rejects %s with an actionable path', (_, rule, expected) => {
    const result = parseRule(rule);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toContain(expected);
  });
});

describe('WorkspaceSchema', () => {
  it('rejects duplicate ids across groups and rules', () => {
    const result = parseWorkspace({
      groups: [
        { id: 'g1', name: 'A', enabled: true, rules: [redirect] },
        { id: 'g2', name: 'B', enabled: true, rules: [redirect] },
      ],
    });
    expect(result).toEqual({ ok: false, errors: ['Duplicate group/rule id "r1"'] });
  });
});

describe('GroupSchema pageDomains', () => {
  const groupWith = (pageDomains: unknown) => ({ groups: [{ id: 'g', name: 'g', enabled: true, pageDomains, rules: [] }] });

  it('accepts plain hostnames', () => {
    expect(parseWorkspace(groupWith(['example.com', 'localhost', '127.0.0.1'])).ok).toBe(true);
  });

  it.each([[[]], [['https://example.com']], [['example.com:8080']], [['Example.com']], [['*.example.com']]])('rejects %j', (pageDomains) => {
    const result = parseWorkspace(groupWith(pageDomains));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/^groups\.0\.pageDomains/);
  });
});

describe('EnvelopeSchema', () => {
  it('requires the schema version', () => {
    const result = parseEnvelope({ v: 9, data: { groups: [] } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('v: Unsupported Detour schema version');
  });

  it('accepts an empty workspace', () => {
    expect(parseEnvelope({ v: 1, data: { groups: [] } })).toEqual({ ok: true, value: { v: 1, data: { groups: [] } } });
  });
});

describe('page actions (inject / mock)', () => {
  const rule = (action: unknown) => ({ id: 'p', enabled: true, match: { kind: 'glob', pattern: 'https://app.example.com/*' }, action });

  it('fills inject defaults and keeps code byte-for-byte', () => {
    const parsed = parseRule(rule({ type: 'injectJs', source: { kind: 'inline', code: '  window.X = 1;\n' } }));
    expect(parsed).toMatchObject({
      ok: true,
      value: { action: { type: 'injectJs', source: { code: '  window.X = 1;\n' }, runAt: 'document_start', allFrames: false, world: 'MAIN' } },
    });
    expect(parseRule(rule({ type: 'injectCss', source: { kind: 'url', url: 'http://localhost:5173/x.css' } }))).toMatchObject({
      ok: true,
      value: { action: { runAt: 'document_start', allFrames: false } },
    });
  });

  it('accepts a body override and keeps the text byte-for-byte', () => {
    const parsed = parseRule(rule({ type: 'overrideBody', body: '  window.A = 1;\n', contentType: ' text/javascript ' }));
    expect(parsed).toMatchObject({ ok: true, value: { action: { type: 'overrideBody', body: '  window.A = 1;\n', contentType: 'text/javascript' } } });
  });

  it.each([
    [{ type: 'overrideBody', body: '   ' }, 'action.body: Enter the replacement body'],
    [{ type: 'injectJs', source: { kind: 'inline', code: '   ' } }, 'action.source.code: Enter some code'],
    [{ type: 'injectCss', source: { kind: 'url', url: 'file:///x.css' } }, 'action.source.url: Must be an http:// or https:// URL'],
    [{ type: 'injectJs', source: { kind: 'inline', code: 'x' }, runAt: 'later' }, 'action.runAt'],
    [{ type: 'mock', status: 0 }, 'action.status: Status must be at least 200'],
    [{ type: 'mock', status: 200.5 }, 'action.status: Status must be a whole number'],
    [{ type: 'mock', delayMs: 60_000 }, 'action.delayMs: Delay must be at most 30000'],
    [{ type: 'mock', method: 'TRACE' }, 'action.method'],
    [{ type: 'mock', headers: [{ name: 'bad name', value: '' }] }, 'action.headers.0.name'],
  ])('rejects %j', (action, message) => {
    const parsed = parseRule(rule(action));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors.join('\n')).toContain(message);
  });

  it('fills mock defaults', () => {
    expect(parseRule(rule({ type: 'mock' }))).toMatchObject({ ok: true, value: { action: { method: 'ANY', status: 200, headers: [], body: '', delayMs: 0 } } });
  });
});
