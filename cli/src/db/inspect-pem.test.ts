import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { inspectPemKey, isEncryptedPemKey } from './inspect-pem.ts';

const PLAIN_EC_KEY = `-----BEGIN EC PRIVATE KEY-----
MHQCAQEEIExampleUnencryptedKeyMaterialForUnitTestOnly0000000000000
oAcGBSuBBAAKoUQDQgAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==
-----END EC PRIVATE KEY-----
`;

const ENCRYPTED_LEGACY = `-----BEGIN EC PRIVATE KEY-----
Proc-Type: 4,ENCRYPTED
DEK-Info: AES-256-CBC,0123456789ABCDEF0123456789ABCDEF

AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB
-----END EC PRIVATE KEY-----
`;

const ENCRYPTED_PKCS8 = `-----BEGIN ENCRYPTED PRIVATE KEY-----
MIIFLTBXBgkqhkiG9w0BBQ0wSjApBgkqhkiG9w0BBQwwHAQIAAAAAAAAAAAAAg
MAwGCCqGSIb3DQIJBQAwHQYJYIZIAWUDBAEqBBAAAAAAAAAAAAAAAAAAAAAA
-----END ENCRYPTED PRIVATE KEY-----
`;

describe('isEncryptedPemKey', () => {
  it('returns false for plaintext PEM key', () => {
    assert.equal(isEncryptedPemKey(PLAIN_EC_KEY), false);
  });

  it('returns true for legacy Proc-Type encrypted PEM', () => {
    assert.equal(isEncryptedPemKey(ENCRYPTED_LEGACY), true);
  });

  it('returns true for ENCRYPTED PRIVATE KEY', () => {
    assert.equal(isEncryptedPemKey(ENCRYPTED_PKCS8), true);
  });

  it('returns false for garbage / non-PEM', () => {
    assert.equal(isEncryptedPemKey('not a pem at all'), false);
    assert.equal(isEncryptedPemKey('-----BEGIN CERTIFICATE-----\nYWJj\n-----END CERTIFICATE-----'), false);
  });
});

describe('inspectPemKey', () => {
  it('reads file and reports encryption', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'detour-pem-'));
    try {
      const plain = join(dir, 'plain.pem');
      const enc = join(dir, 'enc.pem');
      writeFileSync(plain, PLAIN_EC_KEY);
      writeFileSync(enc, ENCRYPTED_LEGACY);
      assert.deepEqual(await inspectPemKey(plain), { encrypted: false });
      assert.deepEqual(await inspectPemKey(enc), { encrypted: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws clear error when missing', async () => {
    await assert.rejects(
      () => inspectPemKey('/tmp/detour-missing-key-does-not-exist.pem'),
      /not found or unreadable/,
    );
  });
});
