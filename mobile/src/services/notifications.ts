import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { Schedule, Medicine } from '../types';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Define notification actions for dose reminders
export async function setupNotificationCategories() {
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
  // Cancel all existing scheduled notifications
  await Notifications.cancelAllScheduledNotificationsAsync();

  for (const schedule of schedules) {
    if (schedule.status !== 'active') continue;

    const medicine = medicines.find(m => m.medicineId === schedule.medicineId);
    if (!medicine || medicine.status !== 'active') continue;

    const qty = medicine.quantity !== 1 ? `${medicine.quantity} x ` : '';
    const body = `Take ${qty}${medicine.strength} (${medicine.form})${medicine.instructions ? ` — ${medicine.instructions}` : ''}`;

    if (schedule.type === 'absolute' && schedule.times) {
      for (const time of schedule.times) {
        const [hour, minute] = time.split(':').map(Number);

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
  const qty = medicine.quantity !== 1 ? `${medicine.quantity} x ` : '';

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `🧸 Reminder: ${medicine.name}`,
      body: `Snoozed reminder — take ${qty}${medicine.strength} (${medicine.form})`,
      data: {
        medicineId: medicine.medicineId,
        scheduleId,
        type: 'dose_reminder',
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
