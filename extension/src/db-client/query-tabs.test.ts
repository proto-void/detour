import { describe, expect, it } from 'vitest';
import {
  appendSelectIfNeeded,
  insertAtCaret,
  normalizeStatement,
  qualifyTableRef,
  selectStarStatement,
} from './query-tabs';

describe('qualifyTableRef', () => {
  it('qualifies when no active keyspace', () => {
    expect(qualifyTableRef('ks', 'users', null)).toBe('ks.users');
    expect(qualifyTableRef('ks', 'users', undefined)).toBe('ks.users');
  });

  it('unqualifies when active keyspace matches', () => {
    expect(qualifyTableRef('ks', 'users', 'ks')).toBe('users');
  });

  it('qualifies when active keyspace differs', () => {
    expect(qualifyTableRef('other', 'users', 'ks')).toBe('other.users');
  });
});

describe('appendSelectIfNeeded', () => {
  it('appends when empty or different last statement', () => {
    const a = appendSelectIfNeeded('', 'ks', 'users');
    expect(a.appended).toBe(true);
    expect(a.body).toBe(selectStarStatement('ks', 'users'));

    const b = appendSelectIfNeeded('SELECT 1;', 'ks', 'users');
    expect(b.appended).toBe(true);
    expect(b.body).toContain('SELECT 1;');
    expect(b.body).toContain(selectStarStatement('ks', 'users'));
  });

  it('dedupes when last statement is already that SELECT', () => {
    const stmt = selectStarStatement('ks', 'users');
    const r = appendSelectIfNeeded(stmt, 'ks', 'users');
    expect(r.appended).toBe(false);
    expect(r.body).toBe(stmt);

    const withExtra = appendSelectIfNeeded(`SELECT 1;\n${stmt}`, 'ks', 'users');
    expect(withExtra.appended).toBe(false);
  });

  it('uses unqualified SELECT when active keyspace matches', () => {
    const r = appendSelectIfNeeded('', 'ks', 'users', 'ks');
    expect(r.statement).toBe('SELECT * FROM users LIMIT 100;');
    expect(r.body).toBe(r.statement);
  });

  it('normalize ignores trailing semicolon and case', () => {
    expect(normalizeStatement('Select 1;')).toBe('select 1');
  });
});

describe('insertAtCaret', () => {
  it('inserts at caret', () => {
    expect(insertAtCaret('ab', 1, 'X')).toEqual({ body: 'aXb', caret: 2 });
  });
});
