import { ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import * as db from './db';
import { DEFAULT_TIMEZONE } from './constants';
import { Schedule } from './types';

const DOSE_EVENTS_TABLE = process.env.DOSE_EVENTS_TABLE!;
const DEVICES_TABLE = process.env.DEVICES_TABLE!;

// Expo push service endpoint — stored tokens are Expo push tokens, so
// delivery goes through Expo's API rather than SNS platform applications.
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
  sound: string;
  priority: string;
  categoryId: string;
}

/**
 * Runs every minute via EventBridge.
 * Checks all active schedules against recent dose events.
 * If a dose is due and not yet taken/dismissed, sends a push notification.
 */
export async function handler() {
  const now = new Date();

  // Scan all devices. NOTE: Scan returns at most 1MB per page and we do not
  // follow LastEvaluatedKey — acceptable at the current single-user scale.
  const devicesResult = await db.docClient.send(new ScanCommand({
    TableName: DEVICES_TABLE,
  }));
  const devices = devicesResult.Items ?? [];

  const messages: ExpoPushMessage[] = [];

  for (const device of devices) {
    if (!device.pushToken) continue;

    const deviceId = device.deviceId as string;
    const timezone = (device.timezone as string) || DEFAULT_TIMEZONE;

    const schedules = (await db.getSchedules(deviceId)).filter(s => s.status === 'active');

    for (const schedule of schedules) {
      if (!isScheduleDue(schedule, now, timezone)) continue;

      // Check if there's already a dose event for this time window
      const alreadyHandled = await hasDoseEventInWindow(deviceId, schedule.scheduleId, now);
      if (alreadyHandled) continue;

      // Get medicine name for notification
      const medicine = await db.getMedicine(deviceId, schedule.medicineId);
      if (!medicine || medicine.status !== 'active') continue;

      const qtyStr = medicine.quantity === 1 ? '' : `${medicine.quantity} x `;
      messages.push({
        to: device.pushToken as string,
        title: `🧸 ${medicine.name}`,
        body: `Time to take ${qtyStr}${medicine.strength} (${medicine.form})`,
        data: {
          medicineId: schedule.medicineId,
          scheduleId: schedule.scheduleId,
          scheduledTime: now.toISOString(),
        },
        sound: 'default',
        priority: 'high',
        categoryId: 'DOSE_REMINDER',
      });
    }
  }

  if (messages.length > 0) {
    await sendExpoPush(messages);
  }
}

export function getLocalTimeParts(now: Date, timezone: string): { hour: number; minute: number; day: number } {
  // Use Intl.DateTimeFormat for reliable timezone conversion
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'short',
  });
  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);

  // Map weekday string to number
  const dayStr = parts.find(p => p.type === 'weekday')?.value ?? '';
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = dayMap[dayStr] ?? now.getDay();

  return { hour, minute, day };
}

export function isScheduleDue(schedule: Schedule, now: Date, timezone: string): boolean {
  const { hour: currentHour, minute: currentMinute, day: currentDay } = getLocalTimeParts(now, timezone);

  // Check day-of-week filter
  const daysOfWeek = schedule.daysOfWeek;
  if (daysOfWeek && daysOfWeek.length > 0 && !daysOfWeek.includes(currentDay)) {
    return false;
  }

  if (schedule.type === 'absolute') {
    const times = schedule.times;
    if (!times) return false;

    return times.some(time => {
      const parts = time.split(':');
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1] || '0', 10);
      if (isNaN(h) || isNaN(m)) return false;
      return currentHour === h && currentMinute === m;
    });
  }

  if (schedule.type === 'interval') {
    const intervalHours = schedule.intervalHours;
    if (!intervalHours || intervalHours <= 0) return false;

    // Interval schedules are anchored to createdAt (UTC modulo math) — the
    // same contract as mobile/src/services/doseSchedule.ts. Keep them in sync.
    const created = new Date(schedule.createdAt);
    if (isNaN(created.getTime())) return false;
    const diffMs = now.getTime() - created.getTime();
    const intervalMs = intervalHours * 3600 * 1000;
    const remainder = diffMs % intervalMs;
    // Fire if within 1-minute window of an interval boundary
    return remainder < 60000 || remainder > (intervalMs - 60000);
  }

  return false;
}

export async function hasDoseEventInWindow(deviceId: string, scheduleId: string, now: Date): Promise<boolean> {
  // Check for dose events in the last 30 minutes to avoid duplicate notifications
  // (wider window handles cases where user took dose early, anticipating reminder)
  const windowStart = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

  const result = await db.docClient.send(new QueryCommand({
    TableName: DOSE_EVENTS_TABLE,
    IndexName: 'byTimestamp',
    KeyConditionExpression: 'deviceId = :d AND #ts >= :start',
    FilterExpression: 'scheduleId = :s',
    ExpressionAttributeNames: { '#ts': 'timestamp' },
    ExpressionAttributeValues: {
      ':d': deviceId,
      ':s': scheduleId,
      ':start': windowStart,
    },
  }));

  return (result.Items?.length ?? 0) > 0;
}

/**
 * Expo push tokens are bearer credentials — never write them to CloudWatch.
 * Expo error responses echo the offending token verbatim, so redact it before
 * logging.
 */
function redactPushTokens(text: string): string {
  return text.replace(/ExponentPushToken\[[^\]]*\]/g, 'ExponentPushToken[REDACTED]');
}

async function sendExpoPush(messages: ExpoPushMessage[]): Promise<void> {
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      // Expo accepts up to 100 messages per request — far above current scale.
      body: JSON.stringify(messages),
    });

    if (!res.ok) {
      console.error(`Expo push request failed: ${res.status} ${redactPushTokens(await res.text())}`);
      return;
    }

    const result = await res.json() as {
      data?: Array<{ status: string; message?: string; details?: { error?: string } }>;
    };
    (result.data ?? []).forEach((ticket, i) => {
      if (ticket.status !== 'ok') {
        console.error(
          `Expo push ticket ${i} error:`,
          ticket.details?.error ?? redactPushTokens(ticket.message ?? 'unknown'),
        );
      }
    });
  } catch (err) {
    console.error('Expo push request failed:', err);
  }
}
