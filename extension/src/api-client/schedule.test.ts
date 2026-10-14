import { describe, expect, it } from 'vitest';
import { alarmNameFor, MIN_INTERVAL_MINUTES, normalizePeriodMinutes, scheduleIdFromAlarm } from './schedule';

describe('schedule helpers', () => {
  it('round-trips alarm names and clamps period', () => {
    expect(alarmNameFor('abc')).toBe('detour-api-run:abc');
    expect(scheduleIdFromAlarm('detour-api-run:abc')).toBe('abc');
    expect(scheduleIdFromAlarm('other')).toBeNull();
    expect(normalizePeriodMinutes(0.5)).toBe(MIN_INTERVAL_MINUTES);
    expect(normalizePeriodMinutes(5)).toBe(5);
  });
});
