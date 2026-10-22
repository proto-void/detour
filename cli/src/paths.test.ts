import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { decodeBridgePath, isSafeRelative, prepareRoot, resolveInside } from './paths.ts';

describe('isSafeRelative', () => {
  it('accepts a nested file', () => {
    assert.equal(isSafeRelative('assets/app.js'), true);
  });

  it('rejects absolute paths, blank segments, and parent segments', () => {
    for (const bad of ['', '/etc/passwd', '../secret', 'foo/../../secret', 'foo//bar', './app.js', 'a\\b', 'C:/windows', `a\0b`]) {
      assert.equal(isSafeRelative(bad), false, bad);
    }
  });
});

describe('decodeBridgePath', () => {
  it('decodes the extension vector for assets/app.js', () => {
    assert.equal(decodeBridgePath('YXNzZXRzL2FwcC5qcw'), 'assets/app.js');
  });

  it('rejects a payload that encodes a parent segment', () => {
    const escaped = Buffer.from('../secret', 'utf8').toString('base64url');
    assert.equal(decodeBridgePath(escaped), undefined);
  });

  it('rejects junk', () => {
    assert.equal(decodeBridgePath('@@@'), undefined);
    assert.equal(decodeBridgePath(''), undefined);
  });
});

describe('prepareRoot and resolveInside', () => {
  it('refuses the filesystem root and a file', () => {
    assert.throws(() => prepareRoot('/'), /filesystem root/);
    const dir = mkdtempSync(path.join(tmpdir(), 'detour-root-'));
    const file = path.join(dir, 'one.js');
    writeFileSync(file, 'x');
    assert.throws(() => prepareRoot(file), /Not a folder/);
  });

  it('serves a file inside the folder and not a symlink that leaves it', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'detour-jail-'));
    const outside = mkdtempSync(path.join(tmpdir(), 'detour-out-'));
    writeFileSync(path.join(dir, 'ok.js'), 'ok');
    writeFileSync(path.join(outside, 'secret.js'), 'secret');
    symlinkSync(path.join(outside, 'secret.js'), path.join(dir, 'link.js'));
    mkdirSync(path.join(dir, 'sub'));
    const { root } = prepareRoot(dir);
    assert.equal(resolveInside(root, 'ok.js')?.endsWith(`${path.sep}ok.js`), true);
    assert.equal(resolveInside(root, 'link.js'), undefined);
    assert.equal(resolveInside(root, 'sub'), undefined);
    assert.equal(resolveInside(root, '../secret.js'), undefined);
  });
});
