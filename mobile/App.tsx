import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { AppNavigator } from './src/navigation';
import { useStore } from './src/store';
import {
  registerForPushNotifications,
  setupNotificationCategories,
  scheduleLocalNotifications,
  scheduleSnooze,
} from './src/services/notifications';
import * as api from './src/services/api';

const DEVICE_ID_KEY = '@jer_bear_device_id';

// Generate or retrieve a stable device ID persisted across app launches
async function getOrCreateDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = Crypto.randomUUID();
  await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

export default function App() {
  const { setDeviceId, loadAll, medicines, schedules, recordDoseAction } = useStore();

  useEffect(() => {
    async function init() {
      const deviceId = await getOrCreateDeviceId();
      setDeviceId(deviceId);

      await setupNotificationCategories();
      const pushToken = await registerForPushNotifications();

      try {
        await api.registerDevice({
          deviceId,
          pushToken: pushToken ?? undefined,
          platform: Platform.OS as 'ios' | 'android',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
      } catch (e) {
        console.log('Device registration failed (offline?):', e);
      }

      try {
        await loadAll();
      } catch (e) {
        console.log('Initial load failed (offline?):', e);
      }
    }

    init();

    // Listen for notification responses (user tapped an action)
    const responseSub = Notifications.addNotificationResponseReceivedListener(
      async (response) => {
        const { actionIdentifier } = response;
        const data = response.notification.request.content.data as {
          medicineId?: string;
          scheduleId?: string;
        };

        if (!data.medicineId || !data.scheduleId) return;

        if (actionIdentifier === 'TAKEN' || actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
          await recordDoseAction({
            medicineId: data.medicineId,
            scheduleId: data.scheduleId,
            scheduledTime: new Date().toISOString(),
            action: 'taken',
          });
        } else if (actionIdentifier === 'SNOOZE') {
          const medicine = useStore.getState().medicines.find(
            (m: any) => m.medicineId === data.medicineId,
          );
          if (medicine) {
            await scheduleSnooze(medicine, data.scheduleId);
          }
          await recordDoseAction({
            medicineId: data.medicineId,
            scheduleId: data.scheduleId,
            scheduledTime: new Date().toISOString(),
            action: 'snoozed',
          });
        } else if (actionIdentifier === 'DISMISS') {
          await recordDoseAction({
            medicineId: data.medicineId,
            scheduleId: data.scheduleId,
            scheduledTime: new Date().toISOString(),
            action: 'dismissed',
          });
        }
      },
    );

    return () => {
      responseSub.remove();
    };
  }, []);

  // Re-schedule local notifications whenever medicines or schedules change
  useEffect(() => {
    if (medicines.length > 0 || schedules.length > 0) {
      scheduleLocalNotifications(medicines, schedules);
    }
  }, [medicines, schedules]);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AppNavigator />
    </SafeAreaProvider>
  );
}
