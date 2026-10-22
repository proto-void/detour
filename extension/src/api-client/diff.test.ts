import { describe, expect, it } from 'vitest';
import { diffResponses } from './diff';

describe('diffResponses', () => {
  it('structurally diffs JSON', () => {
    const result = diffResponses('{"a":1,"b":2}', '{"a":1,"b":3,"c":4}');
    expect(result.mode).toBe('json');
    expect(result.equal).toBe(false);
    expect(result.lines.some((l) => l.kind === 'changed' && l.path === 'b')).toBe(true);
    expect(result.lines.some((l) => l.kind === 'added' && l.path === 'c')).toBe(true);
  });

  it('falls back to text when not JSON', () => {
    const result = diffResponses('hello\nworld', 'hello\nthere');
    expect(result.mode).toBe('text');
    expect(result.lines.some((l) => l.kind === 'changed')).toBe(true);
  });
});
