import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { Schedule, Medicine } from '../types';
import {
  NOTIFICATION_CATEGORY,
  NOTIFICATION_ACTIONS,
  NOTIFICATION_TYPES,
  SNOOZE_SECONDS,
  SNOOZE_MINUTES,
} from '../constants';
import { parseTimeString, isSchedulePairActive } from './doseSchedule';
import { formatDoseBody, formatDoseQuantity } from '../utils/format';
import { useStore } from '../store';
import { appendLog } from './logger';

// Configure notification behavior (not available on web)
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

// ─── Web Notifications (Browser API) ───────────────────────────

let webPermissionGranted = false;

export async function requestWebNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !('Notification' in window)) {
    appendLog('info', 'webNotif', `Skipped: platform=${Platform.OS}, window=${typeof window !== 'undefined'}, NotificationAPI=${'Notification' in (typeof window !== 'undefined' ? window : {})}`);
    return false;
  }
  if (Notification.permission === 'granted') {
    webPermissionGranted = true;
    appendLog('info', 'webNotif', 'Permission already granted');
    return true;
  }
  if (Notification.permission === 'denied') {
    appendLog('warn', 'webNotif', 'Permission denied by user');
    return false;
  }
  const result = await Notification.requestPermission();
  webPermissionGranted = result === 'granted';
  appendLog('info', 'webNotif', `Permission request result: ${result}`);
  return webPermissionGranted;
}

export function sendWebNotification(title: string, body: string, data?: Record<string, string>) {
  if (Platform.OS !== 'web' || !webPermissionGranted || typeof window === 'undefined' || !('Notification' in window)) {
    appendLog('warn', 'webNotif', `sendWebNotification skipped: platform=${Platform.OS}, permission=${webPermissionGranted}`);
    return;
  }
  try {
    new Notification(title, { body, tag: data?.scheduleId });
    appendLog('info', 'webNotif', `Sent notification (scheduleId=${data?.scheduleId ?? 'none'})`);
  } catch (e) {
    appendLog('error', 'webNotif', `Failed to send: ${e}`);
  }
}

// Track active web timers so we can cancel them
const webTimers: ReturnType<typeof setTimeout>[] = [];

function pruneWebTimer(handle: ReturnType<typeof setTimeout>) {
  const idx = webTimers.indexOf(handle);
  if (idx !== -1) webTimers.splice(idx, 1);
}

export function clearWebTimers() {
  for (const t of webTimers) clearTimeout(t);
  webTimers.length = 0;
}

export function scheduleWebNotifications(medicines: Medicine[], schedules: Schedule[]) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    appendLog('info', 'webSched', `Skipped: platform=${Platform.OS}`);
    return;
  }
  clearWebTimers();

  const now = new Date();
  let scheduled = 0;

  for (const schedule of schedules) {
    const medicine = medicines.find(m => m.medicineId === schedule.medicineId);
    if (!isSchedulePairActive(medicine, schedule)) continue;

    const body = formatDoseBody(medicine);

    if (schedule.type === 'absolute' && schedule.times) {
      for (const time of schedule.times) {
        const parsed = parseTimeString(time);
        if (!parsed) continue;

        const target = new Date(now);
        target.setHours(parsed.hour, parsed.minute, 0, 0);
        if (target <= now) target.setDate(target.getDate() + 1);

        const delayMs = target.getTime() - now.getTime();
        // Only schedule within next 24 hours
        if (delayMs > 0 && delayMs <= 86400000) {
          const delayMins = Math.round(delayMs / 60000);
          appendLog('info', 'webSched', `Timer: medicineId=${medicine.medicineId} at ${time} (in ${delayMins}m)`);
          let handle: ReturnType<typeof setTimeout>;
          const fire = () => {
            pruneWebTimer(handle);
            sendWebNotification(`🧸 ${medicine.name}`, body, {
              medicineId: medicine.medicineId,
              scheduleId: schedule.scheduleId,
            });
            // Re-arm the next wall-clock occurrence (recomputed rather than
            // +24h so DST shifts don't drift the time) — mirrors the interval
            // branch; without this the timer is one-shot and the fingerprint-
            // gated effect in App.tsx never re-arms it.
            const next = new Date();
            next.setHours(parsed.hour, parsed.minute, 0, 0);
            if (next <= new Date()) next.setDate(next.getDate() + 1);
            handle = setTimeout(fire, next.getTime() - Date.now());
            webTimers.push(handle);
          };
          handle = setTimeout(fire, delayMs);
          webTimers.push(handle);
          scheduled++;
        }
      }
    }

    if (schedule.type === 'interval' && schedule.intervalHours) {
      const intervalMs = schedule.intervalHours * 3600000;

      // Anchor the countdown to schedule.createdAt so re-scheduling (e.g. on
      // pull-to-refresh) doesn't restart the interval from "now"
      const createdAt = new Date(schedule.createdAt).getTime();
      let firstDelayMs = intervalMs;
      if (!isNaN(createdAt)) {
        const elapsed = ((now.getTime() - createdAt) % intervalMs + intervalMs) % intervalMs;
        firstDelayMs = intervalMs - elapsed;
      }

      appendLog('info', 'webSched', `Timer: medicineId=${medicine.medicineId} every ${schedule.intervalHours}h (first in ${Math.round(firstDelayMs / 60000)}m)`);
      let handle: ReturnType<typeof setTimeout>;
      const fire = () => {
        pruneWebTimer(handle);
        sendWebNotification(`🧸 ${medicine.name}`, body, {
          medicineId: medicine.medicineId,
          scheduleId: schedule.scheduleId,
        });
        handle = setTimeout(fire, intervalMs);
        webTimers.push(handle);
      };
      handle = setTimeout(fire, firstDelayMs);
      webTimers.push(handle);
      scheduled++;
    }
  }

  appendLog('info', 'webSched', `Scheduled ${scheduled} web notification timer(s) for ${medicines.length} meds / ${schedules.length} schedules`);
}

// Define notification actions for dose reminders
export async function setupNotificationCategories() {
  if (Platform.OS === 'web') return;
  await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORY, [
    {
      identifier: NOTIFICATION_ACTIONS.TAKEN,
      buttonTitle: 'Taken',
      options: { opensAppToForeground: false },
    },
    {
      identifier: NOTIFICATION_ACTIONS.SNOOZE,
      buttonTitle: `Snooze ${SNOOZE_MINUTES} min`,
      options: { opensAppToForeground: false },
    },
    {
      identifier: NOTIFICATION_ACTIONS.DISMISS,
      buttonTitle: 'Dismiss',
      options: { opensAppToForeground: false },
    },
  ]);
}

export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (!Device.isDevice) {
    appendLog('info', 'push', 'Push notifications require a physical device');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    appendLog('warn', 'push', 'Push notification permission not granted');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('dose-reminders', {
      name: 'Dose Reminders',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    });
  }

  // projectId is required in SDK 56+; configured via app.json extra.eas.projectId
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) {
    appendLog('warn', 'push', 'No EAS projectId configured — skipping push token registration');
    return null;
  }

  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch (e) {
    appendLog('error', 'push', `getExpoPushTokenAsync failed: ${(e as Error).message}`);
    return null;
  }
}

/**
 * Schedule local notifications for all active medicines.
 * This is the primary notification mechanism (high reliability on-device).
 */
export async function scheduleLocalNotifications(
  medicines: Medicine[],
  schedules: Schedule[],
) {
  if (Platform.OS === 'web') {
    appendLog('info', 'localNotif', 'Skipped on web platform');
    return;
  }

  // Preserve snooze reminders — only cancel scheduled dose notifications
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    existing
      .filter(notification => {
        const data = notification.content.data as { type?: string } | null;
        return data?.type !== NOTIFICATION_TYPES.SNOOZE; // keep snooze notifications
      })
      .map(notification =>
        Notifications.cancelScheduledNotificationAsync(notification.identifier),
      ),
  );

  const now = new Date();
  const pending: Promise<string>[] = [];

  for (const schedule of schedules) {
    const medicine = medicines.find(m => m.medicineId === schedule.medicineId);
    if (!isSchedulePairActive(medicine, schedule)) continue;

    const body = formatDoseBody(medicine);

    if (schedule.type === 'absolute' && schedule.times) {
      for (const time of schedule.times) {
        const parsed = parseTimeString(time);
        if (!parsed) continue;

        // Next occurrence of this time — today if still ahead, else tomorrow
        const nextOccurrence = new Date(now);
        nextOccurrence.setHours(parsed.hour, parsed.minute, 0, 0);
        if (nextOccurrence <= now) nextOccurrence.setDate(nextOccurrence.getDate() + 1);

        pending.push(Notifications.scheduleNotificationAsync({
          content: {
            title: `🧸 ${medicine.name}`,
            body,
            data: {
              medicineId: medicine.medicineId,
              scheduleId: schedule.scheduleId,
              scheduledTime: nextOccurrence.toISOString(),
              type: NOTIFICATION_TYPES.DOSE,
            },
            sound: 'default',
            categoryIdentifier: NOTIFICATION_CATEGORY,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: parsed.hour,
            minute: parsed.minute,
          },
        }));
      }
    }

    if (schedule.type === 'interval' && schedule.intervalHours) {
      // For interval schedules, schedule the next occurrence
      const intervalSeconds = schedule.intervalHours * 3600;

      pending.push(Notifications.scheduleNotificationAsync({
        content: {
          title: `🧸 ${medicine.name}`,
          body,
          data: {
            medicineId: medicine.medicineId,
            scheduleId: schedule.scheduleId,
            scheduledTime: new Date(now.getTime() + intervalSeconds * 1000).toISOString(),
            type: NOTIFICATION_TYPES.DOSE,
          },
          sound: 'default',
          categoryIdentifier: NOTIFICATION_CATEGORY,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: intervalSeconds,
          repeats: true,
        },
      }));
    }
  }

  await Promise.all(pending);
}

/**
 * Schedule a snooze notification (SNOOZE_SECONDS from now).
 */
export async function scheduleSnooze(medicine: Medicine, scheduleId: string) {
  if (Platform.OS === 'web') return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `🧸 Reminder: ${medicine.name}`,
      body: `Snoozed reminder — take ${formatDoseQuantity(medicine)}`,
      data: {
        medicineId: medicine.medicineId,
        scheduleId,
        scheduledTime: new Date(Date.now() + SNOOZE_SECONDS * 1000).toISOString(),
        type: NOTIFICATION_TYPES.SNOOZE,
      },
      sound: 'default',
      categoryIdentifier: NOTIFICATION_CATEGORY,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: SNOOZE_SECONDS,
      repeats: false,
    },
  });
}

/**
 * Resolve the scheduledTime to record for a notification response.
 *
 * Repeating triggers (DAILY / repeating TIME_INTERVAL) re-deliver the payload
 * that was frozen at scheduling time, so if the app hasn't rescheduled for a
 * few days the embedded scheduledTime is days stale. Fresh payloads (within
 * the last 24h, which includes one-shot snoozes) are kept unchanged; stale
 * ones are recomputed to the most recent scheduled occurrence <= now for the
 * schedule, falling back to now.
 */
function resolveScheduledTime(payloadTime: string | undefined, scheduleId: string): string {
  const now = new Date();
  if (!payloadTime) return now.toISOString();
  const payloadMs = new Date(payloadTime).getTime();
  if (isNaN(payloadMs)) return now.toISOString();
  if (now.getTime() - payloadMs <= 86400000) return payloadTime;

  const schedule = useStore.getState().schedules.find(s => s.scheduleId === scheduleId);

  if (schedule?.type === 'absolute') {
    // DAILY payloads carry the schedule's hour:minute — the most recent
    // occurrence is that time today, or yesterday if it hasn't happened yet.
    const stale = new Date(payloadMs);
    const occurrence = new Date(now);
    occurrence.setHours(stale.getHours(), stale.getMinutes(), 0, 0);
    if (occurrence > now) occurrence.setDate(occurrence.getDate() - 1);
    return occurrence.toISOString();
  }

  if (schedule?.type === 'interval' && schedule.intervalHours) {
    // Most recent interval boundary <= now, anchored to schedule.createdAt
    // (same modulo semantics as computeUpcomingDoses and the server checker).
    const intervalMs = Number(schedule.intervalHours) * 3600000;
    const createdAt = new Date(schedule.createdAt).getTime();
    if (intervalMs > 0 && !isNaN(createdAt) && now.getTime() >= createdAt) {
      const elapsedIntervals = Math.floor((now.getTime() - createdAt) / intervalMs);
      return new Date(createdAt + elapsedIntervals * intervalMs).toISOString();
    }
  }

  return now.toISOString();
}

/**
 * Handle the user acting on a dose notification (tap or action button).
 * Records the dose event with the scheduledTime carried in the payload.
 */
export async function handleNotificationResponse(response: Notifications.NotificationResponse) {
  const { actionIdentifier } = response;
  const data = response.notification.request.content.data as {
    medicineId?: string;
    scheduleId?: string;
    scheduledTime?: string;
  };

  if (!data.medicineId || !data.scheduleId) return;
  const scheduledTime = resolveScheduledTime(data.scheduledTime, data.scheduleId);
  const { medicines, recordDoseAction } = useStore.getState();

  try {
    if (actionIdentifier === NOTIFICATION_ACTIONS.TAKEN || actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
      await recordDoseAction({
        medicineId: data.medicineId,
        scheduleId: data.scheduleId,
        scheduledTime,
        action: 'taken',
      });
    } else if (actionIdentifier === NOTIFICATION_ACTIONS.SNOOZE) {
      const medicine = medicines.find((m: Medicine) => m.medicineId === data.medicineId);
      if (medicine) {
        await scheduleSnooze(medicine, data.scheduleId);
      }
      await recordDoseAction({
        medicineId: data.medicineId,
        scheduleId: data.scheduleId,
        scheduledTime,
        action: 'snoozed',
      });
    } else if (actionIdentifier === NOTIFICATION_ACTIONS.DISMISS) {
      await recordDoseAction({
        medicineId: data.medicineId,
        scheduleId: data.scheduleId,
        scheduledTime,
        action: 'dismissed',
      });
    }
  } catch (e) {
    appendLog('error', 'notifResponse', `Failed to handle ${actionIdentifier}: ${(e as Error).message}`);
  }
}
