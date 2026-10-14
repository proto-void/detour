import * as v from 'valibot';

export const API_SCHEDULES_KEY = 'apiSchedules';
export const ALARM_PREFIX = 'detour-api-run:';
/** chrome.alarms minimum period in minutes. */
export const MIN_INTERVAL_MINUTES = 1;

export const ApiScheduleSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  name: v.pipe(v.string(), v.minLength(1)),
  collectionId: v.string(),
  folderId: v.optional(v.nullable(v.string()), null),
  periodMinutes: v.pipe(v.number(), v.minValue(MIN_INTERVAL_MINUTES)),
  enabled: v.optional(v.boolean(), true),
  notifyOnFail: v.optional(v.boolean(), false),
  createdAt: v.number(),
});
export type ApiSchedule = v.InferOutput<typeof ApiScheduleSchema>;

export function alarmNameFor(scheduleId: string): string {
  return `${ALARM_PREFIX}${scheduleId}`;
}

export function scheduleIdFromAlarm(name: string): string | null {
  if (!name.startsWith(ALARM_PREFIX)) return null;
  return name.slice(ALARM_PREFIX.length) || null;
}

export function normalizePeriodMinutes(minutes: number): number {
  return Math.max(MIN_INTERVAL_MINUTES, Math.round(minutes));
}

export const SCHEDULE_BROWSER_OPEN_COPY =
  'Scheduled runs use chrome.alarms and only fire while the browser is open. They do not run when Chrome is quit.';
