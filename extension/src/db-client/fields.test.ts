import { describe, expect, it } from 'vitest';
import {
  ADVANCED_GROUPS,
  fieldVisible,
  fieldsFor,
  getByPath,
  groupSummary,
  secretAccountKind,
  setByPath,
  variantsFor,
} from './fields';

describe('fields descriptors', () => {
  it('exposes basic + advanced groups for postgres', () => {
    const fields = fieldsFor('postgres');
    expect(fields.some((f) => f.group === 'basic' && f.path === 'host')).toBe(true);
    expect(fields.some((f) => f.group === 'tls')).toBe(true);
    expect(fields.some((f) => f.group === 'ssh')).toBe(true);
    const gssapi = fields.find((f) => f.path === 'engineOptions.authMethod');
    expect(gssapi?.options?.some((o) => o.value === 'gssapi' && o.disabled)).toBe(true);
  });

  it('marks soft-required basics (Host/Port, URI, region, SQLite file, Oracle service)', () => {
    expect(fieldsFor('postgres').find((f) => f.path === 'host')?.required).toBe(true);
    expect(fieldsFor('postgres').find((f) => f.path === 'port')?.required).toBe(true);
    expect(fieldsFor('postgres').find((f) => f.path === 'username')?.required).toBeFalsy();
    expect(fieldsFor('mongodb').find((f) => f.path === 'uri')?.required).toBe(true);
    expect(fieldsFor('dynamodb').find((f) => f.path === 'region')?.required).toBe(true);
    expect(fieldsFor('sqlite').find((f) => f.path === 'filename')?.required).toBe(true);
    expect(fieldsFor('oracle').find((f) => f.path === 'service')?.required).toBe(true);
    expect(fieldsFor('cassandra').find((f) => f.path === 'localDataCenter')?.required).toBeFalsy();
  });

  it('always shows CA / client cert / client key under SSL (mode does not hide them)', () => {
    const fields = fieldsFor('postgres');
    const ca = fields.find((f) => f.id === 'tls.caPath')!;
    const cert = fields.find((f) => f.id === 'tls.certPath')!;
    const key = fields.find((f) => f.id === 'tls.keyPath')!;
    expect(ca.when).toBeUndefined();
    expect(cert.when).toBeUndefined();
    expect(key.when).toBeUndefined();
    expect(fields.filter((f) => f.path === 'tls.caPath')).toHaveLength(1);
    expect(fields.some((f) => f.id === 'tls.keyPassphrase')).toBe(false);
    for (const mode of ['disable', 'required', 'verify-ca', 'verify-full'] as const) {
      const get = (p: string) => (p === 'tls.mode' ? mode : undefined);
      expect(fieldVisible(ca, get)).toBe(true);
      expect(fieldVisible(cert, get)).toBe(true);
      expect(fieldVisible(key, get)).toBe(true);
    }
    // CA / client cert stay path-only (passphrase is modal-only for encrypted keys).
    expect(fields.some((f) => f.path === 'tls.caPath' && f.kind === 'password')).toBe(false);
    expect(fields.some((f) => f.path === 'tls.certPath' && f.kind === 'password')).toBe(false);
    expect(secretAccountKind('db-x', 'sslKeyPass')).toBe('db-x:sslKeyPass');
  });

  it('shows Java truststore/keystore paths + secret password kinds under SSL', () => {
    const fields = fieldsFor('cassandra');
    expect(fields.some((f) => f.path === 'tls.trustStorePath')).toBe(true);
    expect(fields.some((f) => f.path === 'tls.keyStorePath')).toBe(true);
    expect(fields.find((f) => f.secretKind === 'trustStorePass')?.kind).toBe('password');
    expect(fields.find((f) => f.secretKind === 'keyStorePass')?.kind).toBe('password');
    expect(secretAccountKind('db-x', 'trustStorePass')).toBe('db-x:trustStorePass');
    expect(secretAccountKind('db-x', 'keyStorePass')).toBe('db-x:keyStorePass');
  });

  it('marks mysql kerberos disabled', () => {
    const auth = fieldsFor('mysql').find((f) => f.path === 'engineOptions.authMethod');
    expect(auth?.options?.find((o) => o.value === 'kerberos')?.disabled).toBe(true);
  });

  it('variants for cassandra family', () => {
    expect(variantsFor('cassandra').map((v) => v.value)).toContain('astra');
  });

  it('variants sorted alphabetically by label', () => {
    const labels = variantsFor('cassandra').map((v) => v.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
    expect(variantsFor('mysql').map((v) => v.label)).toEqual(['MariaDB', 'MySQL']);
    expect(variantsFor('elasticsearch').map((v) => v.label)).toEqual(['Elasticsearch', 'OpenSearch']);
  });

  it('fieldVisible respects when', () => {
    const field = fieldsFor('postgres').find((f) => f.path === 'ssh.host')!;
    expect(fieldVisible(field, (p) => (p === 'ssh.enabled' ? false : undefined))).toBe(false);
    expect(fieldVisible(field, (p) => (p === 'ssh.enabled' ? true : undefined))).toBe(true);
  });

  it('get/set by path', () => {
    const obj = setByPath({ tls: { mode: 'disable' } }, 'tls.mode', 'verify-full');
    expect(getByPath(obj, 'tls.mode')).toBe('verify-full');
  });

  it('group summaries', () => {
    expect(groupSummary('tls', (p) => (p === 'tls.mode' ? 'verify-full' : undefined))).toContain(
      'verify-full',
    );
    expect(groupSummary('ssh', () => false)).toBe('SSH: off');
    expect(ADVANCED_GROUPS).toContain('proxy');
  });
});
