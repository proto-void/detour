import { describe, expect, it } from 'vitest';
import type { Workspace } from '../rule-model/schema';
import { applyDetourRules } from './apply-rules';

const ws = (...rules: Workspace['groups'][0]['rules']): Workspace => ({
  groups: [{ id: 'g', name: 'G', enabled: true, rules }],
});

describe('applyDetourRules', () => {
  it('rewrites URL on redirect', () => {
    const workspace = ws({
      id: 'r1',
      enabled: true,
      match: { kind: 'glob', pattern: 'https://cdn.example.com/*' },
      action: { type: 'redirect', to: 'http://localhost:5173/*' },
      resourceTypes: ['xmlhttprequest'],
    });
    const out = applyDetourRules(workspace, {
      method: 'GET',
      url: 'https://cdn.example.com/app.js',
      headers: {},
      body: null,
    });
    expect(out.kind).toBe('network');
    if (out.kind !== 'network') return;
    expect(out.request.url).toBe('http://localhost:5173/app.js');
    expect(out.label).toBe('Detour rules applied (simulated)');
  });

  it('returns blocked without network', () => {
    const workspace = ws({
      id: 'r1',
      enabled: true,
      match: { kind: 'glob', pattern: 'https://api.example.com/*' },
      action: { type: 'block' },
      resourceTypes: ['xmlhttprequest'],
    });
    const out = applyDetourRules(workspace, {
      method: 'GET',
      url: 'https://api.example.com/secret',
      headers: {},
      body: null,
    });
    expect(out.kind).toBe('blocked');
    if (out.kind !== 'blocked') return;
    expect(out.message).toMatch(/Blocked by rule/);
  });

  it('returns mock body without network', () => {
    const workspace = ws({
      id: 'r1',
      enabled: true,
      match: { kind: 'glob', pattern: 'https://api.example.com/users' },
      action: { type: 'mock', status: 200, body: '{"users":[]}', method: 'GET', headers: [], delayMs: 0 },
    });
    const out = applyDetourRules(workspace, {
      method: 'GET',
      url: 'https://api.example.com/users',
      headers: {},
      body: null,
    });
    expect(out.kind).toBe('mock');
    if (out.kind !== 'mock') return;
    expect(out.body).toBe('{"users":[]}');
    expect(out.status).toBe(200);
  });

  it('applies request header set ops', () => {
    const workspace = ws({
      id: 'r1',
      enabled: true,
      match: { kind: 'glob', pattern: 'https://api.example.com/*' },
      action: {
        type: 'modifyHeaders',
        request: [{ op: 'set', name: 'X-Detour', value: '1' }],
        response: [],
      },
      resourceTypes: ['xmlhttprequest'],
    });
    const out = applyDetourRules(workspace, {
      method: 'GET',
      url: 'https://api.example.com/a',
      headers: { Accept: 'application/json' },
      body: null,
    });
    expect(out.kind).toBe('network');
    if (out.kind !== 'network') return;
    expect(out.request.headers['X-Detour']).toBe('1');
    expect(out.request.headers.Accept).toBe('application/json');
  });
});
