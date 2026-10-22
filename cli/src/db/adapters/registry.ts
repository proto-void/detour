import { createCassandraAdapter } from './cassandra.ts';
import { createClickHouseAdapter } from './clickhouse.ts';
import { createDynamoAdapter } from './dynamodb.ts';
import { createElasticsearchAdapter } from './elasticsearch.ts';
import { createMongoAdapter } from './mongodb.ts';
import { createMssqlAdapter } from './mssql.ts';
import { createMysqlAdapter } from './mysql.ts';
import { createOracleAdapter } from './oracle.ts';
import { createPostgresAdapter } from './postgres.ts';
import { createRedisAdapter } from './redis.ts';
import { createSqliteAdapter } from './sqlite.ts';
import type { DbAdapter, EngineId } from './types.ts';

export function normalizeEngine(raw: string | undefined): EngineId {
  const e = (raw ?? 'cassandra').toLowerCase();
  if (e === 'postgresql' || e === 'pg' || e === 'cockroach' || e === 'cockroachdb') return 'postgres';
  if (e === 'mariadb' || e === 'tidb') return e === 'tidb' ? 'mysql' : 'mariadb';
  if (e === 'sqlserver' || e === 'azure-sql' || e === 'tds') return 'mssql';
  if (e === 'mongo') return 'mongodb';
  if (e === 'valkey') return 'redis';
  if (e === 'opensearch' || e === 'es') return e === 'es' ? 'elasticsearch' : 'opensearch';
  if (
    e === 'cassandra' ||
    e === 'postgres' ||
    e === 'mysql' ||
    e === 'mssql' ||
    e === 'sqlite' ||
    e === 'oracle' ||
    e === 'mongodb' ||
    e === 'redis' ||
    e === 'clickhouse' ||
    e === 'elasticsearch' ||
    e === 'dynamodb'
  ) {
    return e;
  }
  throw new Error(`Unknown engine "${raw}"`);
}

export function createAdapter(engine: string): DbAdapter {
  const id = normalizeEngine(engine);
  switch (id) {
    case 'cassandra':
      return createCassandraAdapter();
    case 'postgres':
      return createPostgresAdapter();
    case 'mysql':
      return createMysqlAdapter('mysql');
    case 'mariadb':
      return createMysqlAdapter('mariadb');
    case 'mssql':
      return createMssqlAdapter();
    case 'sqlite':
      return createSqliteAdapter();
    case 'oracle':
      return createOracleAdapter();
    case 'mongodb':
      return createMongoAdapter();
    case 'redis':
      return createRedisAdapter();
    case 'clickhouse':
      return createClickHouseAdapter();
    case 'elasticsearch':
      return createElasticsearchAdapter('elasticsearch');
    case 'opensearch':
      return createElasticsearchAdapter('opensearch');
    case 'dynamodb':
      return createDynamoAdapter();
    default:
      throw new Error(`Unsupported engine "${id}"`);
  }
}

export const ENGINE_IDS: EngineId[] = [
  'cassandra',
  'postgres',
  'mysql',
  'mariadb',
  'mssql',
  'sqlite',
  'oracle',
  'mongodb',
  'redis',
  'clickhouse',
  'elasticsearch',
  'opensearch',
  'dynamodb',
];
