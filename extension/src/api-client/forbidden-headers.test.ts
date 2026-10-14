import { describe, expect, it, vi } from 'vitest';
import {
  buildSessionHeaderRule,
  splitForbiddenHeaders,
  withForbiddenHeaderRule,
  type DnrSessionApi,
} from './forbidden-headers';

describe('forbidden headers', () => {
  it('splits cookie origin referer user-agent host', () => {
    const { allowed, forbidden } = splitForbiddenHeaders({
      Accept: 'application/json',
      Cookie: 'a=1',
      Origin: 'https://example.com',
      Referer: 'https://example.com/',
      'User-Agent': 'Detour',
      Host: 'api.example.com',
      'X-Custom': '1',
    });
    expect(allowed).toEqual({ Accept: 'application/json', 'X-Custom': '1' });
    expect(Object.keys(forbidden).sort()).toEqual(['Cookie', 'Host', 'Origin', 'Referer', 'User-Agent'].sort());
  });

  it('builds a urlFilter session rule', () => {
    const rule = buildSessionHeaderRule(42, 'https://api.example.com/a', { Cookie: 'sid=1' });
    expect(rule.id).toBe(42);
    expect(rule.condition.urlFilter).toBe('|https://api.example.com/a');
    expect(rule.action).toMatchObject({
      type: 'modifyHeaders',
      requestHeaders: [{ header: 'Cookie', operation: 'set', value: 'sid=1' }],
    });
  });

  it('adds and always removes the session rule', async () => {
    const dnr: DnrSessionApi = {
      getSessionRules: vi.fn(async () => []),
      updateSessionRules: vi.fn(async () => {}),
    };
    await withForbiddenHeaderRule(dnr, 'https://example.com/a', { Cookie: 'x=1' }, async () => 'ok');
    expect(dnr.updateSessionRules).toHaveBeenCalledTimes(2);
    expect(dnr.updateSessionRules).toHaveBeenNthCalledWith(1, expect.objectContaining({ addRules: expect.any(Array) }));
    expect(dnr.updateSessionRules).toHaveBeenNthCalledWith(2, expect.objectContaining({ removeRuleIds: expect.any(Array) }));
  });

  it('still removes the rule when run throws', async () => {
    const dnr: DnrSessionApi = {
      getSessionRules: vi.fn(async () => []),
      updateSessionRules: vi.fn(async () => {}),
    };
    await expect(
      withForbiddenHeaderRule(dnr, 'https://example.com/a', { Cookie: 'x=1' }, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(dnr.updateSessionRules).toHaveBeenCalledTimes(2);
  });
});
