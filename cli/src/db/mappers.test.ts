import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCassandraOptions } from './adapters/cassandra-config.ts';
import { buildClickHouseOptions } from './adapters/clickhouse-config.ts';
import { buildDynamoOptions } from './adapters/dynamodb-config.ts';
import { buildElasticsearchOptions } from './adapters/elasticsearch-config.ts';
import { buildMongoOptions } from './adapters/mongodb-config.ts';
import { buildMssqlOptions } from './adapters/mssql-config.ts';
import { buildMysqlOptions, MYSQL_UNSUPPORTED_AUTH } from './adapters/mysql-config.ts';
import { buildOracleOptions } from './adapters/oracle-config.ts';
import { buildPostgresOptions, POSTGRES_UNSUPPORTED_AUTH } from './adapters/postgres-config.ts';
import { buildRedisOptions } from './adapters/redis-config.ts';
import { buildSqliteOptions } from './adapters/sqlite-config.ts';

describe('config mappers', () => {
  it('postgres marks gssapi unsupported', () => {
    const o = buildPostgresOptions({ authMethod: 'gssapi' });
    assert.equal(o.unsupportedAuth, 'gssapi');
    assert.ok(POSTGRES_UNSUPPORTED_AUTH.includes('gssapi'));
  });

  it('postgres builds ssl from tls mode', () => {
    const o = buildPostgresOptions({
      host: 'db',
      username: 'u',
      password: 'p',
      tls: { enabled: true, mode: 'verify-full', ca: 'CA', rejectUnauthorized: true },
    });
    assert.ok(o.ssl);
    assert.equal(o.ssl?.rejectUnauthorized, true);
    assert.equal(o.ssl?.ca, 'CA');
  });

  it('postgres ssl includes client key passphrase', () => {
    const o = buildPostgresOptions({
      host: 'db',
      tls: {
        enabled: true,
        mode: 'verify-full',
        key: '-----BEGIN ENCRYPTED PRIVATE KEY-----',
        keyPassphrase: 'unlock-me',
        rejectUnauthorized: true,
      },
    });
    assert.equal(o.ssl?.passphrase, 'unlock-me');
    assert.equal(o.ssl?.key, '-----BEGIN ENCRYPTED PRIVATE KEY-----');
  });

  it('cassandra sslOptions includes client key passphrase', () => {
    const o = buildCassandraOptions({
      contactPoints: ['127.0.0.1'],
      tls: {
        enabled: true,
        cert: 'CLIENT_CERT',
        key: 'ENCRYPTED_KEY',
        keyPassphrase: 'cass-pass',
        rejectUnauthorized: true,
      },
    });
    assert.equal(o.sslOptions?.passphrase, 'cass-pass');
    assert.equal(o.sslOptions?.key, 'ENCRYPTED_KEY');
    assert.equal(o.sslOptions?.cert, 'CLIENT_CERT');
  });

  it('cassandra allows key-only TLS (no IncompletePair)', () => {
    const o = buildCassandraOptions({
      contactPoints: ['127.0.0.1'],
      tls: { enabled: true, key: 'KEY_ONLY', rejectUnauthorized: true },
    });
    assert.equal(o.sslOptions?.key, 'KEY_ONLY');
    assert.equal(o.sslOptions?.cert, undefined);
  });

  it('cassandra allows cert-only TLS (no IncompletePair)', () => {
    const o = buildCassandraOptions({
      contactPoints: ['127.0.0.1'],
      tls: { enabled: true, cert: 'CERT_ONLY', rejectUnauthorized: true },
    });
    assert.equal(o.sslOptions?.cert, 'CERT_ONLY');
    assert.equal(o.sslOptions?.key, undefined);
  });

  it('mysql marks kerberos unsupported', () => {
    const o = buildMysqlOptions({ authMethod: 'kerberos' });
    assert.equal(o.unsupportedAuth, 'kerberos');
    assert.ok(MYSQL_UNSUPPORTED_AUTH.includes('kerberos'));
  });

  it('mssql entra-interactive flags needsEntraInteractive', () => {
    const o = buildMssqlOptions({
      host: 'sql.example',
      authMethod: 'entra-interactive',
      encrypt: 'mandatory',
    });
    assert.equal(o.needsEntraInteractive, true);
    assert.equal(o.extra['detour.entra'], 'entra-interactive');
  });

  it('redis sentinel mode', () => {
    const o = buildRedisOptions({
      mode: 'sentinel',
      sentinelMaster: 'mymaster',
      sentinelNodes: '127.0.0.1:26379,127.0.0.1:26380',
    });
    assert.equal(o.mode, 'sentinel');
    assert.equal(o.sentinel?.sentinels.length, 2);
  });

  it('mongo gssapi needs kerberos', () => {
    const o = buildMongoOptions({ authMechanism: 'GSSAPI', host: 'm' });
    assert.equal(o.needsKerberos, true);
  });

  it('oracle wallet + thick', () => {
    const o = buildOracleOptions({
      connectionType: 'wallet',
      walletPath: '/w',
      thick: true,
      instantClientPath: '/opt/oracle',
      service: 'x',
    });
    assert.equal(o.thick, true);
    assert.equal(o.extra.walletPath, '/w');
    assert.equal(o.needsThickForKerberos, true);
  });

  it('sqlite requires path', () => {
    assert.throws(() => buildSqliteOptions({}), /file path/);
    assert.equal(buildSqliteOptions({ filename: '/tmp/a.db' }).filename, '/tmp/a.db');
  });

  it('clickhouse https url', () => {
    const o = buildClickHouseOptions({ host: 'ch', protocol: 'https', port: 8443 });
    assert.equal(o.url, 'https://ch:8443');
  });

  it('elasticsearch aws-sigv4 needs region', () => {
    assert.throws(() => buildElasticsearchOptions({ authMethod: 'aws-sigv4' }), /region/);
    const o = buildElasticsearchOptions({ authMethod: 'aws-sigv4', region: 'us-east-1', host: 'os' });
    assert.equal(o.awsSigV4?.region, 'us-east-1');
  });

  it('dynamodb assume-role', () => {
    const o = buildDynamoOptions({
      authMethod: 'assumeRole',
      roleArn: 'arn:aws:iam::1:role/r',
      region: 'eu-west-1',
    });
    assert.equal(o.assumeRole?.roleArn, 'arn:aws:iam::1:role/r');
  });

  it('cassandra cosmos port', () => {
    const o = buildCassandraOptions({
      target: 'cosmos',
      contactPoints: ['c.cosmos.azure.com'],
      username: 'a',
      password: 'k',
      tls: { enabled: true },
    });
    assert.equal(o.protocolOptions?.port, 10350);
  });
});
