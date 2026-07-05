import React, { useEffect, useMemo } from 'react';
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
  requestWebNotificationPermission,
  scheduleWebNotifications,
  handleNotificationResponse,
} from './src/services/notifications';
import * as api from './src/services/api';
import { DEVICE_ID_STORAGE_KEY } from './src/constants';
import { appendLog } from './src/services/logger';

// Generate or retrieve a stable device ID persisted across app launches
async function getOrCreateDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existing) return existing;
  const id = Crypto.randomUUID();
  await AsyncStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
  return id;
}

export default function App() {
  // Scoped selectors — subscribing to the whole store would re-render the
  // entire navigator tree on every store write
  const medicines = useStore(s => s.medicines);
  const schedules = useStore(s => s.schedules);

  useEffect(() => {
    async function init() {
      const { setDeviceId, loadAll } = useStore.getState();
      appendLog('info', 'app', `Init starting — platform: ${Platform.OS}`);
      const deviceId = await getOrCreateDeviceId();
      setDeviceId(deviceId);
      // Never log the raw device ID — it is the de-facto credential

      await setupNotificationCategories();

      // Browsers suppress gesture-less permission prompts, so only record an
      // already-granted state here; HomeScreen shows an "Enable reminders"
      // banner that triggers the prompt on tap.
      if (
        Platform.OS === 'web' &&
        typeof window !== 'undefined' &&
        'Notification' in window &&
        window.Notification.permission === 'granted'
      ) {
        await requestWebNotificationPermission();
      }

      // A push-registration failure must not skip device registration or the
      // initial data load
      let pushToken: string | null = null;
      try {
        pushToken = await registerForPushNotifications();
      } catch (e) {
        appendLog('error', 'app', `Push registration failed: ${(e as Error).message}`);
      }
      appendLog('info', 'app', `Push token: ${pushToken ? 'registered' : 'none (web or simulator)'}`);

      try {
        await api.registerDevice({
          deviceId,
          pushToken: pushToken ?? undefined,
          platform: Platform.OS as 'ios' | 'android',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
      } catch (e) {
        appendLog('warn', 'app', `Device registration failed (offline?): ${(e as Error).message}`);
      }

      try {
        await loadAll();
      } catch (e) {
        appendLog('warn', 'app', `Initial load failed (offline?): ${(e as Error).message}`);
      }
    }

    init();

    // Listen for notification responses (user tapped an action) — the only
    // expo-notifications listener, not available on web
    let responseSub: Notifications.EventSubscription | undefined;
    if (Platform.OS !== 'web') {
      responseSub = Notifications.addNotificationResponseReceivedListener(
        handleNotificationResponse,
      );
    }

    return () => {
      responseSub?.remove();
    };
  }, []);

  // Fingerprint of everything notification scheduling depends on — array
  // identity changes on every pull-to-refresh, and rescheduling on identity
  // alone would cancel/restart all timers and indefinitely postpone interval
  // notifications
  const scheduleFingerprint = useMemo(
    () =>
      JSON.stringify([
        schedules.map(s => [s.scheduleId, s.status, s.times, s.intervalHours, s.daysOfWeek]),
        medicines.map(m => [m.medicineId, m.status, m.name, m.strength, m.quantity, m.form, m.instructions]),
      ]),
    [medicines, schedules],
  );

  // Re-schedule notifications only when the schedule-relevant data changes
  useEffect(() => {
    const { medicines: meds, schedules: scheds } = useStore.getState();
    if (meds.length > 0 || scheds.length > 0) {
      appendLog('info', 'app', `Schedule set changed: ${meds.length} meds, ${scheds.length} schedules — rescheduling`);
      scheduleLocalNotifications(meds, scheds);
      scheduleWebNotifications(meds, scheds);
    }
  }, [scheduleFingerprint]);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AppNavigator />
    </SafeAreaProvider>
  );
}
