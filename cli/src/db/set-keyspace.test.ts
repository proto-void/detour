import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRpcHandlers } from './host.ts';
import type { DbAdapter, ExecuteResult, ObjectNode, ObjectPath } from './adapters/types.ts';

function mockAdapter(calls: string[]): DbAdapter {
  return {
    async connect() {},
    async listObjects(_path?: ObjectPath): Promise<ObjectNode[]> {
      return [];
    },
    async describe() {
      return {};
    },
    async execute(statement: string): Promise<ExecuteResult> {
      calls.push(statement);
      return { columns: [], rows: [], rowCount: 0, timingMs: 0 };
    },
    async setKeyspace(keyspace: string | null) {
      if (keyspace == null || keyspace.trim() === '') return;
      const name = keyspace.trim();
      const quoted = /^[a-z][a-z0-9_]*$/.test(name) ? name : `"${name.replace(/"/g, '""')}"`;
      calls.push(`USE ${quoted}`);
    },
    async close() {},
  };
}

describe('setKeyspace RPC', () => {
  it('hello advertises setKeyspace', async () => {
    const rpc = createRpcHandlers();
    try {
      const hello = (await rpc.handle({ id: 1, method: 'hello' })) as {
        capabilities: string[];
      };
      assert.ok(hello.capabilities.includes('setKeyspace'));
    } finally {
      await rpc.shutdown();
    }
  });

  it('runs USE for non-null keyspace via adapter', async () => {
    const calls: string[] = [];
    const rpc = createRpcHandlers({ createAdapter: () => mockAdapter(calls) });
    try {
      await rpc.handle({
        id: 1,
        method: 'connect',
        params: { connectionId: 'c1', engine: 'cassandra', config: {} },
      });
      const res = (await rpc.handle({
        id: 2,
        method: 'setKeyspace',
        params: { connectionId: 'c1', keyspace: 'qa05_ute' },
      })) as { ok: boolean; supported: boolean; keyspace: string | null };
      assert.equal(res.ok, true);
      assert.equal(res.supported, true);
      assert.equal(res.keyspace, 'qa05_ute');
      assert.ok(calls.includes('USE qa05_ute'));
    } finally {
      await rpc.shutdown();
    }
  });

  it('clears with null without USE', async () => {
    const calls: string[] = [];
    const rpc = createRpcHandlers({ createAdapter: () => mockAdapter(calls) });
    try {
      await rpc.handle({
        id: 1,
        method: 'connect',
        params: { connectionId: 'c1', engine: 'cassandra', config: {} },
      });
      await rpc.handle({
        id: 2,
        method: 'setKeyspace',
        params: { connectionId: 'c1', keyspace: 'ks' },
      });
      calls.length = 0;
      const res = (await rpc.handle({
        id: 3,
        method: 'setKeyspace',
        params: { connectionId: 'c1', keyspace: null },
      })) as { ok: boolean; keyspace: string | null };
      assert.equal(res.ok, true);
      assert.equal(res.keyspace, null);
      assert.equal(calls.length, 0);
    } finally {
      await rpc.shutdown();
    }
  });
});
