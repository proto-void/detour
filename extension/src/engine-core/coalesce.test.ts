import { describe, expect, it } from 'vitest';
import { createCoalescer } from './coalesce';

function deferredTask() {
  const releases: (() => void)[] = [];
  let runs = 0;
  const task = () =>
    new Promise<void>((resolve) => {
      runs++;
      releases.push(resolve);
    });
  return { task, runs: () => runs, release: () => releases.shift()?.() };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('createCoalescer', () => {
  it('collapses requests made during a run into one follow-up run', async () => {
    const { task, runs, release } = deferredTask();
    const refresh = createCoalescer(task);

    const first = refresh();
    const followUps = [refresh(), refresh(), refresh()];
    expect(runs()).toBe(1);
    expect(new Set(followUps).size).toBe(1);

    release();
    await first;
    await tick();
    expect(runs()).toBe(2);
    release();
    await Promise.all(followUps);
    expect(runs()).toBe(2);
  });

  it('starts a fresh run once idle', async () => {
    const { task, runs, release } = deferredTask();
    const refresh = createCoalescer(task);
    const first = refresh();
    release();
    await first;
    const second = refresh();
    expect(runs()).toBe(2);
    release();
    await second;
  });

  it('still runs the follow-up when the in-flight run fails', async () => {
    let calls = 0;
    const refresh = createCoalescer(async () => {
      calls++;
      if (calls === 1) throw new Error('boom');
    });
    const first = refresh();
    const second = refresh();
    await expect(first).rejects.toThrow('boom');
    await expect(second).resolves.toBeUndefined();
    expect(calls).toBe(2);
  });
});
