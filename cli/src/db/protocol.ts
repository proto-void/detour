/** Native messaging host→browser messages must stay under 1 MB. */
export const NATIVE_MESSAGE_MAX = 1024 * 1024;
/** Leave headroom for JSON framing. */
export const CHUNK_PAYLOAD_MAX = 900 * 1024;

export const HOST_NAME = 'com.detour.db';
export const HOST_VERSION = '0.1.0';
/** Bump when breaking RPC shape; extension refuses mismatched helpers. */
export const PROTOCOL_VERSION = 1;

export type HelloResult = {
  protocolVersion: number;
  hostVersion: string;
  capabilities: string[];
};

export type RpcRequest = {
  jsonrpc?: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
};

export type RpcSuccess = {
  jsonrpc: '2.0';
  id: string | number;
  result: unknown;
};

export type RpcError = {
  jsonrpc: '2.0';
  id: string | number | null;
  error: { code: number; message: string; data?: unknown };
};

export type RpcResponse = RpcSuccess | RpcError;

export type ChunkEnvelope = {
  chunked: true;
  requestId: string | number;
  index: number;
  total: number;
  payload: string;
};

export function utf8ByteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

/** Split a JSON-serializable result into chunk envelopes when over the native cap. */
export function chunkResult(id: string | number, result: unknown): unknown[] {
  const encoded = JSON.stringify(result);
  if (utf8ByteLength(encoded) <= CHUNK_PAYLOAD_MAX) return [result];
  const parts: string[] = [];
  let offset = 0;
  while (offset < encoded.length) {
    let end = offset;
    let size = 0;
    while (end < encoded.length && size < CHUNK_PAYLOAD_MAX) {
      const code = encoded.charCodeAt(end)!;
      size += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0xd800 || code >= 0xe000 ? 3 : 4;
      end += code >= 0xd800 && code < 0xdc00 ? 2 : 1;
      if (size > CHUNK_PAYLOAD_MAX) {
        end -= code >= 0xd800 && code < 0xdc00 ? 2 : 1;
        break;
      }
    }
    parts.push(encoded.slice(offset, end));
    offset = end;
  }
  return parts.map((payload, index) => ({
    chunked: true as const,
    requestId: id,
    index,
    total: parts.length,
    payload,
  }));
}

export function reassembleChunks(chunks: ChunkEnvelope[]): unknown {
  const ordered = [...chunks].sort((a, b) => a.index - b.index);
  if (ordered.length === 0) throw new Error('No chunks to reassemble');
  const total = ordered[0]!.total;
  if (ordered.length !== total) throw new Error(`Expected ${total} chunks, got ${ordered.length}`);
  return JSON.parse(ordered.map((c) => c.payload).join(''));
}

export function isChunkEnvelope(value: unknown): value is ChunkEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.chunked === true && typeof v.payload === 'string' && typeof v.index === 'number' && typeof v.total === 'number';
}
