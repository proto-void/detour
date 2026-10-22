import { describe, expect, it } from 'vitest';
import { bridgeFileUrl } from './paths';
import { readBridgeFile } from './read';

const TOKEN = 'ab'.repeat(32);

describe('readBridgeFile', () => {
  it('reads bytes from 127.0.0.1 only and sends the bearer token', async () => {
    const calls: { url: string; authorization: string | null }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), authorization: new Headers(init?.headers).get('authorization') });
      return new Response(new Uint8Array([0xff, 0x00]), { status: 200, headers: { 'content-type': 'application/octet-stream' } });
    }) as typeof fetch;

    const read = await readBridgeFile({ port: 47321, token: TOKEN }, 'assets/app.js', fetchImpl);
    expect(read).toEqual({ ok: true, bytes: new Uint8Array([0xff, 0x00]), contentType: 'application/octet-stream' });
    expect(calls).toEqual([{ url: bridgeFileUrl({ port: 47321, token: TOKEN }, 'assets/app.js'), authorization: `Bearer ${TOKEN}` }]);
    expect(calls[0]?.url.startsWith('http://127.0.0.1:47321/')).toBe(true);
  });

  it('does not fetch a path that leaves the folder', async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response('no');
    }) as typeof fetch;
    expect(await readBridgeFile({ port: 47321, token: TOKEN }, '../secret', fetchImpl)).toEqual({ ok: false });
    expect(called).toBe(false);
  });

  it('leaves an oversized file unread by the caller', async () => {
    const fetchImpl = (async () => new Response('12345', { status: 200 })) as typeof fetch;
    expect(await readBridgeFile({ port: 47321, token: TOKEN }, 'a.js', fetchImpl, 4)).toEqual({ ok: false });
  });
});
