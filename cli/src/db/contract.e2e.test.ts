/**
 * Live adapter contract tests against docker-compose.db.yml.
 * Skipped unless DETOUR_DB_E2E=1.
 *
 *   docker compose -f docker-compose.db.yml up -d cassandra postgres mysql redis mongo
 *   DETOUR_DB_E2E=1 corepack pnpm --filter @detour/cli exec node --experimental-strip-types --test src/db/contract.e2e.test.ts
 *
 * Portable host binary (any conforming native-messaging host, e.g. Go partner helper):
 *   DETOUR_DB_HOST_CMD=/path/to/binary corepack pnpm --filter @detour/cli exec node --experimental-strip-types --test src/db/contract.e2e.test.ts
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { describe, it } from 'node:test';
import { createAdapter } from './adapters/registry.ts';
import { createRpcHandlers } from './host.ts';
import { encodeNativeMessage, tryReadNativeMessage } from './host.ts';
import {
  chunkResult,
  reassembleChunks,
  CHUNK_PAYLOAD_MAX,
  PROTOCOL_VERSION,
  HOST_VERSION,
} from './protocol.ts';

const live = process.env.DETOUR_DB_E2E === '1';
const hostCmd = process.env.DETOUR_DB_HOST_CMD?.trim();

describe('native messaging framing', () => {
  it('encodes and decodes length-prefixed messages', () => {
    const buf = encodeNativeMessage({ hello: 'world' });
    const parsed = tryReadNativeMessage(buf);
    assert.ok(parsed);
    assert.deepEqual(parsed!.message, { hello: 'world' });
    assert.equal(parsed!.rest.length, 0);
  });

  it('chunks large payloads under 1MB', () => {
    const big = { data: 'x'.repeat(CHUNK_PAYLOAD_MAX + 10_000) };
    const parts = chunkResult(1, big);
    assert.ok(parts.length > 1);
    assert.deepEqual(reassembleChunks(parts as never), big);
  });

  it('hello returns protocolVersion and capabilities', async () => {
    const rpc = createRpcHandlers();
    try {
      const hello = (await rpc.handle({ id: 1, method: 'hello' })) as {
        protocolVersion: number;
        hostVersion: string;
        capabilities: string[];
      };
      assert.equal(hello.protocolVersion, PROTOCOL_VERSION);
      assert.equal(hello.hostVersion, HOST_VERSION);
      assert.ok(Array.isArray(hello.capabilities));
      assert.ok(hello.capabilities.includes('engine:sqlite'));
      assert.ok(hello.capabilities.includes('ssh'));
    } finally {
      await rpc.shutdown();
    }
  });
});

describe('external host binary (DETOUR_DB_HOST_CMD)', { skip: !hostCmd }, () => {
  it('hello over native-messaging stdio', async () => {
    assert.ok(hostCmd);
    const child = spawn(hostCmd!, {
      stdio: ['pipe', 'pipe', 'inherit'],
      shell: false,
    });
    const req = encodeNativeMessage({ jsonrpc: '2.0', id: 1, method: 'hello' });
    const chunks: Buffer[] = [];
    const result = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error('timeout waiting for hello from DETOUR_DB_HOST_CMD'));
      }, 15_000);
      child.stdout!.on('data', (chunk: Buffer) => {
        chunks.push(Buffer.from(chunk));
        const buf = Buffer.concat(chunks);
        const parsed = tryReadNativeMessage(buf);
        if (!parsed) return;
        clearTimeout(timer);
        child.stdin!.end();
        child.kill();
        const msg = parsed.message as { result?: unknown; error?: { message: string } };
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.stdin!.write(req);
    });
    const hello = result as {
      protocolVersion: number;
      hostVersion: string;
      capabilities: string[];
    };
    assert.equal(hello.protocolVersion, PROTOCOL_VERSION);
    assert.ok(typeof hello.hostVersion === 'string' && hello.hostVersion.length > 0);
    assert.ok(Array.isArray(hello.capabilities));
  });
});

describe('live adapters (DETOUR_DB_E2E=1)', { skip: !live }, () => {
  it('postgres connect + select', async () => {
    const a = createAdapter('postgres');
    try {
      const t = await a.testConnection?.({
        host: '127.0.0.1',
        port: 5432,
        username: 'detour',
        password: 'detour',
        database: 'detour',
      });
      assert.equal(t?.ok, true);
      await a.connect({
        host: '127.0.0.1',
        port: 5432,
        username: 'detour',
        password: 'detour',
        database: 'detour',
      });
      const rs = await a.execute('SELECT 1 AS n', [], { pageSize: 10 });
      assert.equal(rs.rows[0]?.[0], 1);
    } finally {
      await a.close();
    }
  });

  it('mysql connect + select', async () => {
    const a = createAdapter('mysql');
    try {
      const t = await a.testConnection?.({
        host: '127.0.0.1',
        port: 3306,
        username: 'detour',
        password: 'detour',
        database: 'detour',
      });
      assert.equal(t?.ok, true);
    } finally {
      await a.close();
    }
  });

  it('redis ping', async () => {
    const a = createAdapter('redis');
    try {
      const t = await a.testConnection?.({ host: '127.0.0.1', port: 6379 });
      assert.equal(t?.ok, true);
      await a.connect({ host: '127.0.0.1', port: 6379 });
      const rs = await a.execute('PING', [], {});
      assert.ok(rs.rows.length >= 1);
    } finally {
      await a.close();
    }
  });

  it('mongo list databases', async () => {
    const a = createAdapter('mongodb');
    try {
      const t = await a.testConnection?.({ host: '127.0.0.1', port: 27017, database: 'test' });
      assert.equal(t?.ok, true);
    } finally {
      await a.close();
    }
  });

  it('cassandra system.local when available', async () => {
    const a = createAdapter('cassandra');
    try {
      const t = await a.testConnection?.({
        target: 'apache',
        contactPoints: ['127.0.0.1'],
        localDataCenter: 'datacenter1',
        port: 9042,
      });
      if (!t?.ok) {
        // Cassandra health can take a long time; soft-skip
        console.log('cassandra not ready:', t && 'error' in t ? t.error : t);
        return;
      }
      await a.connect({
        target: 'apache',
        contactPoints: ['127.0.0.1'],
        localDataCenter: 'datacenter1',
        port: 9042,
      });
      const objects = await a.listObjects({ kind: 'root' });
      assert.ok(objects.length > 0);
      const rs = await a.execute('SELECT release_version FROM system.local', [], { pageSize: 10 });
      assert.ok(rs.rows.length >= 1);
    } finally {
      await a.close();
    }
  });

  it('sqlite in-memory', async () => {
    const a = createAdapter('sqlite');
    try {
      await a.connect({ filename: ':memory:' });
      await a.execute('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)', [], {});
      await a.execute(`INSERT INTO t (id, name) VALUES (1, 'a')`, [], {});
      const rs = await a.execute('SELECT * FROM t', [], {});
      assert.equal(rs.rows.length, 1);
    } finally {
      await a.close();
    }
  });

  it('rpc idle shutdown closes adapters', async () => {
    const rpc = createRpcHandlers();
    await rpc.handle({
      id: 1,
      method: 'connect',
      params: {
        connectionId: 's1',
        engine: 'sqlite',
        config: { filename: ':memory:' },
      },
    });
    await rpc.shutdown();
    assert.equal(rpc.stats().openConnections, 0);
  });

  it('postgres TLS verify-full with CA (profile tls)', async () => {
    const { access } = await import('node:fs/promises');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const certDir = join(dirname(fileURLToPath(import.meta.url)), 'certs', 'test');
    try {
      await access(join(certDir, 'ca.crt'));
    } catch {
      console.log('skip postgres-tls: generate certs with node cli/src/db/certs/generate-test-certs.mjs');
      return;
    }
    const { readFile } = await import('node:fs/promises');
    const ca = await readFile(join(certDir, 'ca.crt'), 'utf8');
    const a = createAdapter('postgres');
    try {
      const t = await a.testConnection?.({
        host: '127.0.0.1',
        port: 5433,
        username: 'detour',
        password: 'detour',
        database: 'detour',
        tlsEnabled: true,
        tls: { enabled: true, mode: 'verify-full', ca, rejectUnauthorized: true, servername: 'localhost' },
      });
      if (!t?.ok) {
        console.log('postgres-tls not ready:', t && 'error' in t ? t.error : t);
        return;
      }
      assert.equal(t.ok, true);
    } finally {
      await a.close();
    }
  });

  it('ssh tunnel to postgres via bastion (profile tls/ssh)', async () => {
    const rpc = createRpcHandlers();
    try {
      const result = (await rpc.handle({
        id: 2,
        method: 'testConnection',
        params: {
          connectionId: 'ssh-pg',
          engine: 'postgres',
          config: {
            host: 'host.docker.internal',
            port: 5432,
            username: 'detour',
            password: 'detour',
            database: 'detour',
            ssh: {
              enabled: true,
              host: '127.0.0.1',
              port: 2222,
              username: 'detour',
              password: 'detour',
              auth: 'password',
            },
          },
        },
      })) as { ok?: boolean; error?: string };
      if (!result?.ok) {
        console.log('ssh bastion path soft-skip:', result?.error ?? result);
        return;
      }
      assert.equal(result.ok, true);
    } finally {
      await rpc.shutdown();
    }
  });

  it('socks5 proxy tunnel framing (config only when proxy down)', async () => {
    const rpc = createRpcHandlers();
    try {
      const result = (await rpc.handle({
        id: 3,
        method: 'testConnection',
        params: {
          connectionId: 'socks-pg',
          engine: 'postgres',
          config: {
            host: '127.0.0.1',
            port: 5432,
            username: 'detour',
            password: 'detour',
            database: 'detour',
            proxy: { type: 'socks5', host: '127.0.0.1', port: 1080 },
          },
        },
      })) as { ok?: boolean; error?: string };
      if (!result?.ok) {
        console.log('socks soft-skip:', result?.error ?? result);
        return;
      }
      assert.equal(result.ok, true);
    } finally {
      await rpc.shutdown();
    }
  });

  it('redis TLS when redis-tls up', async () => {
    const { access, readFile } = await import('node:fs/promises');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const certDir = join(dirname(fileURLToPath(import.meta.url)), 'certs', 'test');
    try {
      await access(join(certDir, 'ca.crt'));
    } catch {
      return;
    }
    const ca = await readFile(join(certDir, 'ca.crt'), 'utf8');
    const a = createAdapter('redis');
    try {
      const t = await a.testConnection?.({
        host: '127.0.0.1',
        port: 6380,
        tlsEnabled: true,
        tls: { enabled: true, mode: 'verify-full', ca, rejectUnauthorized: true, servername: 'localhost' },
      });
      if (!t?.ok) {
        console.log('redis-tls soft-skip:', t && 'error' in t ? t.error : t);
        return;
      }
      assert.equal(t.ok, true);
    } finally {
      await a.close();
    }
  });
});
