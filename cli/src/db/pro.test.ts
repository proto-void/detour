import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildErDiagram, dataCompare, schemaCompare, syncCollectionsToFolder, tableDesignerDdl } from './pro.ts';
import { parseCsv, toCsv } from './adapters/sql-common.ts';
import { normalizeEngine } from './adapters/registry.ts';

describe('pro tools', () => {
  it('builds ER edges from FKs', () => {
    const er = buildErDiagram([
      {
        id: 't1',
        label: 'users',
        describe: { columns: [{ name: 'id', type: 'int' }], foreignKeys: [] },
      },
      {
        id: 't2',
        label: 'orders',
        describe: {
          columns: [{ name: 'user_id', type: 'int' }],
          foreignKeys: [{ from: 'user_id', toTable: 'users', toColumn: 'id' }],
        },
      },
    ]);
    assert.equal(er.nodes.length, 2);
    assert.equal(er.edges.length, 1);
    assert.equal(er.edges[0]!.from, 't2');
  });

  it('designs create DDL and compares schemas/data', () => {
    const ddl = tableDesignerDdl({
      action: 'create',
      schema: 'public',
      table: 't',
      columns: [
        { name: 'id', type: 'int', primaryKey: true, nullable: false },
        { name: 'name', type: 'text' },
      ],
    });
    assert.match(ddl, /CREATE TABLE/);
    const cmp = schemaCompare(
      [{ name: 't', columns: [{ name: 'id', type: 'int' }] }],
      [{ name: 't', columns: [{ name: 'id', type: 'bigint' }] }],
    );
    assert.equal(cmp.changed.length, 1);
    const d = dataCompare(
      [
        [1, 'a'],
        [2, 'b'],
      ],
      [
        [1, 'a'],
        [3, 'c'],
      ],
    );
    assert.equal(d.onlyLeft, 1);
    assert.equal(d.onlyRight, 1);
  });

  it('syncs collections to a folder', () => {
    const dir = mkdtempSync(join(tmpdir(), 'detour-db-'));
    try {
      syncCollectionsToFolder(dir, 'push', [
        { v: 1, id: 'c1', name: 'Demo', folders: [] },
      ]);
      const pulled = syncCollectionsToFolder(dir, 'pull');
      assert.equal(pulled.length, 1);
      assert.equal(pulled[0]!.id, 'c1');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('sql export helpers', () => {
  it('round-trips CSV', () => {
    const text = toCsv(['a', 'b'], [
      [1, 'x'],
      [2, 'y,z'],
    ]);
    const parsed = parseCsv(text);
    assert.deepEqual(parsed.columns, ['a', 'b']);
    assert.equal(parsed.rows.length, 2);
  });
});

describe('registry', () => {
  it('normalizes engine aliases', () => {
    assert.equal(normalizeEngine('postgresql'), 'postgres');
    assert.equal(normalizeEngine('sqlserver'), 'mssql');
    assert.equal(normalizeEngine('valkey'), 'redis');
  });
});
