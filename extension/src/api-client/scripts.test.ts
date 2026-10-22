import { describe, expect, it } from 'vitest';
import { isScriptRunResult, withScriptTimeout } from './scripts';

describe('scripts protocol', () => {
  it('recognizes result messages', () => {
    expect(isScriptRunResult({ type: 'detour-api-script-result', id: '1', ok: true, tests: [] })).toBe(true);
    expect(isScriptRunResult({ type: 'other' })).toBe(false);
  });

  it('enforces timeout', async () => {
    await expect(withScriptTimeout(new Promise(() => {}), 30)).rejects.toThrow(/timed out/i);
  });

  it('resolves when the promise finishes first', async () => {
    await expect(withScriptTimeout(Promise.resolve(42), 1000)).resolves.toBe(42);
  });
});
