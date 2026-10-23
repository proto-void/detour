/**
 * Split a SQL/CQL buffer into statements on `;` (SSMS-like).
 * Positions are character offsets into the original string.
 * No quote/comment awareness (plan 036).
 */
export type StatementSpan = {
  text: string;
  start: number;
  end: number;
};

export function splitStatements(source: string): StatementSpan[] {
  const spans: StatementSpan[] = [];
  let start = 0;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === ';') {
      const raw = source.slice(start, i + 1);
      if (raw.trim().length > 0) {
        spans.push({ text: raw.trim(), start, end: i + 1 });
      }
      start = i + 1;
    }
  }
  if (start < source.length) {
    const raw = source.slice(start);
    if (raw.trim().length > 0) {
      spans.push({ text: raw.trim(), start, end: source.length });
    }
  }
  return spans;
}

function stripTrailingSemi(text: string): string {
  return text.replace(/;+\s*$/, '').trim();
}

function firstNonWsOffset(source: string, from: number, to: number): number | null {
  for (let i = from; i < to; i++) {
    if (!/\s/.test(source[i]!)) return i;
  }
  return null;
}

function lineNumberAtOffset(source: string, offset: number): number {
  // 1-based CodeMirror line numbers
  let line = 1;
  const end = Math.max(0, Math.min(offset, source.length));
  for (let i = 0; i < end; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

/** 1-based line numbers of the first non-whitespace char of each statement. */
export function statementStartLines(source: string): number[] {
  const lines: number[] = [];
  for (const span of splitStatements(source)) {
    const off = firstNonWsOffset(source, span.start, span.end);
    if (off === null) continue;
    lines.push(lineNumberAtOffset(source, off));
  }
  return lines;
}

/** Statement covering `offset`, or null if the buffer has no statements. */
export function statementAtOffset(source: string, offset: number): StatementSpan | null {
  const spans = splitStatements(source);
  if (spans.length === 0) return null;
  const at = Math.max(0, Math.min(offset, source.length));
  for (const span of spans) {
    if (at >= span.start && at <= span.end) {
      return { text: stripTrailingSemi(span.text), start: span.start, end: span.end };
    }
  }
  const last = spans[spans.length - 1]!;
  return { text: stripTrailingSemi(last.text), start: last.start, end: last.end };
}

/**
 * Statement under cursor (or selection start). If only one statement in the buffer,
 * returns that statement even when cursor is at EOF.
 */
export function statementAtCursor(source: string, cursor: number): string {
  const span = statementAtOffset(source, cursor);
  if (span) return span.text;
  return source.trim().replace(/;+\s*$/, '').trim();
}

export type RunPlan = {
  mode: 'selection' | 'all';
  statements: string[];
};

/**
 * Toolbar / Mod+Enter: non-empty selection → statements in selection;
 * else every statement in the buffer (not at-cursor).
 */
export function resolveRunPlan(
  source: string,
  selection: string | null | undefined,
): RunPlan {
  const sel = (selection ?? '').trim();
  if (sel) {
    return {
      mode: 'selection',
      statements: splitStatements(sel)
        .map((s) => stripTrailingSemi(s.text))
        .filter((t) => t.length > 0),
    };
  }
  return {
    mode: 'all',
    statements: splitStatements(source)
      .map((s) => stripTrailingSemi(s.text))
      .filter((t) => t.length > 0),
  };
}

/**
 * @deprecated Prefer `resolveRunPlan`. Kept for older call sites / tests.
 * Decide what to run: non-empty selection wins; else statement at cursor.
 */
export function resolveRunText(
  source: string,
  selection: string | null | undefined,
  cursor: number,
): { text: string; mode: 'selection' | 'at-cursor' | 'single' } {
  const sel = (selection ?? '').trim();
  if (sel) return { text: stripTrailingSemi(sel), mode: 'selection' };
  const spans = splitStatements(source);
  if (spans.length <= 1) {
    const text = stripTrailingSemi(source.trim());
    return { text, mode: 'single' };
  }
  return { text: statementAtCursor(source, cursor), mode: 'at-cursor' };
}
