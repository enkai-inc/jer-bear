/**
 * Pure dose-scheduling logic — the single source of truth for when doses are
 * due. No store or platform dependencies, so it is directly testable with an
 * injectable `now`.
 *
 * The interval-schedule contract (doses anchored to schedule.createdAt) is
 * shared with the server-side notification checker
 * (infra/lambda/src/notification-checker.ts) — keep them in sync.
 */
import { Medicine, Schedule, DoseEvent, UpcomingDose } from '../types';
import { OVERDUE_GRACE_MS } from '../constants';

/**
 * Parse an "HH:MM" time string with full range validation.
 * Returns null for anything that is not a valid 24-hour time.
 */
export function parseTimeString(t: string): { hour: number; minute: number } | null {
  if (typeof t !== 'string') return null;
  const parts = t.split(':');
  const hour = parseInt(parts[0], 10);
  const minute = parseInt(parts[1] || '0', 10);
  if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return { hour, minute };
}

/**
 * A schedule only produces doses when both the schedule and its medicine are active.
 * Type predicate so callers can narrow `medicine` from `Medicine | undefined`.
 */
export function isSchedulePairActive(
  medicine: Medicine | undefined,
  schedule: Schedule,
): medicine is Medicine {
  return schedule.status === 'active' && !!medicine && medicine.status === 'active';
}

/**
 * Compute the upcoming doses for the given data set at the given moment.
 * Doses already handled today (taken/dismissed/missed — snoozed still shows)
 * are filtered out; overdue doses stay visible within OVERDUE_GRACE_MS.
 */
export function computeUpcomingDoses(
  medicines: Medicine[],
  schedules: Schedule[],
  doseEvents: DoseEvent[],
  now: Date,
): UpcomingDose[] {
  const today = now.getDay(); // 0=Sun..6=Sat
  const upcoming: UpcomingDose[] = [];

  // Build a set of recently handled dose keys (scheduleId + hour:minute)
  // to filter out doses already taken/dismissed today
  const handledKeys = new Set<string>();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  for (const event of doseEvents) {
    if (event.action === 'snoozed') continue; // snoozed doses should still show
    const eventTime = new Date(event.timestamp);
    if (eventTime >= todayStart) {
      // Key by scheduleId + scheduled hour to dedup
      const scheduledDate = new Date(event.scheduledTime);
      const key = `${event.scheduleId}-${scheduledDate.getHours()}:${scheduledDate.getMinutes()}`;
      handledKeys.add(key);
    }
  }

  for (const schedule of schedules) {
    const medicine = medicines.find(m => m.medicineId === schedule.medicineId);
    if (!isSchedulePairActive(medicine, schedule)) continue;

    // Check daysOfWeek filter
    const daysOfWeek = schedule.daysOfWeek;
    if (daysOfWeek && daysOfWeek.length > 0 && !daysOfWeek.includes(today)) continue;

    if (schedule.type === 'absolute' && schedule.times) {
      for (const time of schedule.times) {
        const parsed = parseTimeString(time);
        if (!parsed) continue;

        const scheduledTime = new Date(now);
        scheduledTime.setHours(parsed.hour, parsed.minute, 0, 0);

        // Check if already handled
        const key = `${schedule.scheduleId}-${parsed.hour}:${parsed.minute}`;
        if (handledKeys.has(key) && scheduledTime <= now) continue;

        if (scheduledTime < now) {
          // Keep overdue doses visible within grace period so alerts can fire
          const overdueMs = now.getTime() - scheduledTime.getTime();
          if (overdueMs > OVERDUE_GRACE_MS) {
            // Past grace period — show as tomorrow
            scheduledTime.setDate(scheduledTime.getDate() + 1);
          }
          // else: keep as today's time (overdue but within grace window)
        }

        upcoming.push({ medicine, schedule, scheduledTime });
      }
    }

    if (schedule.type === 'interval' && schedule.intervalHours) {
      const intervalHours = Number(schedule.intervalHours);
      if (isNaN(intervalHours) || intervalHours <= 0) continue;

      const intervalMs = intervalHours * 60 * 60 * 1000;

      // Anchor to schedule creation time instead of midnight; the next dose is
      // the first interval boundary strictly after `now` (modulo math — same
      // semantics as stepping forward from createdAt, matches the server-side
      // notification checker's approach)
      const createdAt = new Date(schedule.createdAt);
      const elapsedIntervals = Math.floor((now.getTime() - createdAt.getTime()) / intervalMs);
      const anchor = new Date(createdAt.getTime() + (Math.max(elapsedIntervals, -1) + 1) * intervalMs);

      // Also check if the most recent past interval is within grace period
      const prevAnchor = new Date(anchor.getTime() - intervalMs);
      const prevOverdueMs = now.getTime() - prevAnchor.getTime();
      const prevKey = `${schedule.scheduleId}-${prevAnchor.getHours()}:${prevAnchor.getMinutes()}`;
      if (prevOverdueMs >= 0 && prevOverdueMs <= OVERDUE_GRACE_MS && !handledKeys.has(prevKey)) {
        upcoming.push({ medicine, schedule, scheduledTime: prevAnchor });
      }

      // Check if this dose was already handled
      const key = `${schedule.scheduleId}-${anchor.getHours()}:${anchor.getMinutes()}`;
      if (!handledKeys.has(key)) {
        upcoming.push({ medicine, schedule, scheduledTime: anchor });
      }
    }
  }

  return upcoming.sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime());
}
