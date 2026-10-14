import { describe, expect, it } from 'vitest';
import { classifyCql, isReadOnlyBlocked } from './safety';

describe('classifyCql', () => {
  it('flags DROP / TRUNCATE / ALTER as destructive', () => {
    const v = classifyCql('DROP TABLE ks.users');
    expect(v.level).toBe('destructive');
    expect(v.requireTypedName).toBe(true);
    expect(v.objectName).toContain('users');
  });

  it('flags UPDATE without WHERE', () => {
    const v = classifyCql('UPDATE ks.users SET x = 1');
    expect(v.level).toBe('needsConfirm');
    expect(v.reasons.length).toBeGreaterThan(0);
  });

  it('allows SELECT', () => {
    expect(classifyCql('SELECT * FROM ks.users WHERE id = 1').level).toBe('safe');
  });
});

describe('isReadOnlyBlocked', () => {
  it('blocks writes when read-only', () => {
    expect(isReadOnlyBlocked('INSERT INTO ks.t (id) VALUES (1)', true)).toBe(true);
    expect(isReadOnlyBlocked('SELECT * FROM ks.t', true)).toBe(false);
    expect(isReadOnlyBlocked('DELETE FROM ks.t WHERE id = 1', false)).toBe(false);
  });
});
