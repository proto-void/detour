import { describe, expect, it, vi } from 'vitest';
import {
  connectNativePort,
  createNativeRpcClient,
  enginesFromCapabilities,
  isChunkEnvelope,
  isConnectNativeAvailable,
  protocolMismatchMessage,
  PROTOCOL_VERSION,
  reassembleChunks,
  type NativePortLike,
} from './protocol';

describe('chunk reassembly', () => {
  it('rebuilds payload', () => {
    const data = { hello: 'world', n: 42 };
    const encoded = JSON.stringify(data);
    const mid = Math.floor(encoded.length / 2);
    const chunks = [
      { chunked: true as const, requestId: 1, index: 0, total: 2, payload: encoded.slice(0, mid) },
      { chunked: true as const, requestId: 1, index: 1, total: 2, payload: encoded.slice(mid) },
    ];
    expect(isChunkEnvelope(chunks[0])).toBe(true);
    expect(reassembleChunks(chunks)).toEqual(data);
  });
});

describe('hello / capabilities', () => {
  it('reports protocol mismatch', () => {
    expect(
      protocolMismatchMessage({
        protocolVersion: PROTOCOL_VERSION,
        hostVersion: '0.1.0',
        capabilities: [],
      }),
    ).toBeNull();
    expect(
      protocolMismatchMessage({
        protocolVersion: PROTOCOL_VERSION - 1,
        hostVersion: '0.0.1',
        capabilities: [],
      }),
    ).toMatch(/too old/i);
    expect(
      protocolMismatchMessage({
        protocolVersion: PROTOCOL_VERSION + 1,
        hostVersion: '9.0.0',
        capabilities: [],
      }),
    ).toMatch(/too new/i);
  });

  it('parses engine capabilities', () => {
    expect(enginesFromCapabilities(['engine:sqlite', 'ssh', 'engine:postgres'])).toEqual([
      'sqlite',
      'postgres',
    ]);
  });
});

describe('isConnectNativeAvailable', () => {
  it('is true when chrome.runtime.connectNative exists', () => {
    const prevChrome = (globalThis as { chrome?: unknown }).chrome;
    const prevBrowser = (globalThis as { browser?: unknown }).browser;
    (globalThis as { chrome?: unknown }).chrome = {
      runtime: { connectNative: vi.fn() },
    };
    (globalThis as { browser?: unknown }).browser = { runtime: {} };
    try {
      expect(isConnectNativeAvailable()).toBe(true);
    } finally {
      (globalThis as { chrome?: unknown }).chrome = prevChrome;
      (globalThis as { browser?: unknown }).browser = prevBrowser;
    }
  });

  it('is true when only browser.runtime.connectNative exists', () => {
    const prevChrome = (globalThis as { chrome?: unknown }).chrome;
    const prevBrowser = (globalThis as { browser?: unknown }).browser;
    (globalThis as { chrome?: unknown }).chrome = { runtime: {} };
    (globalThis as { browser?: unknown }).browser = {
      runtime: { connectNative: vi.fn() },
    };
    try {
      expect(isConnectNativeAvailable()).toBe(true);
    } finally {
      (globalThis as { chrome?: unknown }).chrome = prevChrome;
      (globalThis as { browser?: unknown }).browser = prevBrowser;
    }
  });

  it('is false when connectNative is missing on both runtimes', () => {
    const prevChrome = (globalThis as { chrome?: unknown }).chrome;
    const prevBrowser = (globalThis as { browser?: unknown }).browser;
    (globalThis as { chrome?: unknown }).chrome = { runtime: {} };
    (globalThis as { browser?: unknown }).browser = { runtime: {} };
    try {
      expect(isConnectNativeAvailable()).toBe(false);
    } finally {
      (globalThis as { chrome?: unknown }).chrome = prevChrome;
      (globalThis as { browser?: unknown }).browser = prevBrowser;
    }
  });
});

describe('connectNativePort', () => {
  it('prefers chrome.runtime.connectNative over browser', () => {
    const port = { postMessage: vi.fn(), onMessage: { addListener: vi.fn() }, onDisconnect: { addListener: vi.fn() }, disconnect: vi.fn() };
    const chromeConnect = vi.fn(() => port);
    const browserConnect = vi.fn(() => port);
    const prevChrome = (globalThis as { chrome?: unknown }).chrome;
    const prevBrowser = (globalThis as { browser?: unknown }).browser;
    (globalThis as { chrome?: unknown }).chrome = { runtime: { connectNative: chromeConnect } };
    (globalThis as { browser?: unknown }).browser = { runtime: { connectNative: browserConnect } };
    try {
      expect(connectNativePort('com.detour.db')).toBe(port);
      expect(chromeConnect).toHaveBeenCalledWith('com.detour.db');
      expect(browserConnect).not.toHaveBeenCalled();
    } finally {
      (globalThis as { chrome?: unknown }).chrome = prevChrome;
      (globalThis as { browser?: unknown }).browser = prevBrowser;
    }
  });

  it('falls back to browser.runtime.connectNative', () => {
    const port = { postMessage: vi.fn(), onMessage: { addListener: vi.fn() }, onDisconnect: { addListener: vi.fn() }, disconnect: vi.fn() };
    const browserConnect = vi.fn(() => port);
    const prevChrome = (globalThis as { chrome?: unknown }).chrome;
    const prevBrowser = (globalThis as { browser?: unknown }).browser;
    (globalThis as { chrome?: unknown }).chrome = { runtime: {} };
    (globalThis as { browser?: unknown }).browser = { runtime: { connectNative: browserConnect } };
    try {
      expect(connectNativePort('com.detour.db')).toBe(port);
      expect(browserConnect).toHaveBeenCalledWith('com.detour.db');
    } finally {
      (globalThis as { chrome?: unknown }).chrome = prevChrome;
      (globalThis as { browser?: unknown }).browser = prevBrowser;
    }
  });

  it('throws when neither API exposes connectNative', () => {
    const prevChrome = (globalThis as { chrome?: unknown }).chrome;
    const prevBrowser = (globalThis as { browser?: unknown }).browser;
    (globalThis as { chrome?: unknown }).chrome = { runtime: {} };
    (globalThis as { browser?: unknown }).browser = { runtime: {} };
    try {
      expect(() => connectNativePort('com.detour.db')).toThrow(/connectNative missing/);
    } finally {
      (globalThis as { chrome?: unknown }).chrome = prevChrome;
      (globalThis as { browser?: unknown }).browser = prevBrowser;
    }
  });
});

describe('createNativeRpcClient', () => {
  it('resolves RPC results and reassembles chunks', async () => {
    let listener: ((msg: unknown) => void) | undefined;
    const port: NativePortLike = {
      postMessage(msg) {
        const m = msg as { id: number; method: string };
        if (m.method === 'hello') {
          queueMicrotask(() =>
            listener?.({
              id: m.id,
              result: {
                protocolVersion: PROTOCOL_VERSION,
                hostVersion: '0.1.0',
                capabilities: ['engine:sqlite', 'ssh'],
              },
            }),
          );
          return;
        }
        if (m.method === 'version') {
          queueMicrotask(() => listener?.({ id: m.id, result: { version: '0.1.0' } }));
          return;
        }
        if (m.method === 'big') {
          const payload = JSON.stringify({ ok: true, data: 'z'.repeat(100) });
          const mid = 40;
          queueMicrotask(() => {
            listener?.({
              id: m.id,
              result: { chunked: true, requestId: m.id, index: 0, total: 2, payload: payload.slice(0, mid) },
            });
            listener?.({
              id: m.id,
              result: { chunked: true, requestId: m.id, index: 1, total: 2, payload: payload.slice(mid) },
            });
          });
        }
      },
      onMessage: {
        addListener(cb) {
          listener = cb;
        },
      },
      onDisconnect: { addListener: vi.fn() },
      disconnect: vi.fn(),
    };
    const client = createNativeRpcClient(() => port, 'com.example.db');
    await expect(client.request('hello')).resolves.toEqual({
      protocolVersion: PROTOCOL_VERSION,
      hostVersion: '0.1.0',
      capabilities: ['engine:sqlite', 'ssh'],
    });
    await expect(client.request('version')).resolves.toEqual({ version: '0.1.0' });
    await expect(client.request('big')).resolves.toEqual({ ok: true, data: 'z'.repeat(100) });
  });
});
