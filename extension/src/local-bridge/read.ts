import { bridgeFileUrl, contentTypeForRelative, isSafeRelative, type BridgeEndpoint } from './paths';

/** Cap so a huge file is not copied into the service worker. */
export const MAX_BRIDGE_BODY_BYTES = 8 * 1024 * 1024;

export type BridgeRead = { ok: true; bytes: Uint8Array; contentType: string } | { ok: false };

export type ReadBridgeFile = (filePath: string) => Promise<BridgeRead>;

/**
 * Read one file from the connected bridge. The URL is always `http://127.0.0.1`.
 * Callers must not log the return path: it contains the session token.
 */
export async function readBridgeFile(
  session: BridgeEndpoint,
  filePath: string,
  fetchImpl: typeof fetch = fetch,
  maxBytes = MAX_BRIDGE_BODY_BYTES,
): Promise<BridgeRead> {
  if (!isSafeRelative(filePath)) return { ok: false };
  const url = bridgeFileUrl(session, filePath);
  if (!url || !url.startsWith('http://127.0.0.1:')) return { ok: false };
  try {
    const res = await fetchImpl(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(4000),
      headers: { authorization: `Bearer ${session.token}` },
    });
    if (!res.ok) return { ok: false };
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > maxBytes) return { ok: false };
    const header = res.headers.get('content-type')?.trim();
    return { ok: true, bytes, contentType: header || contentTypeForRelative(filePath) };
  } catch {
    return { ok: false };
  }
}
