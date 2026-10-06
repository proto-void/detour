import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMocks, type MockWindow } from './mock-runtime';
import type { MockEntry } from './plan';

const entry = (over: Partial<MockEntry> = {}): MockEntry => ({
  groupId: 'g',
  ruleId: 'r',
  request: { source: '^https://app\\.test/api/.*?$', flags: 'i' },
  method: 'ANY',
  status: 200,
  headers: [{ name: 'content-type', value: 'application/json' }],
  body: '{"mocked":true}',
  delayMs: 0,
  ...over,
});

/** A minimal XHR whose "network" answers 299 "network:<url>" and records sends. */
class FakeXhr extends EventTarget {
  static sent: { method: string; url: string; body: unknown }[] = [];
  responseType = '';
  #method = '';
  #url = '';
  #state = 0;
  #status = 0;
  #text = '';
  [key: `on${string}`]: unknown;
  open(method: string, url: string) {
    this.#method = method;
    this.#url = url;
    this.#state = 1;
  }
  send(body?: unknown) {
    if (this.#state !== 1) throw new Error('InvalidStateError');
    FakeXhr.sent.push({ method: this.#method, url: this.#url, body });
    this.#state = 4;
    this.#status = 299;
    this.#text = `network:${this.#url}`;
    this.dispatchEvent(new Event('readystatechange'));
    this.dispatchEvent(new Event('load'));
  }
  abort() {}
  getResponseHeader() {
    return 'native';
  }
  getAllResponseHeaders() {
    return 'native: 1\r\n';
  }
  get readyState() {
    return this.#state;
  }
  get status() {
    return this.#status;
  }
  get statusText() {
    return 'native';
  }
  get responseURL() {
    return this.#url;
  }
  get responseText() {
    return this.#text;
  }
  get response() {
    return this.#text;
  }
  override dispatchEvent(event: Event) {
    (this[`on${event.type}`] as ((e: Event) => void) | undefined)?.(event);
    return super.dispatchEvent(event);
  }
}

let network: ReturnType<typeof vi.fn>;
let win: MockWindow;

beforeEach(() => {
  vi.useFakeTimers();
  FakeXhr.sent = [];
  class Xhr extends FakeXhr {}
  network = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => new Response(`network:${String(input instanceof Request ? input.url : input)}`, { status: 299, headers: { 'x-init': JSON.stringify(init ?? null) } }));
  win = {
    fetch: network as unknown as typeof fetch,
    Request,
    Response,
    Headers,
    Event,
    Blob,
    XMLHttpRequest: Xhr as unknown as typeof XMLHttpRequest,
    location: { href: 'https://app.test/page', hostname: 'app.test' },
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
  };
});
afterEach(() => vi.useRealTimers());

describe('fetch', () => {
  it('mocks a matching request (relative URL resolved against the page)', async () => {
    installMocks(win).setConfig([entry({ status: 201 })]);
    const res = await win.fetch('/api/users');
    expect(res.status).toBe(201);
    expect(res.url).toBe('https://app.test/api/users');
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.json()).toEqual({ mocked: true });
    expect(network).not.toHaveBeenCalled();
  });

  it('passes non-matching requests through with the original arguments', async () => {
    installMocks(win).setConfig([entry()]);
    const init = { method: 'POST', body: 'x' };
    const res = await win.fetch('https://cdn.test/a.js', init);
    expect(res.status).toBe(299);
    expect(network).toHaveBeenCalledWith('https://cdn.test/a.js', init);
  });

  it('matches the method (from init or a Request)', async () => {
    installMocks(win).setConfig([entry({ method: 'POST' })]);
    expect((await win.fetch('https://app.test/api/x')).status).toBe(299);
    expect((await win.fetch('https://app.test/api/x', { method: 'post' })).status).toBe(200);
    expect((await win.fetch(new Request('https://app.test/api/x', { method: 'POST' }))).status).toBe(200);
  });

  it('uses the first matching mock', async () => {
    installMocks(win).setConfig([entry({ status: 202 }), entry({ status: 203 })]);
    expect((await win.fetch('https://app.test/api/x')).status).toBe(202);
  });

  it('gives 204/205/304 and HEAD a null body', async () => {
    installMocks(win).setConfig([entry({ status: 204 })]);
    const res = await win.fetch('https://app.test/api/x');
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
  });

  it('delays and honors AbortSignal during the delay', async () => {
    installMocks(win).setConfig([entry({ delayMs: 500 })]);
    const done = vi.fn();
    void win.fetch('https://app.test/api/slow').then(done);
    await vi.advanceTimersByTimeAsync(499);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalled();

    const controller = new AbortController();
    const aborted = win.fetch('https://app.test/api/slow', { signal: controller.signal });
    controller.abort();
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('holds early requests until config arrives', async () => {
    const runtime = installMocks(win);
    const pending = win.fetch('https://app.test/api/early');
    await vi.advanceTimersByTimeAsync(10);
    runtime.setConfig([entry({ status: 207 })]);
    expect((await pending).status).toBe(207);
  });

  it('passes held requests through when no config arrives in time', async () => {
    installMocks(win, { holdMs: 1000 });
    const pending = win.fetch('https://app.test/api/early');
    await vi.advanceTimersByTimeAsync(1000);
    expect((await pending).status).toBe(299);
  });

  it('turns off without reload when the config empties', async () => {
    const runtime = installMocks(win);
    runtime.setConfig([entry()]);
    expect((await win.fetch('https://app.test/api/x')).status).toBe(200);
    runtime.setConfig([]);
    expect((await win.fetch('https://app.test/api/x')).status).toBe(299);
  });

  it('respects site scoping', async () => {
    installMocks(win).setConfig([entry({ request: { source: '.*', flags: '', domains: ['other.test'] } })]);
    expect((await win.fetch('https://app.test/api/x')).status).toBe(299);
  });
});

describe('XMLHttpRequest', () => {
  const xhr = () => new win.XMLHttpRequest!();
  const events = (x: XMLHttpRequest) => {
    const seen: string[] = [];
    for (const type of ['loadstart', 'readystatechange', 'progress', 'load', 'loadend', 'abort']) x.addEventListener(type, () => seen.push(type === 'readystatechange' ? `rs${x.readyState}` : type));
    return seen;
  };

  it('mocks a matching async request with events, headers and body', async () => {
    installMocks(win).setConfig([entry({ status: 202 })]);
    const x = xhr();
    const seen = events(x);
    const onload = vi.fn();
    x.onload = onload;
    x.open('GET', '/api/users');
    x.send();
    await vi.runAllTimersAsync();
    expect(seen).toEqual(['loadstart', 'rs2', 'rs3', 'progress', 'rs4', 'load', 'loadend']);
    expect(onload).toHaveBeenCalled();
    expect(x.status).toBe(202);
    expect(x.responseText).toBe('{"mocked":true}');
    expect(x.responseURL).toBe('https://app.test/api/users');
    expect(x.getResponseHeader('Content-Type')).toBe('application/json');
    expect(x.getAllResponseHeaders()).toBe('content-type: application/json\r\n');
    expect(FakeXhr.sent).toEqual([]);
  });

  it('parses responseType json', async () => {
    installMocks(win).setConfig([entry()]);
    const x = xhr();
    x.responseType = 'json';
    x.open('GET', 'https://app.test/api/x');
    x.send();
    await vi.runAllTimersAsync();
    expect(x.response).toEqual({ mocked: true });
  });

  it('passes non-matching and method-mismatched requests to the native send', async () => {
    installMocks(win).setConfig([entry({ method: 'POST' })]);
    const x = xhr();
    x.open('GET', 'https://app.test/api/x');
    x.send();
    await vi.runAllTimersAsync();
    expect(FakeXhr.sent).toEqual([{ method: 'GET', url: 'https://app.test/api/x', body: undefined }]);
    expect(x.status).toBe(299);
    expect(x.getResponseHeader('x')).toBe('native');
  });

  it('passes sync XHR through, even when it matches', () => {
    installMocks(win).setConfig([entry()]);
    const x = xhr();
    x.open('GET', 'https://app.test/api/x', false);
    x.send();
    expect(FakeXhr.sent).toHaveLength(1);
  });

  it('aborts a delayed mock', async () => {
    installMocks(win).setConfig([entry({ delayMs: 100 })]);
    const x = xhr();
    const seen = events(x);
    x.open('GET', 'https://app.test/api/x');
    x.send();
    await vi.advanceTimersByTimeAsync(10);
    x.abort();
    await vi.runAllTimersAsync();
    expect(seen).toEqual(['loadstart', 'rs4', 'abort', 'loadend']);
    expect(x.readyState).toBe(0);
    expect(x.status).toBe(0);
  });

  it('holds async requests until config arrives', async () => {
    const runtime = installMocks(win);
    const x = xhr();
    x.open('GET', 'https://app.test/api/x');
    x.send();
    expect(FakeXhr.sent).toEqual([]);
    runtime.setConfig([]);
    await vi.runAllTimersAsync();
    expect(FakeXhr.sent).toHaveLength(1);
  });
});
