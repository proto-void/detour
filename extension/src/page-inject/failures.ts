import type { StorageAreaLike } from '../rule-model/storage';

/** In `storage.session`: cleared with the browser session, never synced, no rule bodies. */
export const PAGE_FAILURES_KEY = 'pageFailures';
export const MAX_PAGE_FAILURES = 50;

export interface PageFailure {
  at: string;
  groupId: string;
  ruleId: string;
  /** Origin of the page, not its full URL. */
  page: string;
  message: string;
}

export async function loadFailures(area: StorageAreaLike): Promise<PageFailure[]> {
  const stored = (await area.get(PAGE_FAILURES_KEY))[PAGE_FAILURES_KEY];
  return Array.isArray(stored) ? (stored as PageFailure[]) : [];
}

/** Newest first, capped at {@link MAX_PAGE_FAILURES}. */
export async function recordFailure(area: StorageAreaLike, failure: PageFailure): Promise<void> {
  const list = [failure, ...(await loadFailures(area))].slice(0, MAX_PAGE_FAILURES);
  await area.set({ [PAGE_FAILURES_KEY]: list });
}

export const originOf = (url: string | undefined): string => {
  try {
    return new URL(url ?? '').origin;
  } catch {
    return '';
  }
};
