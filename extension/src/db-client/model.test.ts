import { describe, expect, it } from 'vitest';
import {
  defaultReadOnly,
  effectiveTlsMode,
  ENV_OPTIONS,
  environmentsSorted,
  migrateConnection,
  migrateConnections,
} from './model';

describe('migrateConnection', () => {
  it('maps flat tlsEnabled + verify into tls.mode verify-full', () => {
    const c = migrateConnection({
      id: 'c1',
      name: 'Old',
      tlsEnabled: true,
      tlsRejectUnauthorized: true,
    });
    expect(c.tls?.mode).toBe('verify-full');
    expect(c.tlsEnabled).toBeUndefined();
    expect(effectiveTlsMode(c)).toBe('verify-full');
  });

  it('maps skip-verify into tls.mode required', () => {
    const c = migrateConnection({
      id: 'c2',
      name: 'Skip',
      tlsEnabled: true,
      tlsRejectUnauthorized: false,
    });
    expect(c.tls?.mode).toBe('required');
  });

  it('migrates flat ssh host into enabled + auth', () => {
    const c = migrateConnection({
      id: 'c3',
      name: 'SSH',
      ssh: { host: 'bastion', port: 22, username: 'ec2', usePrivateKey: true },
    });
    expect(c.ssh?.enabled).toBe(true);
    expect(c.ssh?.host).toBe('bastion');
    expect(c.ssh?.auth).toBe('privateKey');
    expect(c.ssh?.usePrivateKey).toBeUndefined();
  });

  it('fills defaults for proxy/advanced/passwordStorage', () => {
    const c = migrateConnection({ id: 'c4', name: 'Bare' });
    expect(c.proxy?.type).toBe('none');
    expect(c.advanced?.autoCommit).toBe(true);
    expect(c.passwordStorage).toBe('keychain');
    expect(c.driverProperties).toEqual([]);
  });

  it('is idempotent on already-v2 connections', () => {
    const once = migrateConnection({
      id: 'c5',
      name: 'V2',
      tls: { mode: 'verify-ca', caPath: '/tmp/ca.pem' },
      ssh: { enabled: true, host: 'j', auth: 'agent' },
    });
    const twice = migrateConnection(once);
    expect(twice.tls?.mode).toBe('verify-ca');
    expect(twice.tls?.caPath).toBe('/tmp/ca.pem');
    expect(twice.ssh?.auth).toBe('agent');
  });

  it('migrates a list', () => {
    const list = migrateConnections([
      { id: 'a', name: 'A', tlsEnabled: false },
      { id: 'b', name: 'B', tlsEnabled: true, tlsRejectUnauthorized: true },
    ]);
    expect(list).toHaveLength(2);
    expect(list[0]?.tls?.mode).toBe('disable');
    expect(list[1]?.tls?.mode).toBe('verify-full');
  });
});

describe('environments', () => {
  it('lists Local → Development → QA → Staging → Production (lifecycle order)', () => {
    expect(ENV_OPTIONS.map((e) => e.value)).toEqual([
      'local',
      'development',
      'qa',
      'staging',
      'production',
    ]);
    expect(ENV_OPTIONS.map((e) => e.label)).toEqual([
      'Local',
      'Development',
      'QA',
      'Staging',
      'Production',
    ]);
    expect(environmentsSorted()).toBe(ENV_OPTIONS);
  });

  it('defaults read-only only for production', () => {
    expect(defaultReadOnly('production')).toBe(true);
    expect(defaultReadOnly('development')).toBe(false);
    expect(defaultReadOnly('qa')).toBe(false);
    expect(defaultReadOnly('staging')).toBe(false);
    expect(defaultReadOnly('local')).toBe(false);
    expect(defaultReadOnly('development', true)).toBe(true);
  });
});
