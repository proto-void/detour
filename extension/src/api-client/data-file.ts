/** Parse runner data files (CSV or JSON array of objects). */

export type DataRow = Record<string, string>;

export function parseDataFile(text: string, hint?: 'csv' | 'json'): { ok: true; rows: DataRow[] } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, rows: [{}] };

  const asJson = hint === 'json' || trimmed.startsWith('[') || trimmed.startsWith('{');
  if (asJson) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return {
          ok: true,
          rows: parsed.map((row) => {
            if (row && typeof row === 'object' && !Array.isArray(row)) {
              const out: DataRow = {};
              for (const [k, v] of Object.entries(row as Record<string, unknown>)) out[k] = v == null ? '' : String(v);
              return out;
            }
            return { value: String(row) };
          }),
        };
      }
      if (parsed && typeof parsed === 'object') {
        const out: DataRow = {};
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) out[k] = v == null ? '' : String(v);
        return { ok: true, rows: [out] };
      }
      return { ok: false, error: 'JSON data must be an object or array of objects.' };
    } catch (err) {
      if (hint === 'json') return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return { ok: true, rows: parseCsv(trimmed) };
}

function parseCsv(text: string): DataRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return [{}];
  const headers = splitCsvLine(lines[0]!);
  if (lines.length === 1) return [{}];
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: DataRow = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? '';
    });
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      i++;
      let buf = '';
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          buf += '"';
          i += 2;
          continue;
        }
        if (line[i] === '"') {
          i++;
          break;
        }
        buf += line[i]!;
        i++;
      }
      out.push(buf);
      if (line[i] === ',') i++;
      continue;
    }
    let buf = '';
    while (i < line.length && line[i] !== ',') {
      buf += line[i]!;
      i++;
    }
    out.push(buf.trim());
    if (line[i] === ',') i++;
  }
  return out;
}
