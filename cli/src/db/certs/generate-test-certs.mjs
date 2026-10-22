#!/usr/bin/env node
/**
 * Generate local CA + server + client certs for compose TLS e2e (no secrets committed).
 * Output: cli/src/db/certs/test/
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, chmodSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), 'test');
mkdirSync(root, { recursive: true });

function openssl(...args) {
  execFileSync('openssl', args, { stdio: 'inherit' });
}

const caKey = join(root, 'ca.key');
const caCrt = join(root, 'ca.crt');
const serverKey = join(root, 'server.key');
const serverCrt = join(root, 'server.crt');
const clientKey = join(root, 'client.key');
const clientCrt = join(root, 'client.crt');
const marker = join(root, '.generated');

if (existsSync(marker) && existsSync(caCrt) && existsSync(serverCrt)) {
  console.log('Test certs already present:', root);
  process.exit(0);
}

openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', caKey, '-out', caCrt, '-days', '3650', '-subj', '/CN=DetourTestCA');
openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', serverKey, '-out', join(root, 'server.csr'), '-subj', '/CN=localhost');
writeFileSync(
  join(root, 'server.ext'),
  'subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n',
);
openssl(
  'x509',
  '-req',
  '-in',
  join(root, 'server.csr'),
  '-CA',
  caCrt,
  '-CAkey',
  caKey,
  '-CAcreateserial',
  '-out',
  serverCrt,
  '-days',
  '3650',
  '-extfile',
  join(root, 'server.ext'),
);
openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', clientKey, '-out', join(root, 'client.csr'), '-subj', '/CN=detour-client');
openssl(
  'x509',
  '-req',
  '-in',
  join(root, 'client.csr'),
  '-CA',
  caCrt,
  '-CAkey',
  caKey,
  '-CAcreateserial',
  '-out',
  clientCrt,
  '-days',
  '3650',
);
chmodSync(serverKey, 0o600);
writeFileSync(marker, new Date().toISOString());
console.log('Generated test certs in', root);
