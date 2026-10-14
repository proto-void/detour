import { describe, expect, it } from 'vitest';
import { emptyRequest } from './model';
import { buildMockRule, buildRedirectLocalhostRule, saveResponseAsMock, redirectRequestToLocalhost } from './save-as-rule';

describe('save-as-rule', () => {
  const req = { ...emptyRequest('1', 'Get'), url: 'https://cdn.example.com/api/v1/x', method: 'GET' as const };
  const response = {
    ok: true,
    status: 201,
    statusText: 'Created',
    headers: { 'content-type': 'application/json' },
    body: '{"ok":true}',
    timeMs: 12,
    sizeBytes: 10,
  };

  it('builds a mock rule from the response', () => {
    const rule = buildMockRule({ request: req, response, newId: () => 'mock1' });
    expect(rule.action.type).toBe('mock');
    if (rule.action.type !== 'mock') return;
    expect(rule.action.status).toBe(201);
    expect(rule.action.body).toBe('{"ok":true}');
    expect(rule.match.pattern).toContain('cdn.example.com');
  });

  it('builds a localhost redirect', () => {
    const rule = buildRedirectLocalhostRule({ request: req, newId: () => 'r1' });
    expect(rule.action.type).toBe('redirect');
    if (rule.action.type !== 'redirect') return;
    expect(rule.action.to).toContain('127.0.0.1:5173');
  });

  it('inserts into workspace', () => {
    const mock = saveResponseAsMock({ groups: [] }, { request: req, response, newId: () => crypto.randomUUID() });
    expect(mock.workspace.groups[0]?.rules).toHaveLength(1);
    const redir = redirectRequestToLocalhost({ groups: [] }, { request: req, newId: () => crypto.randomUUID() });
    expect(redir.workspace.groups[0]?.rules[0]?.action.type).toBe('redirect');
  });
});
