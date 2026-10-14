import { describe, expect, it } from 'vitest';
import { emptyRequest } from './model';
import { LOAD_TEST_SAFE_CAP, runLoadTest } from './load-test';

describe('runLoadTest', () => {
  it('computes percentiles and caps', async () => {
    let n = 0;
    const stats = await runLoadTest({
      request: { ...emptyRequest('1'), url: 'https://example.test/x' },
      count: 20,
      concurrency: 5,
      globalApplyDetour: false,
      workspace: { groups: [] },
      scopes: {},
      fetchImpl: async () => {
        n += 1;
        await new Promise((r) => setTimeout(r, n % 3));
        return new Response('ok', { status: 200 });
      },
    });
    expect(stats.count).toBe(20);
    expect(stats.ok).toBe(20);
    expect(stats.p50).toBeGreaterThanOrEqual(0);
    expect(stats.p99).toBeGreaterThanOrEqual(stats.p50);
    expect(stats.rps).toBeGreaterThan(0);
    expect(stats.warned).toBe(false);
  });

  it('warns above safe cap', async () => {
    const stats = await runLoadTest({
      request: { ...emptyRequest('1'), url: 'https://example.test/x' },
      count: LOAD_TEST_SAFE_CAP + 10,
      concurrency: 10,
      globalApplyDetour: false,
      workspace: { groups: [] },
      scopes: {},
      fetchImpl: async () => new Response('ok', { status: 200 }),
    });
    expect(stats.warned).toBe(true);
    expect(stats.count).toBe(LOAD_TEST_SAFE_CAP + 10);
  });
});
