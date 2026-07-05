import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { Schedule, Medicine } from '../types';
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
    new Notification(title, { body, icon: '🧸', tag: data?.scheduleId });
    appendLog('info', 'webNotif', `Sent: "${title}" — ${body}`);
  } catch (e) {
    appendLog('error', 'webNotif', `Failed to send: ${e}`);
  }
}

// Track active web timers so we can cancel them
const webTimers: ReturnType<typeof setTimeout>[] = [];

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
    if (schedule.status !== 'active') continue;
    const medicine = medicines.find(m => m.medicineId === schedule.medicineId);
    if (!medicine || medicine.status !== 'active') continue;

    const qty = medicine.quantity !== 1 ? `${medicine.quantity} x ` : '';
    const body = `Take ${qty}${medicine.strength} (${medicine.form})${medicine.instructions ? ` — ${medicine.instructions}` : ''}`;

    if (schedule.type === 'absolute' && schedule.times) {
      for (const time of schedule.times) {
        const parts = time.split(':');
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1] || '0', 10);
        if (isNaN(h) || isNaN(m)) continue;

        const target = new Date(now);
        target.setHours(h, m, 0, 0);
        if (target <= now) target.setDate(target.getDate() + 1);

        const delayMs = target.getTime() - now.getTime();
        // Only schedule within next 24 hours
        if (delayMs > 0 && delayMs <= 86400000) {
          const delayMins = Math.round(delayMs / 60000);
          appendLog('info', 'webSched', `Timer: ${medicine.name} at ${time} (in ${delayMins}m)`);
          const timer = setTimeout(() => {
            sendWebNotification(`🧸 ${medicine.name}`, body, {
              medicineId: medicine.medicineId,
              scheduleId: schedule.scheduleId,
            });
          }, delayMs);
          webTimers.push(timer);
          scheduled++;
        }
      }
    }

    if (schedule.type === 'interval' && schedule.intervalHours) {
      const intervalMs = schedule.intervalHours * 3600000;
      appendLog('info', 'webSched', `Timer: ${medicine.name} every ${schedule.intervalHours}h`);
      const timer = setTimeout(function fire() {
        sendWebNotification(`🧸 ${medicine.name}`, body, {
          medicineId: medicine.medicineId,
          scheduleId: schedule.scheduleId,
        });
        const next = setTimeout(fire, intervalMs);
        webTimers.push(next);
      }, intervalMs);
      webTimers.push(timer);
      scheduled++;
    }
  }

  appendLog('info', 'webSched', `Scheduled ${scheduled} web notification timer(s) for ${medicines.length} meds / ${schedules.length} schedules`);
}

// Define notification actions for dose reminders
export async function setupNotificationCategories() {
  if (Platform.OS === 'web') return;
  await Notifications.setNotificationCategoryAsync('DOSE_REMINDER', [
    {
      identifier: 'TAKEN',
      buttonTitle: 'Taken',
      options: { opensAppToForeground: false },
    },
    {
      identifier: 'SNOOZE',
      buttonTitle: 'Snooze 5 min',
      options: { opensAppToForeground: false },
    },
    {
      identifier: 'DISMISS',
      buttonTitle: 'Dismiss',
      options: { opensAppToForeground: false },
    },
  ]);
}

export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission not granted');
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

  // projectId is required in SDK 56+; set via app.json or pass directly
  const token = await Notifications.getExpoPushTokenAsync({
    projectId: undefined, // Will use Constants.expoConfig.extra.eas.projectId
  });
  return token.data;
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
  for (const notification of existing) {
    const data = notification.content.data as { type?: string } | null;
    if (data?.type === 'snooze_reminder') continue; // keep snooze notifications
    await Notifications.cancelScheduledNotificationAsync(notification.identifier);
  }

  for (const schedule of schedules) {
    if (schedule.status !== 'active') continue;

    const medicine = medicines.find(m => m.medicineId === schedule.medicineId);
    if (!medicine || medicine.status !== 'active') continue;

    const qty = medicine.quantity !== 1 ? `${medicine.quantity} x ` : '';
    const body = `Take ${qty}${medicine.strength} (${medicine.form})${medicine.instructions ? ` — ${medicine.instructions}` : ''}`;

    if (schedule.type === 'absolute' && schedule.times) {
      for (const time of schedule.times) {
        const parts = time.split(':');
        const hour = parseInt(parts[0], 10);
        const minute = parseInt(parts[1] || '0', 10);
        if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) continue;

        await Notifications.scheduleNotificationAsync({
          content: {
            title: `🧸 ${medicine.name}`,
            body,
            data: {
              medicineId: medicine.medicineId,
              scheduleId: schedule.scheduleId,
              type: 'dose_reminder',
            },
            sound: 'default',
            categoryIdentifier: 'DOSE_REMINDER',
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour,
            minute,
          },
        });
      }
    }

    if (schedule.type === 'interval' && schedule.intervalHours) {
      // For interval schedules, schedule the next occurrence
      const intervalSeconds = schedule.intervalHours * 3600;

      await Notifications.scheduleNotificationAsync({
        content: {
          title: `🧸 ${medicine.name}`,
          body,
          data: {
            medicineId: medicine.medicineId,
            scheduleId: schedule.scheduleId,
            type: 'dose_reminder',
          },
          sound: 'default',
          categoryIdentifier: 'DOSE_REMINDER',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: intervalSeconds,
          repeats: true,
        },
      });
    }
  }
}

/**
 * Schedule a snooze notification (5 minutes from now).
 */
export async function scheduleSnooze(medicine: Medicine, scheduleId: string) {
  if (Platform.OS === 'web') return;
  const qty = medicine.quantity !== 1 ? `${medicine.quantity} x ` : '';

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `🧸 Reminder: ${medicine.name}`,
      body: `Snoozed reminder — take ${qty}${medicine.strength} (${medicine.form})`,
      data: {
        medicineId: medicine.medicineId,
        scheduleId,
        type: 'snooze_reminder',
      },
      sound: 'default',
      categoryIdentifier: 'DOSE_REMINDER',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 300, // 5 minutes
      repeats: false,
    },
  });
}
