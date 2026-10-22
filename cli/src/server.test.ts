import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { prepareRoot } from './paths.ts';
import { hostAllowed, startBridge } from './server.ts';

const TOKEN = 'ab'.repeat(32);
const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (closers.length > 0) await closers.pop()?.();
});

function fixture(): { root: string; rootLabel: string; dir: string; outside: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'detour-bridge-'));
  const outside = mkdtempSync(path.join(tmpdir(), 'detour-secret-'));
  writeFileSync(path.join(dir, 'app.js'), 'window.APP = "disk";\n');
  writeFileSync(path.join(outside, 'secret.txt'), 'secret-bytes');
  symlinkSync(path.join(outside, 'secret.txt'), path.join(dir, 'leak.txt'));
  mkdirSync(path.join(dir, 'sub'));
  const prepared = prepareRoot(dir);
  return { ...prepared, dir, outside };
}

async function listen(dir: string) {
  const bridge = await startBridge(prepareRoot(dir), TOKEN, 0);
  closers.push(bridge.close);
  const address = bridge.server.address();
  assert.equal(typeof address === 'object' && address !== null && address.address, '127.0.0.1');
  return bridge;
}

async function hit(port: number, urlPath: string, headers: Record<string, string> = {}): Promise<{ status: number; text: string; headers: Headers }> {
  const res = await fetch(`http://127.0.0.1:${port}${urlPath}`, { headers, redirect: 'error' });
  return { status: res.status, text: await res.text(), headers: res.headers };
}

describe('startBridge', () => {
  it('binds 127.0.0.1 and serves a file only with the token', async () => {
    const { dir } = fixture();
    const bridge = await listen(dir);
    const ok = await hit(bridge.port, `/d/${TOKEN}/${Buffer.from('app.js').toString('base64url')}`);
    assert.equal(ok.status, 200);
    assert.equal(ok.text, 'window.APP = "disk";\n');
    assert.equal(ok.headers.get('cache-control'), 'no-store');
    assert.equal(ok.headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.equal(ok.headers.get('x-content-type-options'), 'nosniff');

    const missing = await hit(bridge.port, '/d/' + 'cd'.repeat(32) + '/' + Buffer.from('app.js').toString('base64url'));
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get('access-control-allow-private-network'), null);
  });

  it('does not read a parent path, a symlink out of the folder, or a directory', async () => {
    const { dir } = fixture();
    const bridge = await listen(dir);
    const escaped = Buffer.from('../secret.txt', 'utf8').toString('base64url');
    const viaSymlink = Buffer.from('leak.txt', 'utf8').toString('base64url');
    const directory = Buffer.from('sub', 'utf8').toString('base64url');
    for (const segment of [escaped, viaSymlink, directory]) {
      const res = await hit(bridge.port, `/d/${TOKEN}/${segment}`);
      assert.equal(res.status, 404, segment);
      assert.equal(res.text.includes('secret'), false);
    }
  });

  it('answers health only with the bearer token and hides the full path', async () => {
    const { dir, rootLabel } = fixture();
    const bridge = await listen(dir);
    const no = await hit(bridge.port, '/health');
    assert.equal(no.status, 404);
    const yes = await hit(bridge.port, '/health', { authorization: `Bearer ${TOKEN}` });
    assert.equal(yes.status, 200);
    const body = JSON.parse(yes.text) as { ok: boolean; rootLabel: string };
    assert.equal(body.ok, true);
    assert.equal(body.rootLabel, rootLabel);
    assert.equal(yes.text.includes(dir), false);
  });

  it('rejects a foreign Host and does not opt private-network access in', async () => {
    const { dir } = fixture();
    const bridge = await listen(dir);
    const file = `/d/${TOKEN}/${Buffer.from('app.js').toString('base64url')}`;
    const res = await new Promise<{ status: number; allow: string | undefined }>((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: bridge.port, path: file, headers: { host: 'evil.example' } }, (msg) => {
        msg.resume();
        msg.on('end', () => resolve({ status: msg.statusCode ?? 0, allow: msg.headers['access-control-allow-private-network'] as string | undefined }));
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(res.status, 404);
    assert.equal(res.allow, undefined);
  });

  it('sends private-network opt-in on an authenticated preflight only', async () => {
    const { dir } = fixture();
    const bridge = await listen(dir);
    const file = `/d/${TOKEN}/${Buffer.from('app.js').toString('base64url')}`;
    const ok = await fetch(`http://127.0.0.1:${bridge.port}${file}`, { method: 'OPTIONS' });
    assert.equal(ok.status, 204);
    assert.equal(ok.headers.get('access-control-allow-private-network'), 'true');
    assert.equal(ok.headers.get('access-control-allow-origin'), '*');
    const bad = await fetch(`http://127.0.0.1:${bridge.port}/d/${'ff'.repeat(32)}/aaaa`, { method: 'OPTIONS' });
    assert.equal(bad.status, 404);
    assert.equal(bad.headers.get('access-control-allow-private-network'), null);
  });
});

describe('hostAllowed', () => {
  it('allows only the numeric loopback host', () => {
    assert.equal(hostAllowed('127.0.0.1:47321', 47321), true);
    assert.equal(hostAllowed('localhost:47321', 47321), false);
    assert.equal(hostAllowed('evil.example', 47321), false);
    assert.equal(hostAllowed(undefined, 47321), false);
  });
});

describe('token shape', () => {
  it('refuses to start with a short token', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'detour-token-'));
    await assert.rejects(startBridge(prepareRoot(dir), 'abcd', 0), /64 hex/);
    assert.equal(randomBytes(32).toString('hex').length, 64);
  });
});
