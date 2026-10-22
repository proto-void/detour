import { describe, expect, it } from 'vitest';
import { listVariableRefs, resolveVariables } from './variables';

describe('variables', () => {
  it('resolves environment over collection over globals', () => {
    const scopes = {
      environment: [{ id: '1', key: 'host', initialValue: 'env.example', currentValue: 'env.example', secret: false, encrypted: null }],
      collection: [{ id: '2', key: 'host', value: 'col.example', enabled: true }],
      globals: [{ id: '3', key: 'host', value: 'global.example', enabled: true }],
    };
    expect(resolveVariables('https://{{host}}/a', scopes)).toBe('https://env.example/a');
  });

  it('falls through when environment value is empty', () => {
    const scopes = {
      environment: [{ id: '1', key: 'host', initialValue: '', currentValue: '', secret: false, encrypted: null }],
      collection: [{ id: '2', key: 'host', value: 'col.example', enabled: true }],
    };
    expect(resolveVariables('{{host}}', scopes)).toBe('col.example');
  });

  it('leaves unresolved tokens in place', () => {
    expect(resolveVariables('{{missing}}', {})).toBe('{{missing}}');
  });

  it('supports dynamic $guid $timestamp $randomInt', () => {
    const guid = resolveVariables('{{$guid}}', {});
    const ts = resolveVariables('{{$timestamp}}', {});
    const n = resolveVariables('{{$randomInt}}', {});
    expect(guid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(Number(ts)).toBeGreaterThan(1_700_000_000);
    expect(Number(n)).toBeGreaterThanOrEqual(0);
    expect(Number(n)).toBeLessThan(1000);
  });

  it('lists unique refs', () => {
    expect(listVariableRefs('{{a}} {{b}} {{a}}')).toEqual(['a', 'b']);
  });
});
