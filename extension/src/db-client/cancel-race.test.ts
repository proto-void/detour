import { describe, expect, it } from 'vitest';

/** Mirrors Cassandra adapter Promise.race cancel pattern. */
async function raceWithCancel<T>(
  work: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) => {
      const onAbort = () => reject(new Error('Query cancelled'));
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }),
  ]);
}

describe('cancel race', () => {
  it('rejects when aborted before settle', async () => {
    const ac = new AbortController();
    const slow = new Promise<string>((resolve) => {
      setTimeout(() => resolve('done'), 500);
    });
    const p = raceWithCancel(slow, ac.signal);
    ac.abort();
    await expect(p).rejects.toThrow(/cancelled/i);
  });

  it('resolves when work finishes first', async () => {
    const ac = new AbortController();
    const fast = Promise.resolve('ok');
    await expect(raceWithCancel(fast, ac.signal)).resolves.toBe('ok');
  });
});
