import { timingSafeEqual } from 'node:crypto';
import { createReadStream, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import path from 'node:path';
import { decodeBridgePath, resolveInside, type PreparedRoot } from './paths.ts';

export interface BridgeListen {
  server: Server;
  port: number;
  close: () => Promise<void>;
}

/** Keep in sync with `contentTypeForRelative` in `extension/src/local-bridge/paths.ts`. */
const TEXT: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
};

export function contentTypeFor(filePath: string): string {
  return TEXT[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

function tokenEquals(got: string, expected: string): boolean {
  if (got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

function bearer(req: IncomingMessage, token: string): boolean {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return false;
  const match = /^Bearer ([0-9a-f]{64})$/.exec(header);
  return match !== null && tokenEquals(match[1]!, token);
}

/** Browsers send `127.0.0.1:port`. Anything else (a rebinding hostname) is rejected. */
export function hostAllowed(host: string | undefined, port: number): boolean {
  if (host === undefined) return false;
  return host === `127.0.0.1:${port}` || (port === 80 && host === '127.0.0.1');
}

function write(res: ServerResponse, status: number, body: string | Buffer, headers: Record<string, string>, method: string): void {
  const head = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers };
  res.writeHead(status, head);
  if (method === 'HEAD') res.end();
  else res.end(body);
}

const FILE_CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-private-network': 'true',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
  'access-control-allow-headers': 'authorization',
};

/**
 * Serves `root` on 127.0.0.1. The listen address is not a parameter.
 * `port` 0 picks an ephemeral port (tests).
 */
export function startBridge(prepared: PreparedRoot, token: string, port = 0): Promise<BridgeListen> {
  if (!/^[0-9a-f]{64}$/.test(token)) return Promise.reject(new Error('Token must be 64 hex characters'));

  const server = createServer((req, res) => {
    const method = req.method ?? 'GET';
    const address = server.address();
    const bound = address && typeof address === 'object' ? address.port : port;
    if (!hostAllowed(req.headers.host, bound)) {
      write(res, 404, 'Not found', { 'content-type': 'text/plain; charset=utf-8' }, method);
      return;
    }

    const raw = (req.url ?? '/').split('?')[0] ?? '/';
    if (raw.length > 2048) {
      write(res, 404, 'Not found', { 'content-type': 'text/plain; charset=utf-8' }, method);
      return;
    }

    if (raw === '/health') {
      if (!bearer(req, token)) {
        write(res, 404, 'Not found', { 'content-type': 'text/plain; charset=utf-8' }, method);
        return;
      }
      const body = JSON.stringify({ ok: true, rootLabel: prepared.rootLabel });
      write(res, 200, body, { 'content-type': 'application/json; charset=utf-8' }, method);
      return;
    }

    const parts = raw.split('/');
    // "/d/<token>/<payload>" → ['', 'd', token, payload]
    const payload = parts.length === 4 && parts[1] === 'd' ? decodeBridgePath(parts[3] ?? '') : undefined;
    const tokenOk = parts.length === 4 && parts[1] === 'd' && tokenEquals(parts[2] ?? '', token);
    if (!tokenOk || payload === undefined) {
      write(res, 404, 'Not found', { 'content-type': 'text/plain; charset=utf-8' }, method);
      return;
    }

    if (method === 'OPTIONS') {
      write(res, 204, '', FILE_CORS, method);
      return;
    }
    if (method !== 'GET' && method !== 'HEAD') {
      write(res, 405, 'Method not allowed', { ...FILE_CORS, 'content-type': 'text/plain; charset=utf-8' }, method);
      return;
    }

    const file = resolveInside(prepared.root, payload);
    if (file === undefined) {
      write(res, 404, 'Not found', { ...FILE_CORS, 'content-type': 'text/plain; charset=utf-8' }, method);
      return;
    }

    let size = 0;
    try {
      size = statSync(file).size;
    } catch {
      write(res, 404, 'Not found', { ...FILE_CORS, 'content-type': 'text/plain; charset=utf-8' }, method);
      return;
    }
    const headers = {
      ...FILE_CORS,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'content-type': contentTypeFor(file),
      'content-length': String(size),
    };
    res.writeHead(method === 'HEAD' ? 200 : 200, headers);
    if (method === 'HEAD') {
      res.end();
      return;
    }
    const stream = createReadStream(file);
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(404);
      res.end();
    });
    stream.pipe(res);
  });

  server.requestTimeout = 5_000;
  server.headersTimeout = 5_000;

  return new Promise((resolve, reject) => {
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') reject(new Error(`Port ${port} is already in use. Pass --port to choose another.`));
      else reject(err);
    });
    // Literal loopback. Do not take this from user input.
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Bridge did not bind a TCP port'));
        return;
      }
      resolve({
        server,
        port: address.port,
        close: () =>
          new Promise((done, fail) => {
            server.close((err) => (err ? fail(err) : done()));
          }),
      });
    });
  });
}
