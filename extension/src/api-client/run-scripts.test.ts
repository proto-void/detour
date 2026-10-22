import { describe, expect, it } from 'vitest';
import { runSandboxedScript, scopesToMaps } from './run-scripts';

describe('run-scripts', () => {
  it('maps scopes to plain objects', () => {
    expect(
      scopesToMaps({
        environment: [{ key: 'host', currentValue: 'a', initialValue: '' }],
        collection: [{ key: 'token', value: 't', enabled: true }],
        globals: [{ key: 'x', value: '1', enabled: false }],
      }),
    ).toEqual({
      environment: { host: 'a' },
      collectionVariables: { token: 't' },
      globals: {},
    });
  });

  it('skips empty scripts without creating an iframe', async () => {
    const result = await runSandboxedScript({
      sandboxUrl: 'https://example.invalid/sandbox.html',
      phase: 'test',
      code: '  ',
      context: {
        environment: {},
        collectionVariables: {},
        globals: {},
        request: { method: 'GET', url: 'https://x', headers: {}, body: null },
      },
    });
    expect(result.ok).toBe(true);
    expect(result.tests).toEqual([]);
  });
});
