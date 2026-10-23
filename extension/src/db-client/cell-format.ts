/** One-line preview for grid cells (blobs, JSON, primitives). */

const BLOB_PREVIEW = 48;
const JSON_PREVIEW = 120;

function isArrayBufferView(value: unknown): value is ArrayBufferView {
  return ArrayBuffer.isView(value);
}

function bytesPreview(bytes: Uint8Array): string {
  const n = Math.min(bytes.length, BLOB_PREVIEW);
  let hex = '';
  for (let i = 0; i < n; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  const suffix = bytes.length > BLOB_PREVIEW ? '…' : '';
  return `blob(${bytes.length}) ${hex}${suffix}`;
}

/**
 * Format a DB cell for a compact one-line grid. Never throws.
 */
export function formatDbCell(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : String(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') {
    const one = value.replace(/\s+/g, ' ').trim();
    return one.length > JSON_PREVIEW ? `${one.slice(0, JSON_PREVIEW)}…` : one;
  }
  if (value instanceof ArrayBuffer) {
    return bytesPreview(new Uint8Array(value));
  }
  if (isArrayBufferView(value)) {
    return bytesPreview(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  }
  if (typeof value === 'object') {
    // cassandra-driver / Buffer-like
    const maybe = value as { type?: string; data?: unknown; buffer?: ArrayBuffer };
    if (maybe.type === 'Buffer' && Array.isArray((value as { data?: unknown }).data)) {
      return bytesPreview(Uint8Array.from((value as { data: number[] }).data));
    }
    try {
      const json = JSON.stringify(value);
      if (json === undefined) return String(value);
      const one = json.replace(/\s+/g, ' ');
      return one.length > JSON_PREVIEW ? `${one.slice(0, JSON_PREVIEW)}…` : one;
    } catch {
      return Object.prototype.toString.call(value);
    }
  }
  return String(value);
}
