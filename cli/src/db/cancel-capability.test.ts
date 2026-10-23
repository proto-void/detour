import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRpcHandlers } from './host.ts';

describe('cancel capability', () => {
  it('hello advertises cancel', async () => {
    const rpc = createRpcHandlers();
    try {
      const hello = (await rpc.handle({ id: 1, method: 'hello' })) as {
        capabilities: string[];
      };
      assert.ok(hello.capabilities.includes('cancel'));
    } finally {
      await rpc.shutdown();
    }
  });
});
