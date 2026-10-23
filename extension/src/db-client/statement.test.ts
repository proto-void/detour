import { describe, expect, it } from 'vitest';
import {
  resolveRunPlan,
  resolveRunText,
  splitStatements,
  statementAtCursor,
  statementAtOffset,
  statementStartLines,
} from './statement';

describe('statementAtCursor', () => {
  it('returns the only statement', () => {
    expect(statementAtCursor('SELECT 1;', 0)).toBe('SELECT 1');
  });

  it('picks the statement under the cursor', () => {
    const src = 'SELECT 1;\nSELECT 2;\nSELECT 3;';
    const secondStart = src.indexOf('SELECT 2');
    expect(statementAtCursor(src, secondStart + 2)).toBe('SELECT 2');
    expect(statementAtCursor(src, src.length)).toBe('SELECT 3');
  });
});

describe('statementStartLines', () => {
  it('returns 1-based lines for each statement start', () => {
    const src = 'SELECT 1;\nSELECT 2;\nSELECT 3;';
    expect(statementStartLines(src)).toEqual([1, 2, 3]);
  });

  it('uses the first non-whitespace line of a multi-line statement', () => {
    const src = 'SELECT a\n  FROM t\n  WHERE id = 1;\nSELECT 2;';
    expect(statementStartLines(src)).toEqual([1, 4]);
  });

  it('skips leading blank lines inside a span', () => {
    const src = '\n  SELECT 1;\nSELECT 2;';
    expect(statementStartLines(src)).toEqual([2, 3]);
  });
});

describe('statementAtOffset', () => {
  it('returns the span for a gutter click offset', () => {
    const src = 'SELECT 1;\nSELECT 2;';
    const span = statementAtOffset(src, src.indexOf('SELECT 2'));
    expect(span?.text).toBe('SELECT 2');
  });

  it('covers multi-line paren lists as one statement', () => {
    const src = 'INSERT INTO t (a, b) VALUES (\n  1,\n  2\n);';
    const span = statementAtOffset(src, src.indexOf('2'));
    expect(span?.text).toContain('INSERT INTO t');
    expect(span?.text).toContain('2');
  });
});

describe('resolveRunPlan', () => {
  it('uses selection statements', () => {
    const r = resolveRunPlan('SELECT 1;\nSELECT 2;\nSELECT 3;', 'SELECT 2;\nSELECT 3;');
    expect(r.mode).toBe('selection');
    expect(r.statements).toEqual(['SELECT 2', 'SELECT 3']);
  });

  it('runs all statements when there is no selection', () => {
    const src = 'SELECT 1;\nSELECT 2;';
    const r = resolveRunPlan(src, '');
    expect(r.mode).toBe('all');
    expect(r.statements).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('returns a single statement for a one-statement buffer', () => {
    const r = resolveRunPlan('SELECT release_version FROM system.local;', '');
    expect(r.mode).toBe('all');
    expect(r.statements).toEqual(['SELECT release_version FROM system.local']);
  });
});

describe('resolveRunText (legacy)', () => {
  it('prefers selection', () => {
    const r = resolveRunText('SELECT 1;\nSELECT 2;', 'SELECT 2', 0);
    expect(r.mode).toBe('selection');
    expect(r.text).toBe('SELECT 2');
  });

  it('uses at-cursor for multi-statement', () => {
    const src = 'SELECT 1;\nSELECT 2;';
    const r = resolveRunText(src, '', src.indexOf('SELECT 2'));
    expect(r.mode).toBe('at-cursor');
    expect(r.text).toBe('SELECT 2');
  });

  it('uses single for one statement', () => {
    const r = resolveRunText('SELECT release_version FROM system.local;', '', 5);
    expect(r.mode).toBe('single');
    expect(r.text).toContain('release_version');
  });
});

describe('splitStatements', () => {
  it('splits on semicolons', () => {
    expect(splitStatements('a;b;').map((s) => s.text)).toEqual(['a;', 'b;']);
  });
});
