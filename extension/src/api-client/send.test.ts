import { describe, expect, it, vi } from 'vitest';
import { sendRequest } from './send';

describe('sendRequest', () => {
  it('records status timing size and body', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('{"ok":true}', {
        status: 201,
        statusText: 'Created',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const res = await sendRequest({
      method: 'POST',
      url: 'https://example.com/a',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(res.status).toBe(201);
    expect(res.body).toBe('{"ok":true}');
    expect(res.sizeBytes).toBeGreaterThan(0);
    expect(res.timeMs).toBeGreaterThanOrEqual(0);
    expect(res.headers['content-type']).toMatch(/json/);
  });

  it('surfaces abort as timeout when internal timer fires', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    );
    const res = await sendRequest({
      method: 'GET',
      url: 'https://example.com/slow',
      headers: {},
      timeoutMs: 20,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(res.status).toBe(0);
    expect(res.error).toMatch(/Timed out/);
  });

  it('reports download progress when Content-Length is present', async () => {
    const body = 'abcdefghij';
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body.slice(0, 4)));
        controller.enqueue(new TextEncoder().encode(body.slice(4)));
        controller.close();
      },
    });
    const fetchImpl = vi.fn(async () =>
      new Response(stream, {
        status: 200,
        headers: { 'Content-Length': String(body.length) },
      }),
    );
    const events: { phase: string; bytesReceived: number; fraction: number | null }[] = [];
    const res = await sendRequest({
      method: 'GET',
      url: 'https://example.com/stream',
      headers: {},
      fetchImpl: fetchImpl as unknown as typeof fetch,
      onProgress: (p) => events.push({ phase: p.phase, bytesReceived: p.bytesReceived, fraction: p.fraction }),
    });
    expect(res.body).toBe(body);
    expect(events.some((e) => e.phase === 'waiting')).toBe(true);
    expect(events.some((e) => e.phase === 'downloading' && e.bytesReceived > 0)).toBe(true);
    expect(events.some((e) => e.fraction != null && e.fraction > 0)).toBe(true);
  });
});
