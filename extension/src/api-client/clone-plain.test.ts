import { describe, expect, it } from 'vitest';
import { clonePlain } from './clone-plain';

describe('clonePlain', () => {
  it('deep-clones JSON-serializable objects', () => {
    const original = {
      method: 'GET',
      url: 'https://example.com',
      headers: [{ key: 'Accept', value: 'application/json', enabled: true }],
      nested: { a: 1, b: [2, 3] },
    };
    const copy = clonePlain(original);
    expect(copy).toEqual(original);
    expect(copy).not.toBe(original);
    expect(copy.headers).not.toBe(original.headers);
    expect(copy.nested).not.toBe(original.nested);
    expect(copy.nested.b).not.toBe(original.nested.b);
  });

  it('clones Proxy-wrapped objects that structuredClone rejects', () => {
    const plain = { url: 'https://example.com', nested: { n: 1 } };
    const proxied = new Proxy(plain, {});
    expect(() => structuredClone(proxied)).toThrow();
    const copy = clonePlain(proxied);
    expect(copy).toEqual(plain);
    expect(copy).not.toBe(plain);
    expect(copy.nested).not.toBe(plain.nested);
  });
});
