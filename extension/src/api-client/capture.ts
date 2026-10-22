import { emptyRequest, type ApiRequest, type HttpMethod, HTTP_METHODS } from './model';

/** Session storage key: pending request to open in API Tester. */
export const API_CAPTURE_KEY = 'apiCapturePending';

export interface CapturedRequest {
  method: string;
  url: string;
  headers?: { name: string; value: string }[];
  body?: string;
  source?: 'devtools' | 'match-log' | 'manual';
}

export function capturedToApiRequest(captured: CapturedRequest, id = crypto.randomUUID()): ApiRequest {
  const methodRaw = (captured.method || 'GET').toUpperCase();
  const method = (HTTP_METHODS as readonly string[]).includes(methodRaw) ? (methodRaw as HttpMethod) : 'GET';
  const req = emptyRequest(id, `${method} ${shortUrl(captured.url)}`);
  req.method = method;
  req.url = captured.url;
  req.headers = (captured.headers ?? []).map((h, i) => ({
    id: `h${i}`,
    key: h.name,
    value: h.value,
    enabled: true,
  }));
  if (captured.body) {
    req.body = { mode: 'raw', text: captured.body, language: looksJson(captured.body) ? 'json' : 'text' };
  }
  return req;
}

function shortUrl(url: string): string {
  try {
    return new URL(url).pathname || url;
  } catch {
    return url.slice(0, 40);
  }
}

function looksJson(s: string): boolean {
  const t = s.trim();
  return t.startsWith('{') || t.startsWith('[');
}

export async function queueCapture(
  area: { set(items: Record<string, unknown>): Promise<void> },
  captured: CapturedRequest,
): Promise<void> {
  await area.set({ [API_CAPTURE_KEY]: { ...captured, at: Date.now() } });
}

export async function takeCapture(
  area: { get(keys: string): Promise<Record<string, unknown>>; remove(keys: string): Promise<void> },
): Promise<CapturedRequest | null> {
  const bag = await area.get(API_CAPTURE_KEY);
  const value = bag[API_CAPTURE_KEY] as CapturedRequest | undefined;
  if (!value?.url) return null;
  await area.remove(API_CAPTURE_KEY);
  return value;
}
