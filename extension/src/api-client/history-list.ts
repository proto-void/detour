import type { HistoryEntry } from './model';

export type HistoryGroupKey = 'today' | 'yesterday' | 'earlier';

export type HistoryGroup = {
  key: HistoryGroupKey;
  label: string;
  entries: HistoryEntry[];
};

const LABELS: Record<HistoryGroupKey, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  earlier: 'Earlier',
};

const ORDER: HistoryGroupKey[] = ['today', 'yesterday', 'earlier'];

export function historyDayGroup(at: number, now = Date.now()): HistoryGroupKey {
  const n = new Date(now);
  const startToday = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  const startYesterday = startToday - 86_400_000;
  if (at >= startToday) return 'today';
  if (at >= startYesterday) return 'yesterday';
  return 'earlier';
}

export function filterHistoryEntries(entries: HistoryEntry[], query: string): HistoryEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) => {
    if (e.url.toLowerCase().includes(q)) return true;
    if (e.method.toLowerCase().includes(q)) return true;
    if (e.name?.toLowerCase().includes(q)) return true;
    if (e.status != null && String(e.status).includes(q)) return true;
    return false;
  });
}

export function groupHistoryEntries(entries: HistoryEntry[], query = '', now = Date.now()): HistoryGroup[] {
  const filtered = filterHistoryEntries(entries, query);
  const buckets: Record<HistoryGroupKey, HistoryEntry[]> = {
    today: [],
    yesterday: [],
    earlier: [],
  };
  for (const entry of filtered) {
    buckets[historyDayGroup(entry.at, now)].push(entry);
  }
  return ORDER.filter((key) => buckets[key].length > 0).map((key) => ({
    key,
    label: LABELS[key],
    entries: buckets[key],
  }));
}

/** Prefer stored name; else ellipsized URL for the history row. */
export function historyRowLabel(entry: HistoryEntry, maxLen = 48): string {
  const raw = entry.name?.trim() || entry.url;
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, maxLen - 1)}…`;
}
