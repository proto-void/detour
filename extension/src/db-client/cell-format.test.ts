import { describe, expect, it } from 'vitest';
import { formatDbCell } from './cell-format';

describe('formatDbCell', () => {
  it('formats nullish and primitives', () => {
    expect(formatDbCell(null)).toBe('null');
    expect(formatDbCell(undefined)).toBe('null');
    expect(formatDbCell(true)).toBe('true');
    expect(formatDbCell(42)).toBe('42');
    expect(formatDbCell('hi')).toBe('hi');
  });

  it('collapses whitespace and truncates long strings', () => {
    expect(formatDbCell('a\n\tb')).toBe('a b');
    const long = 'x'.repeat(200);
    expect(formatDbCell(long).endsWith('…')).toBe(true);
    expect(formatDbCell(long).length).toBeLessThan(130);
  });

  it('previews blobs and Buffer-like objects', () => {
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    expect(formatDbCell(bytes)).toContain('blob(4)');
    expect(formatDbCell(bytes)).toContain('deadbeef');
    expect(formatDbCell({ type: 'Buffer', data: [1, 2, 3] })).toContain('blob(3)');
  });

  it('stringifies objects on one line', () => {
    expect(formatDbCell({ a: 1 })).toBe('{"a":1}');
  });
});
