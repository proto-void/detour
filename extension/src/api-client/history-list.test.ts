import { describe, expect, it } from 'vitest';
import { filterHistoryEntries, groupHistoryEntries, historyDayGroup, historyRowLabel } from './history-list';
import type { HistoryEntry } from './model';

const entry = (partial: Partial<HistoryEntry> & Pick<HistoryEntry, 'id' | 'at' | 'url'>): HistoryEntry => ({
  method: 'GET',
  bodyPreview: '',
  ...partial,
});

describe('history-list', () => {
  const noon = new Date(2026, 9, 21, 12, 0, 0).getTime(); // local Oct 21 2026 noon

  it('groups by today yesterday earlier', () => {
    expect(historyDayGroup(noon, noon)).toBe('today');
    expect(historyDayGroup(noon - 86_400_000, noon)).toBe('yesterday');
    expect(historyDayGroup(noon - 3 * 86_400_000, noon)).toBe('earlier');
  });

  it('filters by method status url and name', () => {
    const entries = [
      entry({ id: '1', at: noon, url: 'https://api.example.com/users', method: 'GET', status: 200, name: 'List users' }),
      entry({ id: '2', at: noon, url: 'https://other.test/x', method: 'POST', status: 500 }),
    ];
    expect(filterHistoryEntries(entries, 'users').map((e) => e.id)).toEqual(['1']);
    expect(filterHistoryEntries(entries, 'post').map((e) => e.id)).toEqual(['2']);
    expect(filterHistoryEntries(entries, '500').map((e) => e.id)).toEqual(['2']);
    expect(filterHistoryEntries(entries, 'list').map((e) => e.id)).toEqual(['1']);
  });

  it('builds ordered non-empty groups', () => {
    const entries = [
      entry({ id: 't', at: noon, url: 'https://a/t' }),
      entry({ id: 'y', at: noon - 86_400_000, url: 'https://a/y' }),
      entry({ id: 'e', at: noon - 5 * 86_400_000, url: 'https://a/e' }),
    ];
    const groups = groupHistoryEntries(entries, '', noon);
    expect(groups.map((g) => g.key)).toEqual(['today', 'yesterday', 'earlier']);
    expect(groups[0]!.entries[0]!.id).toBe('t');
  });

  it('prefers name for row label and truncates', () => {
    expect(historyRowLabel(entry({ id: '1', at: 0, url: 'https://long', name: 'Short' }))).toBe('Short');
    const long = 'x'.repeat(60);
    expect(historyRowLabel(entry({ id: '2', at: 0, url: long }), 20).endsWith('…')).toBe(true);
  });
});
