import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { banner, parseArgs, usage } from './cli.ts';

describe('parseArgs', () => {
  it('reads a folder and the default port', () => {
    assert.deepEqual(parseArgs(['bridge', './dist']), { dir: './dist', port: 47321 });
  });

  it('reads --port', () => {
    assert.deepEqual(parseArgs(['bridge', './dist', '--port', '8080']), { dir: './dist', port: 8080 });
    assert.deepEqual(parseArgs(['bridge', '--port=9000', './dist']), { dir: './dist', port: 9000 });
  });

  it('refuses --host and a missing folder', () => {
    const host = parseArgs(['bridge', './dist', '--host', '0.0.0.0']);
    assert.equal('error' in host && host.error.includes('127.0.0.1'), true);
    const missing = parseArgs(['bridge']);
    assert.equal('error' in missing && missing.error, usage());
  });
});

describe('banner', () => {
  it('prints the loopback URL, the folder name, and the token', () => {
    const text = banner(47321, 'dist', 'ab'.repeat(32));
    assert.match(text, /http:\/\/127\.0\.0\.1:47321/);
    assert.match(text, /folder: dist/);
    assert.match(text, new RegExp('ab'.repeat(32)));
    assert.equal(text.includes('/Users'), false);
  });
});
