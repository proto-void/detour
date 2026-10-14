/**
 * Minimal YAML subset parser for OpenAPI/Swagger documents (maps, lists, scalars).
 * Prefer JSON when available. Not a full YAML 1.2 implementation.
 */

export function parseYamlLite(text: string): unknown {
  const lines = text.replace(/\t/g, '  ').split(/\r?\n/);
  let i = 0;

  const peekIndent = () => {
    while (i < lines.length && (lines[i]!.trim() === '' || lines[i]!.trim().startsWith('#'))) i++;
    if (i >= lines.length) return -1;
    const m = /^ */.exec(lines[i]!);
    return m ? m[0].length : 0;
  };

  const parseValue = (indent: number): unknown => {
    const ind = peekIndent();
    if (ind < indent) return null;
    const line = lines[i]!;
    const trimmed = line.trim();
    if (trimmed.startsWith('- ')) {
      const list: unknown[] = [];
      while (true) {
        const li = peekIndent();
        if (li < indent || li < 0) break;
        const raw = lines[i]!.trim();
        if (!raw.startsWith('- ')) break;
        i++;
        const rest = raw.slice(2);
        if (rest.includes(':') && !rest.startsWith('"') && !rest.startsWith("'")) {
          // inline map start on same line as list item — push back conceptually
          i--;
          const itemIndent = li + 2;
          // Re-read as map under list
          const keyVal = rest;
          const colon = keyVal.indexOf(':');
          const key = keyVal.slice(0, colon).trim();
          const after = keyVal.slice(colon + 1).trim();
          i++;
          const obj: Record<string, unknown> = {};
          if (after) obj[key] = scalar(after);
          else obj[key] = parseValue(itemIndent);
          while (peekIndent() > li) {
            Object.assign(obj, parseMap(itemIndent) as object);
            break;
          }
          // Actually merge continued map keys at itemIndent
          while (peekIndent() >= itemIndent) {
            const more = parseMap(itemIndent);
            if (more && typeof more === 'object') Object.assign(obj, more);
            else break;
          }
          list.push(obj);
        } else if (rest === '' || rest === '|' || rest === '>') {
          list.push(parseValue(li + 2));
        } else {
          list.push(scalar(rest));
        }
      }
      return list;
    }
    return parseMap(indent);
  };

  const parseMap = (indent: number): Record<string, unknown> | null => {
    const obj: Record<string, unknown> = {};
    let any = false;
    while (true) {
      const ind = peekIndent();
      if (ind < indent || ind < 0) break;
      if (ind > indent && any) break;
      const trimmed = lines[i]!.trim();
      if (trimmed.startsWith('- ')) break;
      const colon = indexOfKeyColon(trimmed);
      if (colon < 0) break;
      i++;
      any = true;
      const key = unquote(trimmed.slice(0, colon).trim());
      const after = trimmed.slice(colon + 1).trim();
      if (after === '' || after === '|' || after === '>') {
        obj[key] = parseValue(indent + 2);
      } else {
        obj[key] = scalar(after);
      }
    }
    return any ? obj : null;
  };

  const rootInd = peekIndent();
  if (rootInd < 0) return {};
  const first = lines[i]!.trim();
  if (first.startsWith('- ')) return parseValue(rootInd);
  return parseMap(rootInd) ?? {};
}

function indexOfKeyColon(line: string): number {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === ':' && !inSingle && !inDouble) return i;
  }
  return -1;
}

function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  return s;
}

function scalar(s: string): unknown {
  const t = s.trim();
  if (t === 'null' || t === '~') return null;
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return unquote(t);
}

export function parseJsonOrYaml(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Empty document');
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return JSON.parse(trimmed);
  try {
    return JSON.parse(trimmed);
  } catch {
    return parseYamlLite(trimmed);
  }
}
