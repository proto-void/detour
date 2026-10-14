/**
 * AWS Signature Version 4 for API Tester (extension-page fetch).
 * Pure Web Crypto — no AWS SDK.
 */

export interface SigV4Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
  service: string;
}

export interface SigV4Request {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string | null;
  /** Override signing time (tests). ISO or Date. */
  now?: Date;
}

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function asBufferSource(bytes: Uint8Array): BufferSource {
  return bytes as unknown as BufferSource;
}

async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return toHex(await crypto.subtle.digest('SHA-256', asBufferSource(bytes)));
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const raw = key instanceof Uint8Array ? key : new Uint8Array(key);
  const cryptoKey = await crypto.subtle.importKey('raw', asBufferSource(raw), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}

async function getSigningKey(secret: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
  const kDate = await hmac(new TextEncoder().encode(`AWS4${secret}`), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

function amzDate(d: Date): { amz: string; dateStamp: string } {
  const iso = d.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amz: iso, dateStamp: iso.slice(0, 8) };
}

/** Sign a request; returns headers including Authorization (and x-amz-*). */
export async function signAwsV4(req: SigV4Request, creds: SigV4Credentials): Promise<Record<string, string>> {
  const url = new URL(req.url);
  const now = req.now ?? new Date();
  const { amz, dateStamp } = amzDate(now);
  const method = req.method.toUpperCase();
  const body = req.body ?? '';
  const payloadHash = await sha256Hex(body);

  const headers: Record<string, string> = { ...req.headers };
  headers.host = url.host;
  headers['x-amz-date'] = amz;
  headers['x-amz-content-sha256'] = payloadHash;
  if (creds.sessionToken) headers['x-amz-security-token'] = creds.sessionToken;

  const signedHeaderNames = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort();
  const canonicalHeaders = signedHeaderNames.map((name) => {
    const key = Object.keys(headers).find((k) => k.toLowerCase() === name)!;
    return `${name}:${headers[key]!.trim().replace(/\s+/g, ' ')}\n`;
  }).join('');
  const signedHeaders = signedHeaderNames.join(';');

  const canonicalQuery = [...url.searchParams.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const canonicalRequest = [
    method,
    url.pathname || '/',
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${creds.region}/${creds.service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amz, credentialScope, await sha256Hex(canonicalRequest)].join('\n');
  const signingKey = await getSigningKey(creds.secretAccessKey, dateStamp, creds.region, creds.service);
  const signature = toHex(await hmac(signingKey, stringToSign));

  headers.Authorization = `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return headers;
}

/** Exported for unit tests against AWS sample vectors. */
export async function _testHelpers() {
  return { sha256Hex, amzDate, toHex };
}
