import {
  parseContentLength,
  progressFraction,
  type SendProgress,
} from './send-progress';

export type { SendProgress } from './send-progress';

export interface SendRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string | null;
  /** Abort after this many ms. Default 30_000. */
  timeoutMs?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  /** Optional progress while waiting / downloading (Content-Length enables fraction + ETA). */
  onProgress?: (progress: SendProgress) => void;
}

export interface SendResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  timeMs: number;
  sizeBytes: number;
  error?: string;
}

const headerMap = (headers: Headers): Record<string, string> => {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
};

async function readBodyWithProgress(
  res: Response,
  started: number,
  onProgress?: (progress: SendProgress) => void,
): Promise<string> {
  const contentLength = parseContentLength(res.headers);
  const report = (phase: SendProgress['phase'], bytesReceived: number) => {
    onProgress?.({
      phase,
      elapsedMs: Math.round(performance.now() - started),
      bytesReceived,
      contentLength,
      fraction: progressFraction(bytesReceived, contentLength),
    });
  };

  if (!res.body || typeof res.body.getReader !== 'function') {
    const body = await res.text();
    const bytes = new TextEncoder().encode(body).length;
    report('downloading', bytes);
    return body;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  report('downloading', 0);

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value?.byteLength) {
      chunks.push(value);
      received += value.byteLength;
      report('downloading', received);
    }
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

/** Extension-page fetch with timing, size, timeout, and optional download progress. */
export async function sendRequest(input: SendRequest): Promise<SendResponse> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const timeoutMs = input.timeoutMs ?? 30_000;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  input.signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  const tick =
    input.onProgress &&
    setInterval(() => {
      input.onProgress?.({
        phase: 'waiting',
        elapsedMs: Math.round(performance.now() - started),
        bytesReceived: 0,
        contentLength: null,
        fraction: null,
      });
    }, 100);

  try {
    input.onProgress?.({
      phase: 'waiting',
      elapsedMs: 0,
      bytesReceived: 0,
      contentLength: null,
      fraction: null,
    });

    const res = await fetchImpl(input.url, {
      method: input.method,
      headers: input.headers,
      body: input.body ?? undefined,
      signal: controller.signal,
    });
    if (tick) clearInterval(tick);

    const body = await readBodyWithProgress(res, started, input.onProgress);
    const timeMs = Math.round(performance.now() - started);
    const sizeBytes = new TextEncoder().encode(body).length;
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      headers: headerMap(res.headers),
      body,
      timeMs,
      sizeBytes,
    };
  } catch (err) {
    const timeMs = Math.round(performance.now() - started);
    const message = err instanceof Error ? err.message : String(err);
    const aborted = controller.signal.aborted;
    return {
      ok: false,
      status: 0,
      statusText: '',
      headers: {},
      body: '',
      timeMs,
      sizeBytes: 0,
      error: aborted && !input.signal?.aborted ? `Timed out after ${timeoutMs} ms` : message,
    };
  } finally {
    if (tick) clearInterval(tick);
    clearTimeout(timer);
    input.signal?.removeEventListener('abort', onAbort);
  }
}
