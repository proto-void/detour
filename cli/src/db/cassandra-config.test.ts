import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildCassandraOptions,
  COSMOS_CASSANDRA_PORT,
  KEYSPACES_PORT,
  mergeKeyspacesSslOptions,
  parseCassandraUrl,
} from './adapters/cassandra-config.ts';
import { formatCassandraConnectError } from './adapters/cassandra.ts';
import { chunkResult, reassembleChunks, utf8ByteLength, CHUNK_PAYLOAD_MAX } from './protocol.ts';
import { createRpcHandlers } from './host.ts';
import { _resetSecretsForTests, getSecret, setSecret, deleteSecret } from './secrets.ts';
import type { DbAdapter } from './adapters/types.ts';

describe('buildCassandraOptions', () => {
  it('builds apache contact points with local DC', () => {
    const opts = buildCassandraOptions({
      target: 'apache',
      contactPoints: ['127.0.0.1'],
      localDataCenter: 'dc1',
      username: 'u',
      password: 'p',
    });
    assert.equal(opts.target, 'apache');
    assert.deepEqual(opts.contactPoints, ['127.0.0.1']);
    assert.equal(opts.localDataCenter, 'dc1');
    assert.deepEqual(opts.credentials, { username: 'u', password: 'p' });
  });

  it('builds Astra with secure connect bundle + token', () => {
    const opts = buildCassandraOptions({
      target: 'astra',
      secureConnectBundle: '/tmp/secure-connect.zip',
      astraToken: 'AstraCS:fake',
    });
    assert.deepEqual(opts.cloud, { secureConnectBundle: '/tmp/secure-connect.zip' });
    assert.equal(opts.astraToken, 'AstraCS:fake');
  });

  it('builds Keyspaces TLS + SigV4 region (configuration-tested)', () => {
    const opts = buildCassandraOptions({
      target: 'keyspaces',
      contactPoints: ['cassandra.us-east-1.amazonaws.com'],
      localDataCenter: 'us-east-1',
      region: 'us-east-1',
      keyspacesAuth: 'sigv4',
    });
    assert.deepEqual(opts.keyspacesTls, { useStarfieldCa: true, port: KEYSPACES_PORT });
    assert.deepEqual(opts.keyspacesSigV4, { region: 'us-east-1' });
    assert.equal(opts.protocolOptions?.port, KEYSPACES_PORT);
  });

  it('builds Keyspaces password auth', () => {
    const opts = buildCassandraOptions({
      target: 'keyspaces',
      contactPoints: ['cassandra.us-west-2.amazonaws.com'],
      username: 'keyspaces-user',
      password: 'service-specific',
      keyspacesAuth: 'password',
    });
    assert.deepEqual(opts.credentials, { username: 'keyspaces-user', password: 'service-specific' });
    assert.equal(opts.keyspacesSigV4, undefined);
  });

  it('builds Cosmos on port 10350 with TLS', () => {
    const opts = buildCassandraOptions({
      target: 'cosmos',
      contactPoints: ['myaccount.cassandra.cosmos.azure.com'],
      username: 'myaccount',
      password: 'account-key',
    });
    assert.equal(opts.protocolOptions?.port, COSMOS_CASSANDRA_PORT);
    assert.ok(opts.sslOptions);
    assert.equal(opts.sslOptions?.rejectUnauthorized, true);
  });

  it('treats scylla like apache with target marker', () => {
    const opts = buildCassandraOptions({
      target: 'scylla',
      contactPoints: ['127.0.0.1'],
    });
    assert.equal(opts.target, 'scylla');
    assert.deepEqual(opts.contactPoints, ['127.0.0.1']);
  });

  it('does not invent datacenter1 when localDataCenter is blank', () => {
    const opts = buildCassandraOptions({
      target: 'apache',
      contactPoints: ['10.18.250.13'],
    });
    assert.equal(opts.localDataCenter, undefined);
  });

  it('forwards tls.servername and tls.minVersion into apache sslOptions', () => {
    const opts = buildCassandraOptions({
      target: 'apache',
      contactPoints: ['10.18.250.13'],
      localDataCenter: 'DC1',
      tls: {
        enabled: true,
        ca: '-----BEGIN CERTIFICATE-----\nCA\n-----END CERTIFICATE-----',
        rejectUnauthorized: true,
        servername: 'cassandra.example.internal',
        minVersion: 'TLSv1.2',
      },
    });
    assert.equal(opts.sslOptions?.servername, 'cassandra.example.internal');
    assert.equal(opts.sslOptions?.minVersion, 'TLSv1.2');
    assert.deepEqual(opts.sslOptions?.ca, [
      '-----BEGIN CERTIFICATE-----\nCA\n-----END CERTIFICATE-----',
    ]);
  });

  it('forwards servername/minVersion for cosmos and keyspaces', () => {
    const cosmos = buildCassandraOptions({
      target: 'cosmos',
      contactPoints: ['myaccount.cassandra.cosmos.azure.com'],
      username: 'myaccount',
      password: 'account-key',
      tls: { servername: 'myaccount.cassandra.cosmos.azure.com', minVersion: 'TLSv1.2' },
    });
    assert.equal(cosmos.sslOptions?.servername, 'myaccount.cassandra.cosmos.azure.com');
    assert.equal(cosmos.sslOptions?.minVersion, 'TLSv1.2');

    const ks = buildCassandraOptions({
      target: 'keyspaces',
      contactPoints: ['cassandra.us-east-1.amazonaws.com'],
      region: 'us-east-1',
      keyspacesAuth: 'sigv4',
      tls: { servername: 'cassandra.us-east-1.amazonaws.com', minVersion: 'TLSv1.2', ca: 'CUSTOM-CA' },
    });
    assert.equal(ks.sslOptions?.servername, 'cassandra.us-east-1.amazonaws.com');
    assert.equal(ks.sslOptions?.minVersion, 'TLSv1.2');
    assert.deepEqual(ks.sslOptions?.ca, ['CUSTOM-CA']);
  });

  it('mergeKeyspacesSslOptions preserves SNI/minVersion when applying Starfield CA', () => {
    const built = buildCassandraOptions({
      target: 'keyspaces',
      contactPoints: ['cassandra.us-east-1.amazonaws.com'],
      region: 'us-east-1',
      keyspacesAuth: 'sigv4',
      tls: { servername: 'cassandra.us-east-1.amazonaws.com', minVersion: 'TLSv1.2' },
    });
    const merged = mergeKeyspacesSslOptions(built, 'STARFIELD');
    assert.deepEqual(merged.ca, ['STARFIELD']);
    assert.equal(merged.servername, 'cassandra.us-east-1.amazonaws.com');
    assert.equal(merged.minVersion, 'TLSv1.2');
    assert.equal(merged.rejectUnauthorized, true);
  });
});

describe('formatCassandraConnectError', () => {
  it('appends safe innerErrors host summaries', () => {
    const err = Object.assign(new Error('All host(s) tried for query failed'), {
      innerErrors: {
        '10.0.0.1:9042': new Error('Error: self-signed certificate'),
        '10.0.0.2:9042': new Error('connect ECONNREFUSED'),
      },
    });
    const text = formatCassandraConnectError(err);
    assert.match(text, /All host\(s\) tried/);
    assert.match(text, /10\.0\.0\.1:9042: Error: self-signed certificate/);
    assert.match(text, /10\.0\.0\.2:9042: connect ECONNREFUSED/);
  });

  it('redacts password-like fragments in inner error text', () => {
    const err = Object.assign(new Error('failed'), {
      innerErrors: { 'h:9042': new Error('auth failed password=super-secret token:abc') },
    });
    const text = formatCassandraConnectError(err);
    assert.doesNotMatch(text, /super-secret/);
    assert.match(text, /password=\[redacted\]/);
  });
});

describe('parseCassandraUrl', () => {
  it('parses cassandra and cosmos URLs', () => {
    const a = parseCassandraUrl('cassandra://user:pass@127.0.0.1:9042/ks?localDc=dc1');
    assert.equal(a.target, 'apache');
    assert.deepEqual(a.contactPoints, ['127.0.0.1']);
    assert.equal(a.port, 9042);
    assert.equal(a.keyspace, 'ks');
    assert.equal(a.localDataCenter, 'dc1');
    assert.equal(a.username, 'user');
    assert.equal(a.password, 'pass');

    const c = parseCassandraUrl('cosmos://acct:key@acct.cassandra.cosmos.azure.com:10350/');
    assert.equal(c.target, 'cosmos');
    assert.equal(c.port, 10350);
  });
});

describe('chunkResult', () => {
  it('passes small results through and reassembles large ones', () => {
    const small = chunkResult(1, { ok: true });
    assert.equal(small.length, 1);

    const big = 'x'.repeat(CHUNK_PAYLOAD_MAX + 50_000);
    const parts = chunkResult(2, { data: big });
    assert.ok(parts.length > 1);
    for (const p of parts) {
      assert.equal((p as { chunked: boolean }).chunked, true);
      assert.ok(utf8ByteLength(JSON.stringify(p)) < 1024 * 1024);
    }
    const rebuilt = reassembleChunks(parts as never);
    assert.equal((rebuilt as { data: string }).data.length, big.length);
  });
});

describe('secrets memory fallback', () => {
  it('round-trips when keyring is unavailable', async () => {
    _resetSecretsForTests();
    await setSecret('conn-1', 's3cret');
    assert.equal(await getSecret('conn-1'), 's3cret');
    await deleteSecret('conn-1');
    assert.equal(await getSecret('conn-1'), null);
  });
});

describe('createRpcHandlers', () => {
  it('returns version and closes sessions', async () => {
    let closed = false;
    const fake: DbAdapter = {
      async connect() {},
      async listObjects() {
        return [{ id: 'ks:system', label: 'system', kind: 'keyspace' }];
      },
      async describe() {
        return { ddl: 'CREATE KEYSPACE system;' };
      },
      async execute() {
        return { columns: ['a'], rows: [[1]], rowCount: 1, timingMs: 1 };
      },
      async close() {
        closed = true;
      },
    };
    const rpc = createRpcHandlers({ createAdapter: () => fake });
    const v = (await rpc.handle({ id: 1, method: 'version' })) as { version: string };
    assert.ok(v.version);
    await rpc.handle({
      id: 2,
      method: 'connect',
      params: { connectionId: 'c1', engine: 'cassandra', config: { contactPoints: ['127.0.0.1'] } },
    });
    const objects = await rpc.handle({ id: 3, method: 'listObjects', params: { connectionId: 'c1' } });
    assert.equal((objects as unknown[]).length, 1);
    await rpc.shutdown();
    assert.equal(closed, true);
  });

  it('hydrates tls.keyPassphrase from :sslKeyPass into adapter TLS options', async () => {
    _resetSecretsForTests();
    let seen: Record<string, unknown> | undefined;
    const fake: DbAdapter = {
      async connect(config) {
        seen = config as Record<string, unknown>;
      },
      async listObjects() {
        return [];
      },
      async describe() {
        return {};
      },
      async execute() {
        return { columns: [], rows: [], rowCount: 0, timingMs: 0 };
      },
      async close() {},
    };
    const rpc = createRpcHandlers({ createAdapter: () => fake });
    await rpc.handle({
      id: 1,
      method: 'setSecret',
      params: { account: 'db-t1:sslKeyPass', value: 'key-phrase' },
    });
    await rpc.handle({
      id: 2,
      method: 'connect',
      params: {
        connectionId: 't1',
        engine: 'cassandra',
        secretAccount: 'db-t1',
        config: {
          contactPoints: ['127.0.0.1'],
          tls: {
            mode: 'verify-full',
            enabled: true,
            cert: '-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----',
            key: '-----BEGIN ENCRYPTED PRIVATE KEY-----\nfake\n-----END ENCRYPTED PRIVATE KEY-----',
          },
        },
      },
    });
    const tls = seen?.tls as {
      keyPassphrase?: string;
      key?: string;
      cert?: string;
      enabled?: boolean;
    } | undefined;
    assert.equal(tls?.keyPassphrase, 'key-phrase');
    // Same object the Cassandra adapter reads — passphrase must reach Node TLS sslOptions.
    const built = buildCassandraOptions({
      contactPoints: ['127.0.0.1'],
      tls: {
        enabled: true,
        cert: tls?.cert,
        key: tls?.key,
        keyPassphrase: tls?.keyPassphrase,
        rejectUnauthorized: true,
      },
    });
    assert.equal(built.sslOptions?.passphrase, 'key-phrase');
    assert.ok(built.sslOptions?.key);
    assert.ok(built.sslOptions?.cert);
    await rpc.shutdown();
    await deleteSecret('db-t1:sslKeyPass');
  });
});
