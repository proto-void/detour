import { resolveVariables, type VariableScopes } from './variables';

export type UrlSegment =
  | { kind: 'text'; text: string }
  | { kind: 'var'; text: string; key: string; value: string | undefined; resolved: boolean };

/** Split a URL template into plain text and `{{var}}` segments for highlighting / hover. */
export function highlightUrl(input: string, scopes: VariableScopes): UrlSegment[] {
  const segments: UrlSegment[] = [];
  const re = /\{\{\s*([^{}]+?)\s*\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    if (m.index > last) segments.push({ kind: 'text', text: input.slice(last, m.index) });
    const key = m[1]!.trim();
    const full = m[0]!;
    const resolvedText = resolveVariables(full, scopes);
    const resolved = resolvedText !== full;
    segments.push({
      kind: 'var',
      text: full,
      key,
      value: resolved ? resolvedText : undefined,
      resolved,
    });
    last = m.index + full.length;
  }
  if (last < input.length) segments.push({ kind: 'text', text: input.slice(last) });
  return segments;
}
