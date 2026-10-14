import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadJavaKeyStore, loadJavaTrustStore } from './java-store.ts';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'testdata');
/** Synthetic fixture password only — not a real secret. */
const PASS = 'test-store-pass';

describe('java-store', () => {
  it('loads JKS truststore', async () => {
    const pem = await loadJavaTrustStore(join(dir, 'trust.jks'), PASS);
    assert.match(pem, /BEGIN CERTIFICATE/);
  });

  it('loads JKS keystore', async () => {
    const { cert, key } = await loadJavaKeyStore(join(dir, 'client.jks'), PASS);
    assert.match(cert, /BEGIN CERTIFICATE/);
    assert.match(key, /PRIVATE KEY/);
  });

  it('loads PKCS12 keystore', async () => {
    const { cert, key } = await loadJavaKeyStore(join(dir, 'client.p12'), PASS);
    assert.match(cert, /BEGIN CERTIFICATE/);
    assert.match(key, /PRIVATE KEY/);
  });

  it('loads PKCS12 truststore', async () => {
    const pem = await loadJavaTrustStore(join(dir, 'trust.p12'), PASS);
    assert.match(pem, /BEGIN CERTIFICATE/);
  });

  it('wrong password yields friendly keystore error', async () => {
    await assert.rejects(
      () => loadJavaKeyStore(join(dir, 'client.jks'), 'wrong'),
      /keystore: wrong password|keystore:/,
    );
  });

  it('empty password mentions re-enter hint on failure', async () => {
    await assert.rejects(
      () => loadJavaKeyStore(join(dir, 'client.p12'), ''),
      /no store password provided/,
    );
  });
});
