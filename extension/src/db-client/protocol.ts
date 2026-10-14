/** Mirror of cli protocol chunk helpers for the extension (no Node Buffer). */

export const HOST_NAME = 'com.detour.db';
/** Must match `cli/src/db/protocol.ts` PROTOCOL_VERSION. */
export const PROTOCOL_VERSION = 1;
export const CHUNK_PAYLOAD_MAX = 900 * 1024;

export type HelloResult = {
  protocolVersion: number;
  hostVersion: string;
  capabilities: string[];
};

export type ChunkEnvelope = {
  chunked: true;
  requestId: string | number;
  index: number;
  total: number;
  payload: string;
};

export function isChunkEnvelope(value: unknown): value is ChunkEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.chunked === true &&
    typeof v.payload === 'string' &&
    typeof v.index === 'number' &&
    typeof v.total === 'number'
  );
}

export function reassembleChunks(chunks: ChunkEnvelope[]): unknown {
  const ordered = [...chunks].sort((a, b) => a.index - b.index);
  if (ordered.length === 0) throw new Error('No chunks to reassemble');
  const total = ordered[0]!.total;
  if (ordered.length !== total) throw new Error(`Expected ${total} chunks, got ${ordered.length}`);
  return JSON.parse(ordered.map((c) => c.payload).join(''));
}

/** Compare host hello to the extension's expected protocol version. */
export function protocolMismatchMessage(
  hello: HelloResult,
  expected = PROTOCOL_VERSION,
): string | null {
  if (hello.protocolVersion === expected) return null;
  if (hello.protocolVersion < expected) {
    return `Helper too old (protocol ${hello.protocolVersion}; this extension needs ${expected}). Update the database helper.`;
  }
  return `Helper too new (protocol ${hello.protocolVersion}; this extension supports ${expected}). Update the extension.`;
}

/** Engine ids advertised as `engine:<id>` in hello capabilities. */
export function enginesFromCapabilities(capabilities: string[]): string[] {
  const out: string[] = [];
  for (const c of capabilities) {
    if (c.startsWith('engine:')) {
      const id = c.slice('engine:'.length);
      if (id) out.push(id);
    }
  }
  return out;
}

export function hasCapability(capabilities: string[], name: string): boolean {
  return capabilities.includes(name);
}

export type NativePortLike = {
  postMessage(message: unknown): void;
  onMessage: { addListener(cb: (msg: unknown) => void): void; removeListener?(cb: (msg: unknown) => void): void };
  onDisconnect: { addListener(cb: () => void): void };
  disconnect(): void;
};

export type ConnectNative = (name: string) => NativePortLike;

type RuntimeWithConnectNative = {
  connectNative?: (application: string) => NativePortLike;
};

/** True when chrome or browser runtime exposes connectNative as a function. */
export function isConnectNativeAvailable(): boolean {
  const chromeRt = (globalThis as { chrome?: { runtime?: RuntimeWithConnectNative } }).chrome?.runtime;
  if (typeof chromeRt?.connectNative === 'function') return true;
  const browserRt = (globalThis as { browser?: { runtime?: RuntimeWithConnectNative } }).browser?.runtime;
  return typeof browserRt?.connectNative === 'function';
}

/**
 * Prefer `chrome.runtime.connectNative`. WXT's `browser` (webextension-polyfill)
 * often omits `connectNative` on Chromium, which surfaces as
 * "browser.runtime.connectNative is not a function" from the options page.
 * After optional nativeMessaging is first granted, Chrome often leaves the API
 * undefined until the extension reloads — probe with isConnectNativeAvailable().
 */
export function connectNativePort(name: string): NativePortLike {
  const chromeRt = (globalThis as { chrome?: { runtime?: RuntimeWithConnectNative } }).chrome?.runtime;
  if (typeof chromeRt?.connectNative === 'function') {
    return chromeRt.connectNative(name);
  }
  const browserRt = (globalThis as { browser?: { runtime?: RuntimeWithConnectNative } }).browser?.runtime;
  if (typeof browserRt?.connectNative === 'function') {
    return browserRt.connectNative(name);
  }
  throw new Error('Native messaging is not available (connectNative missing).');
}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  chunks: ChunkEnvelope[];
};

/**
 * JSON-RPC client over chrome.runtime.connectNative (see connectNativePort).
 */
export function createNativeRpcClient(connectNative: ConnectNative, hostName = HOST_NAME) {
  let port: NativePortLike | null = null;
  let nextId = 1;
  const pending = new Map<string | number, Pending>();
  let onDisconnectUser: (() => void) | undefined;

  function ensurePort(): NativePortLike {
    if (port) return port;
    port = connectNative(hostName);
    const onMessage = (msg: unknown) => {
      const body = msg as { id?: string | number; result?: unknown; error?: { message: string } };
      if (body.id === undefined) return;
      const slot = pending.get(body.id);
      if (!slot) return;
      if (body.error) {
        pending.delete(body.id);
        slot.reject(new Error(body.error.message));
        return;
      }
      if (isChunkEnvelope(body.result)) {
        slot.chunks.push(body.result);
        if (slot.chunks.length >= body.result.total) {
          pending.delete(body.id);
          try {
            slot.resolve(reassembleChunks(slot.chunks));
          } catch (e) {
            slot.reject(e instanceof Error ? e : new Error(String(e)));
          }
        }
        return;
      }
      pending.delete(body.id);
      slot.resolve(body.result);
    };
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(() => {
      port = null;
      for (const [id, slot] of pending) {
        pending.delete(id);
        slot.reject(new Error('Native host disconnected'));
      }
      onDisconnectUser?.();
    });
    return port;
  }

  return {
    setOnDisconnect(cb: (() => void) | undefined) {
      onDisconnectUser = cb;
    },
    isConnected() {
      return port !== null;
    },
    async request(method: string, params?: unknown): Promise<unknown> {
      const p = ensurePort();
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject, chunks: [] });
        try {
          p.postMessage({ jsonrpc: '2.0', id, method, params });
        } catch (e) {
          pending.delete(id);
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      });
    },
    disconnect() {
      try {
        port?.disconnect();
      } catch {
        /* ignore */
      }
      port = null;
    },
  };
}

export type NativeRpcClient = ReturnType<typeof createNativeRpcClient>;
