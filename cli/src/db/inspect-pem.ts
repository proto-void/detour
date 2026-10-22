import { open } from 'node:fs/promises';
import { resolvePath } from './paths.ts';

/** Max bytes read when inspecting a PEM key for encryption (RPC / UI). */
export const PEM_INSPECT_MAX_BYTES = 64 * 1024;

/**
 * Detect whether PEM bytes look like an encrypted private key.
 * Matches Go tlsutil: type `ENCRYPTED PRIVATE KEY`, or legacy Proc-Type /
 * DEK-Info encrypted PEM block (same rules as X509KeyPair).
 */
export function isEncryptedPemKey(data: string | Buffer): boolean {
  const text = typeof data === 'string' ? data : data.toString('utf8');
  const begin = /-----BEGIN (.+?)-----/.exec(text);
  if (!begin) return false;
  const type = begin[1]!.trim();
  if (type.toUpperCase() === 'ENCRYPTED PRIVATE KEY') return true;

  const after = text.slice(begin.index + begin[0].length);
  const endIdx = after.search(/-----END /);
  const headerAndBody = endIdx >= 0 ? after.slice(0, endIdx) : after;
  // Headers sit before the first blank line (RFC 1421); DEK-Info implies encrypted.
  const headerSection = headerAndBody.split(/\r?\n\r?\n/)[0] ?? headerAndBody;
  for (const line of headerSection.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^Proc-Type:\s*4,\s*ENCRYPTED/i.test(trimmed)) return true;
    if (/^DEK-Info:/i.test(trimmed)) return true;
  }
  return false;
}

/**
 * Read up to PEM_INSPECT_MAX_BYTES from path and report whether the PEM key is encrypted.
 * Missing/unreadable paths throw a clear error.
 */
export async function inspectPemKey(path: string): Promise<{ encrypted: boolean }> {
  const abs = resolvePath(path);
  let fh;
  try {
    fh = await open(abs, 'r');
  } catch {
    throw new Error(`Client key not found or unreadable: ${abs}`);
  }
  try {
    const buf = Buffer.alloc(PEM_INSPECT_MAX_BYTES);
    const { bytesRead } = await fh.read(buf, 0, PEM_INSPECT_MAX_BYTES, 0);
    const slice = buf.subarray(0, bytesRead);
    return { encrypted: isEncryptedPemKey(slice) };
  } finally {
    await fh.close();
  }
}
