import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { expandHome, readPathText, resolvePath, resolveTlsFiles } from './paths.ts';

describe('paths', () => {
  it('expands ~', () => {
    const home = expandHome('~');
    assert.ok(home.length > 1);
    assert.equal(resolvePath('~/foo/bar').startsWith(home), true);
  });

  it('reads a file and errors clearly when missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'detour-path-'));
    try {
      const file = join(dir, 'ca.pem');
      await writeFile(file, 'CA-DATA', 'utf8');
      assert.equal(await readPathText(file, 'CA'), 'CA-DATA');
      await assert.rejects(() => readPathText(join(dir, 'nope.pem'), 'CA'), /not found or unreadable/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('resolveTlsFiles loads caPath', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'detour-tls-'));
    try {
      const ca = join(dir, 'ca.pem');
      await writeFile(ca, 'CERT', 'utf8');
      const tls = await resolveTlsFiles({ mode: 'verify-full', caPath: ca });
      assert.equal(tls.enabled, true);
      assert.equal(tls.ca, 'CERT');
      assert.equal(tls.rejectUnauthorized, true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('resolveTlsFiles ignores path contents when mode is disable', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'detour-tls-dis-'));
    try {
      const key = join(dir, 'key.pem');
      await writeFile(key, 'KEY', 'utf8');
      const tls = await resolveTlsFiles({ mode: 'disable', keyPath: key, certPath: key });
      assert.equal(tls.enabled, false);
      assert.equal(tls.key, undefined);
      assert.equal(tls.cert, undefined);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('resolveTlsFiles allows key-only when TLS is on (no IncompletePair)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'detour-tls-pair-'));
    try {
      const key = join(dir, 'key.pem');
      await writeFile(key, 'KEY-ONLY', 'utf8');
      const tls = await resolveTlsFiles({ mode: 'verify-full', keyPath: key });
      assert.equal(tls.enabled, true);
      assert.equal(tls.key, 'KEY-ONLY');
      assert.equal(tls.cert, undefined);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('resolveTlsFiles allows cert-only when TLS is on (no IncompletePair)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'detour-tls-cert-'));
    try {
      const cert = join(dir, 'cert.pem');
      await writeFile(cert, 'CERT-ONLY', 'utf8');
      const tls = await resolveTlsFiles({ mode: 'required', certPath: cert });
      assert.equal(tls.enabled, true);
      assert.equal(tls.cert, 'CERT-ONLY');
      assert.equal(tls.key, undefined);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
