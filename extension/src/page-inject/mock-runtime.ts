import type { MockEntry } from './plan';
import { siteHost, testUrl } from './page-match';

/** DOM events between the isolated bridge and this MAIN-world runtime. Details are JSON strings. */
export const CONFIG_EVENT = '__detour_mock_config';
export const READY_EVENT = '__detour_mock_ready';
export const MOCK_HIT_EVENT = '__detour_mock_hit';

const NULL_BODY = new Set([204, 205, 304]);
const headerPairs = (m: MockEntry): [string, string][] => m.headers.map((h) => [h.name, h.value]);

/** The subset of `window` the runtime touches; tests pass a fake. */
export interface MockWindow {
  fetch: typeof fetch;
  Request: typeof Request;
  Response: typeof Response;
  Headers: typeof Headers;
  XMLHttpRequest?: typeof XMLHttpRequest;
  Event: typeof Event;
  ProgressEvent?: typeof ProgressEvent;
  Blob: typeof Blob;
  location: { href: string; hostname: string; ancestorOrigins?: { length: number; [i: number]: string } };
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: never) => void;
}

export interface MockRuntime {
  setConfig(mocks: MockEntry[]): void;
  /** Resolves once config has arrived or the hold timed out. */
  ready: Promise<void>;
}

const abortError = (signal: AbortSignal) => signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');

/**
 * Patches `fetch` and `XMLHttpRequest` in `win`. Matching requests get the first matching mock;
 * everything else goes to the native implementation with the original arguments.
 */
export function installMocks(win: MockWindow, { holdMs = 1000, onHit }: { holdMs?: number; onHit?: (mock: MockEntry) => void } = {}): MockRuntime {
  let mocks: MockEntry[] | undefined;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => (release = resolve));
  const timer = win.setTimeout(() => {
    mocks ??= [];
    release();
  }, holdMs);

  const resolveUrl = (url: string) => {
    try {
      return new URL(url, win.location.href).href;
    } catch {
      return url;
    }
  };
  const find = (url: string, method: string): MockEntry | undefined => {
    const host = siteHost(win.location);
    return mocks?.find((m) => (m.method === 'ANY' || m.method === method) && testUrl(m.request, url, host));
  };
  const decide = async (url: string, method: string) => {
    if (mocks === undefined) await ready;
    const hit = find(url, method);
    if (hit) onHit?.(hit);
    return hit;
  };
  const wait = (ms: number, signal?: AbortSignal | null) =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(abortError(signal));
      if (ms <= 0) return resolve();
      const id = win.setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        win.clearTimeout(id as never);
        reject(abortError(signal!));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
    });

  // fetch ---------------------------------------------------------------------------------------
  const nativeFetch = win.fetch;
  win.fetch = function fetch(this: unknown, ...args: Parameters<typeof globalThis.fetch>) {
    const [input, init] = args;
    const request = input instanceof win.Request ? input : undefined;
    const url = resolveUrl(request ? request.url : String(input));
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    const signal = init?.signal ?? request?.signal;
    const passThrough = () => nativeFetch.apply(win, args);
    if (mocks !== undefined && !find(url, method)) return passThrough();

    return decide(url, method).then(async (mock) => {
      if (!mock) return passThrough();
      await wait(mock.delayMs, signal);
      const body = NULL_BODY.has(mock.status) || method === 'HEAD' ? null : mock.body;
      const response = new win.Response(body, { status: mock.status, headers: headerPairs(mock) });
      Object.defineProperty(response, 'url', { value: url });
      return response;
    });
  } as typeof globalThis.fetch;

  // XMLHttpRequest ----------------------------------------------------------------------------
  if (win.XMLHttpRequest) patchXhr(win, win.XMLHttpRequest.prototype, { decide, resolveUrl });

  return {
    ready,
    setConfig(next) {
      mocks = next;
      win.clearTimeout(timer as never);
      release();
    },
  };
}

interface XhrState {
  method: string;
  url: string;
  async: boolean;
  /** Set once a mock answers this request. */
  mock?: { entry: MockEntry; readyState: number; status: number; headers: Headers; aborted?: boolean; timer?: unknown };
}

interface XhrDeps {
  decide: (url: string, method: string) => Promise<MockEntry | undefined>;
  resolveUrl: (url: string) => string;
}

function patchXhr(win: MockWindow, proto: XMLHttpRequest, { decide, resolveUrl }: XhrDeps) {
  const states = new WeakMap<XMLHttpRequest, XhrState>();
  const native = {
    open: proto.open,
    send: proto.send,
    abort: proto.abort,
    getResponseHeader: proto.getResponseHeader,
    getAllResponseHeaders: proto.getAllResponseHeaders,
  };
  const ProgressEventCtor = win.ProgressEvent ?? win.Event;
  const fire = (xhr: XMLHttpRequest, type: string, loaded = 0) =>
    xhr.dispatchEvent(type === 'readystatechange' ? new win.Event(type) : new ProgressEventCtor(type, { lengthComputable: loaded > 0, loaded, total: loaded }));

  proto.open = function open(this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    states.set(this, { method: String(method).toUpperCase(), url: resolveUrl(String(url)), async: rest.length === 0 || rest[0] !== false });
    return (native.open as (...a: unknown[]) => void).call(this, method, url, ...rest);
  } as XMLHttpRequest['open'];

  proto.send = function send(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    const state = states.get(this);
    // Unopened: let the native method throw. Sync XHR can't wait for config or a delay, so it passes through.
    if (!state || !state.async) return native.send.call(this, body);
    void decide(state.url, state.method).then((entry) => {
      if (states.get(this) !== state) return; // re-opened meanwhile
      if (!entry) return native.send.call(this, body);
      respond(this, state, entry);
    });
  };

  const respond = (xhr: XMLHttpRequest, state: XhrState, entry: MockEntry) => {
    const headers = new win.Headers(headerPairs(entry));
    const mock: NonNullable<XhrState['mock']> = (state.mock = { entry, readyState: 1, status: 0, headers });
    fire(xhr, 'loadstart');
    mock.timer = win.setTimeout(() => {
      if (mock.aborted) return;
      mock.status = entry.status;
      mock.readyState = 2;
      fire(xhr, 'readystatechange');
      mock.readyState = 3;
      fire(xhr, 'readystatechange');
      const size = NULL_BODY.has(entry.status) ? 0 : entry.body.length;
      fire(xhr, 'progress', size);
      mock.readyState = 4;
      fire(xhr, 'readystatechange');
      fire(xhr, 'load', size);
      fire(xhr, 'loadend', size);
    }, entry.delayMs);
  };

  proto.abort = function abort(this: XMLHttpRequest) {
    const mock = states.get(this)?.mock;
    if (!mock || mock.readyState === 4 || mock.aborted) return native.abort.call(this);
    mock.aborted = true;
    win.clearTimeout(mock.timer as never);
    mock.status = 0;
    mock.readyState = 4;
    fire(this, 'readystatechange');
    fire(this, 'abort');
    fire(this, 'loadend');
    mock.readyState = 0;
  };

  const mocked = (xhr: XMLHttpRequest) => states.get(xhr)?.mock;
  const bodyOf = (xhr: XMLHttpRequest, m: NonNullable<XhrState['mock']>) =>
    m.readyState < 3 || m.aborted || NULL_BODY.has(m.entry.status) || states.get(xhr)?.method === 'HEAD' ? '' : m.entry.body;

  proto.getResponseHeader = function getResponseHeader(this: XMLHttpRequest, name: string) {
    const m = mocked(this);
    if (!m) return native.getResponseHeader.call(this, name);
    return m.readyState >= 2 && !m.aborted ? m.headers.get(name) : null;
  };
  proto.getAllResponseHeaders = function getAllResponseHeaders(this: XMLHttpRequest) {
    const m = mocked(this);
    if (!m) return native.getAllResponseHeaders.call(this);
    if (m.readyState < 2 || m.aborted) return '';
    let out = '';
    m.headers.forEach((value, name) => (out += `${name}: ${value}\r\n`));
    return out;
  };

  const getter = <K extends keyof XMLHttpRequest>(key: K, value: (xhr: XMLHttpRequest, m: NonNullable<XhrState['mock']>) => unknown) => {
    const original = findDescriptor(proto, key);
    if (!original?.get) return;
    Object.defineProperty(proto, key, {
      ...original,
      get(this: XMLHttpRequest) {
        const m = mocked(this);
        return m ? value(this, m) : original.get!.call(this);
      },
    });
  };
  getter('readyState', (_, m) => m.readyState);
  getter('status', (_, m) => m.status);
  getter('statusText', () => '');
  getter('responseURL', (xhr, m) => (m.readyState >= 2 ? states.get(xhr)!.url : ''));
  getter('responseText', (xhr, m) => bodyOf(xhr, m));
  getter('response', (xhr, m) => {
    const text = bodyOf(xhr, m);
    switch (xhr.responseType) {
      case 'json':
        if (m.readyState < 4 || text === '') return null;
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      case 'arraybuffer':
        return m.readyState < 4 ? null : new TextEncoder().encode(text).buffer;
      case 'blob':
        return m.readyState < 4 ? null : new win.Blob([text], { type: m.headers.get('content-type') ?? '' });
      case 'document':
        return null;
      default:
        return text;
    }
  });
}

function findDescriptor(proto: object | null, key: PropertyKey): PropertyDescriptor | undefined {
  for (let p = proto; p; p = Object.getPrototypeOf(p)) {
    const d = Object.getOwnPropertyDescriptor(p, key);
    if (d) return d;
  }
  return undefined;
}
