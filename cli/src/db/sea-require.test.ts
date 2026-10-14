import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { requireBesideBinary, seaNodeModulesRoot, tryRequireBeside } from './sea-require.ts';

describe('sea-require', () => {
  it('resolves node_modules beside a fake execPath', () => {
    const dir = mkdtempSync(join(tmpdir(), 'detour-sea-req-'));
    try {
      const fakeBin = join(dir, 'detour-db-host');
      writeFileSync(fakeBin, '');
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'detour-db-host', private: true }));
      const nm = join(dir, 'node_modules', 'fake-addon');
      mkdirSync(nm, { recursive: true });
      writeFileSync(join(nm, 'package.json'), JSON.stringify({ name: 'fake-addon', main: 'index.js' }));
      writeFileSync(join(nm, 'index.js'), 'module.exports = { ok: true };');

      assert.equal(seaNodeModulesRoot(fakeBin), join(dir, 'node_modules'));
      const req = requireBesideBinary(fakeBin);
      assert.equal((req('fake-addon') as { ok: boolean }).ok, true);
      assert.equal((tryRequireBeside<{ ok: boolean }>('fake-addon', fakeBin))?.ok, true);
      assert.equal(tryRequireBeside('missing-pkg-xyz', fakeBin), undefined);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
