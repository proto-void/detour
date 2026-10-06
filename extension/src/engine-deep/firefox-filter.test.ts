import { describe, expect, it } from 'vitest';
import { createFirefoxBodyFilter, pipeReplacement, pipeReplacementBytes, type StreamFilter, type WebRequestApi, type WebRequestDetails } from './firefox-filter';
import type { BodyRule } from './plan';

function fakeFilter(): StreamFilter & { written: Uint8Array[]; closed: boolean; disconnected: boolean } {
  const written: Uint8Array[] = [];
  return {
    ondata: null,
    onstop: null,
    onerror: null,
    written,
    closed: false,
    disconnected: false,
    write(data) {
      written.push(data);
    },
    close() {
      this.closed = true;
    },
    disconnect() {
      this.disconnected = true;
    },
  };
}

function fakeWebRequest() {
  const filters: ReturnType<typeof fakeFilter>[] = [];
  let before: ((details: WebRequestDetails) => void) | undefined;
  let headers: ((details: WebRequestDetails & { responseHeaders?: { name: string; value: string }[] }) => { responseHeaders?: { name: string; value: string }[] } | void) | undefined;
  const api: WebRequestApi = {
    onBeforeRequest: {
      addListener(cb) {
        before = cb;
      },
      removeListener() {
        before = undefined;
      },
      hasListener(cb) {
        return before === cb;
      },
    },
    onHeadersReceived: {
      addListener(cb) {
        headers = cb;
      },
      removeListener() {
        headers = undefined;
      },
      hasListener(cb) {
        return headers === cb;
      },
    },
    filterResponseData() {
      const filter = fakeFilter();
      filters.push(filter);
      return filter;
    },
  };
  return {
    api,
    filters,
    get before() {
      return before;
    },
    get headers() {
      return headers;
    },
  };
}

const rule: BodyRule = {
  groupId: 'g',
  ruleId: 'b',
  match: { kind: 'glob', pattern: 'https://cdn.example.com/*.js' },
  caseSensitive: false,
  resourceTypes: ['script'],
  body: 'window.A = "LOCAL"',
  contentType: 'text/javascript',
};

describe('firefox body filter', () => {
  it('drops the original bytes and writes the replacement', () => {
    const filter = fakeFilter();
    pipeReplacement(filter, 'next');
    filter.ondata?.({ data: new TextEncoder().encode('original').buffer });
    filter.onstop?.();
    expect(filter.written.map((chunk) => new TextDecoder().decode(chunk))).toEqual(['next']);
    expect(filter.closed).toBe(true);
  });

  it('filters only matching requests and removes the listener when cleared', () => {
    const web = fakeWebRequest();
    const notes: { ruleId: string; url: string; tabId: number }[] = [];
    const engine = createFirefoxBodyFilter(web.api, (note) => notes.push(note));
    engine.install([rule]);
    web.before?.({ requestId: '1', url: 'https://cdn.example.com/app.js', type: 'script', tabId: 4, documentUrl: 'https://app.example.com/' });
    web.before?.({ requestId: '2', url: 'https://cdn.example.com/app.css', type: 'stylesheet', documentUrl: 'https://app.example.com/' });
    expect(web.filters).toHaveLength(1);
    expect(notes).toEqual([{ groupId: 'g', ruleId: 'b', url: 'https://cdn.example.com/app.js', tabId: 4 }]);
    expect(JSON.stringify(notes)).not.toContain('LOCAL');
    web.filters[0]!.onstop?.();
    expect(new TextDecoder().decode(web.filters[0]!.written[0]!)).toBe('window.A = "LOCAL"');

    const rewritten = web.headers?.({
      requestId: '1',
      url: 'https://cdn.example.com/app.js',
      type: 'script',
      documentUrl: 'https://app.example.com/',
      responseHeaders: [{ name: 'Content-Encoding', value: 'gzip' }, { name: 'Content-Type', value: 'text/plain' }],
    });
    expect(rewritten?.responseHeaders).toEqual([{ name: 'Content-Type', value: 'text/javascript' }]);

    engine.clear();
    expect(web.before).toBeUndefined();
    expect(web.headers).toBeUndefined();
  });

  it('holds the original stream until bridge bytes arrive, and does not record a failed read', async () => {
    const filter = fakeFilter();
    let resolve: (bytes: Uint8Array | undefined) => void = () => {};
    const pending = new Promise<Uint8Array | undefined>((done) => {
      resolve = done;
    });
    pipeReplacementBytes(filter, pending);
    filter.ondata?.({ data: new TextEncoder().encode('PROD').buffer });
    filter.onstop?.();
    expect(filter.closed).toBe(false);
    resolve(new TextEncoder().encode('DISK'));
    await Promise.resolve();
    expect(new TextDecoder().decode(filter.written[0]!)).toBe('DISK');
    expect(filter.closed).toBe(true);

    const web = fakeWebRequest();
    const notes: { url: string }[] = [];
    const engine = createFirefoxBodyFilter(web.api, (note) => notes.push(note));
    const token = 'cd'.repeat(32);
    engine.install([{ ...rule, body: '', contentType: undefined, bridgePath: 'app.js' }], async () => ({ ok: false }));
    web.before?.({ requestId: '9', url: 'https://cdn.example.com/app.js', type: 'script', tabId: 2, documentUrl: 'https://app.example.com/' });
    const missed = web.filters.at(-1)!;
    const prod = new TextEncoder().encode('PROD');
    missed.ondata?.({ data: prod.buffer.slice(prod.byteOffset, prod.byteOffset + prod.byteLength) });
    missed.onstop?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(new TextDecoder().decode(missed.written[0]!)).toBe('PROD');
    expect(notes).toEqual([]);
    expect(JSON.stringify(notes)).not.toContain(token);

    const rewritten = web.headers?.({
      requestId: '9',
      url: 'https://cdn.example.com/app.js',
      type: 'script',
      documentUrl: 'https://app.example.com/',
      responseHeaders: [{ name: 'Content-Encoding', value: 'gzip' }],
    });
    expect(rewritten?.responseHeaders).toContainEqual({ name: 'content-type', value: 'text/javascript; charset=utf-8' });
    expect(rewritten?.responseHeaders).toContainEqual({ name: 'cache-control', value: 'no-store' });
    expect(JSON.stringify(rewritten).toLowerCase()).not.toContain('content-encoding');
  });
});
