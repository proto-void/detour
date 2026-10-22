import { createCollection } from './collections';
import { emptyRequest, HTTP_METHODS, type Collection, type HttpMethod } from './model';

export type HarImportResult = { ok: true; collection: Collection } | { ok: false; error: string };

interface HarEntry {
  request?: {
    method?: string;
    url?: string;
    headers?: { name: string; value: string }[];
    queryString?: { name: string; value: string }[];
    postData?: { text?: string; mimeType?: string };
  };
}

/**
 * Import a HAR log into an API Tester collection (one request per entry).
 */
export function importHar(text: string): HarImportResult {
  let har: { log?: { entries?: HarEntry[] } };
  try {
    har = JSON.parse(text) as { log?: { entries?: HarEntry[] } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const entries = har.log?.entries;
  if (!Array.isArray(entries) || entries.length === 0) return { ok: false, error: 'HAR has no log.entries.' };

  let collection = createCollection('HAR import');
  const children = [];
  for (const entry of entries) {
    const r = entry.request;
    if (!r?.url) continue;
    const methodRaw = (r.method ?? 'GET').toUpperCase();
    const method = (HTTP_METHODS as readonly string[]).includes(methodRaw) ? (methodRaw as HttpMethod) : 'GET';
    const id = crypto.randomUUID();
    const name = `${method} ${shortPath(r.url)}`;
    const req = emptyRequest(id, name);
    req.method = method;
    req.url = r.url;
    req.headers = (r.headers ?? [])
      .filter((h) => h.name && !h.name.startsWith(':'))
      .map((h, i) => ({ id: `h${i}`, key: h.name, value: h.value ?? '', enabled: true }));
    req.params = (r.queryString ?? []).map((q, i) => ({ id: `q${i}`, key: q.name, value: q.value ?? '', enabled: true }));
    if (r.postData?.text) {
      const mime = r.postData.mimeType ?? '';
      req.body = {
        mode: 'raw',
        text: r.postData.text,
        language: mime.includes('json') ? 'json' : 'text',
      };
    }
    children.push({ kind: 'request' as const, id, request: req });
  }
  if (children.length === 0) return { ok: false, error: 'No usable requests in HAR.' };
  collection = { ...collection, children };
  return { ok: true, collection };
}

function shortPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname || '/';
  } catch {
    return url.slice(0, 48);
  }
}
