import { describe, expect, it } from 'vitest';
import type { Workspace } from '../rule-model/schema';
import { POPUP_GROUP_LIMIT, popupGroupList, withGroupEnabled } from './popup';

const workspace = (count: number, offAt = -1): Workspace => ({
  groups: Array.from({ length: count }, (_, i) => ({
    id: `g${i}`,
    name: `Group ${i}`,
    enabled: i !== offAt,
    rules: [],
  })),
});

describe('popup group list', () => {
  it('shows every group when there are eight or fewer, in workspace order', () => {
    const list = popupGroupList(workspace(3, 1));
    expect(list.more).toBe(0);
    expect(list.shown.map((group) => [group.name, group.enabled])).toEqual([
      ['Group 0', true],
      ['Group 1', false],
      ['Group 2', true],
    ]);
  });

  it('keeps the first eight groups and counts the rest', () => {
    const list = popupGroupList(workspace(POPUP_GROUP_LIMIT + 2));
    expect(list.shown.map((group) => group.id)).toEqual(Array.from({ length: 8 }, (_, i) => `g${i}`));
    expect(list.more).toBe(2);
  });

  it('flips one group and leaves the input workspace alone', () => {
    const ws = workspace(2);
    const next = withGroupEnabled(ws, 'g0', false);
    expect(next.groups[0]?.enabled).toBe(false);
    expect(next.groups[1]?.enabled).toBe(true);
    expect(ws.groups[0]?.enabled).toBe(true);
  });
});
