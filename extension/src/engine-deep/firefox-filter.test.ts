import { describe, expect, it } from 'vitest';
import { createFirefoxBodyFilter, pipeReplacement, type StreamFilter, type WebRequestApi, type WebRequestDetails } from './firefox-filter';
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
    const engine = createFirefoxBodyFilter(web.api);
    engine.install([rule]);
    web.before?.({ requestId: '1', url: 'https://cdn.example.com/app.js', type: 'script', documentUrl: 'https://app.example.com/' });
    web.before?.({ requestId: '2', url: 'https://cdn.example.com/app.css', type: 'stylesheet', documentUrl: 'https://app.example.com/' });
    expect(web.filters).toHaveLength(1);
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
});
