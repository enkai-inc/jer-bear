/**
 * Tests for the notifications service: snooze preservation (#4 regression),
 * scheduling math, web timers, and notification-response handling.
 */

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationCategoryAsync: jest.fn().mockResolvedValue(undefined),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notif-id'),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  AndroidImportance: { MAX: 5 },
  SchedulableTriggerInputTypes: { DAILY: 'daily', TIME_INTERVAL: 'timeInterval' },
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
}));

jest.mock('expo-device', () => ({ isDevice: true }));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: '' } } } },
}));

jest.mock('../services/api', () => ({
  setDeviceId: jest.fn(),
  fetchMedicines: jest.fn(),
  fetchSchedules: jest.fn(),
  fetchDoseEvents: jest.fn(),
  fetchDevice: jest.fn(),
  createMedicine: jest.fn(),
  updateMedicine: jest.fn(),
  deleteMedicine: jest.fn(),
  createSchedule: jest.fn(),
  updateSchedule: jest.fn(),
  deleteSchedule: jest.fn(),
  recordDose: jest.fn(),
  generateCaregiverCode: jest.fn(),
}));

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import {
  scheduleLocalNotifications,
  scheduleSnooze,
  scheduleWebNotifications,
  clearWebTimers,
  requestWebNotificationPermission,
  registerForPushNotifications,
  handleNotificationResponse,
} from '../services/notifications';
import { useStore } from '../store';
import * as api from '../services/api';
import { SNOOZE_SECONDS, NOTIFICATION_TYPES, NOTIFICATION_CATEGORY } from '../constants';
import { Medicine, Schedule } from '../types';

const mockNotifications = Notifications as jest.Mocked<typeof Notifications>;
const mockApi = api as jest.Mocked<typeof api>;
const originalPlatform = Platform.OS;

function makeMedicine(overrides: Partial<Medicine> = {}): Medicine {
  return {
    deviceId: 'd1', medicineId: 'm1', name: 'A', strength: '5mg', quantity: 2,
    form: 'tablet', status: 'active', createdAt: '', updatedAt: '', ...overrides,
  };
}

function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    deviceId: 'd1', scheduleId: 's1', medicineId: 'm1', type: 'absolute',
    times: ['09:00'], status: 'active', createdAt: '', updatedAt: '', ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNotifications.getAllScheduledNotificationsAsync.mockResolvedValue([]);
  (Platform as { OS: string }).OS = originalPlatform;
});

afterEach(() => {
  (Platform as { OS: string }).OS = originalPlatform;
  jest.useRealTimers();
});

describe('scheduleLocalNotifications', () => {
  it('cancels dose reminders but preserves snooze reminders (#4 regression)', async () => {
    mockNotifications.getAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: 'dose-1', content: { data: { type: NOTIFICATION_TYPES.DOSE } } },
      { identifier: 'snooze-1', content: { data: { type: NOTIFICATION_TYPES.SNOOZE } } },
      { identifier: 'dose-2', content: { data: { type: NOTIFICATION_TYPES.DOSE } } },
    ] as never);

    await scheduleLocalNotifications([], []);

    const cancelled = mockNotifications.cancelScheduledNotificationAsync.mock.calls.map(c => c[0]);
    expect(cancelled).toEqual(expect.arrayContaining(['dose-1', 'dose-2']));
    expect(cancelled).not.toContain('snooze-1');
  });

  it('schedules DAILY triggers with the parsed hour and minute', async () => {
    await scheduleLocalNotifications(
      [makeMedicine()],
      [makeSchedule({ times: ['09:00', '21:30'] })],
    );

    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    const triggers = mockNotifications.scheduleNotificationAsync.mock.calls.map(c => c[0].trigger);
    expect(triggers).toContainEqual({ type: 'daily', hour: 9, minute: 0 });
    expect(triggers).toContainEqual({ type: 'daily', hour: 21, minute: 30 });

    const content = mockNotifications.scheduleNotificationAsync.mock.calls[0][0].content;
    expect(content.categoryIdentifier).toBe(NOTIFICATION_CATEGORY);
    expect(content.body).toBe('Take 2 x 5mg (tablet)');
    expect((content.data as { type: string }).type).toBe(NOTIFICATION_TYPES.DOSE);
    expect((content.data as { scheduledTime?: string }).scheduledTime).toBeDefined();
  });

  it('skips invalid times', async () => {
    await scheduleLocalNotifications(
      [makeMedicine()],
      [makeSchedule({ times: ['25:00', '9:60', 'garbage'] })],
    );

    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('skips paused schedules and paused medicines', async () => {
    await scheduleLocalNotifications(
      [makeMedicine({ status: 'paused' })],
      [makeSchedule()],
    );
    await scheduleLocalNotifications(
      [makeMedicine()],
      [makeSchedule({ status: 'paused' })],
    );

    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('schedules a repeating TIME_INTERVAL trigger for interval schedules', async () => {
    await scheduleLocalNotifications(
      [makeMedicine()],
      [makeSchedule({ type: 'interval', times: undefined, intervalHours: 6 })],
    );

    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(mockNotifications.scheduleNotificationAsync.mock.calls[0][0].trigger).toEqual({
      type: 'timeInterval',
      seconds: 6 * 3600,
      repeats: true,
    });
  });
});

describe('scheduleSnooze', () => {
  it('schedules a one-shot reminder SNOOZE_SECONDS from now', async () => {
    await scheduleSnooze(makeMedicine(), 's1');

    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const arg = mockNotifications.scheduleNotificationAsync.mock.calls[0][0];
    expect(arg.trigger).toEqual({
      type: 'timeInterval',
      seconds: SNOOZE_SECONDS,
      repeats: false,
    });
    expect((arg.content.data as { type: string }).type).toBe(NOTIFICATION_TYPES.SNOOZE);
  });
});

describe('registerForPushNotifications', () => {
  it('returns null without calling getExpoPushTokenAsync when no projectId is configured', async () => {
    const token = await registerForPushNotifications();

    expect(token).toBeNull();
    expect(mockNotifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('returns null when getExpoPushTokenAsync throws', async () => {
    (Constants.expoConfig!.extra as { eas: { projectId: string } }).eas.projectId = 'proj-123';
    mockNotifications.getExpoPushTokenAsync.mockRejectedValue(new Error('no push service'));

    const token = await registerForPushNotifications();

    expect(token).toBeNull();
    expect(mockNotifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'proj-123' });
    (Constants.expoConfig!.extra as { eas: { projectId: string } }).eas.projectId = '';
  });

  it('returns the token on success', async () => {
    (Constants.expoConfig!.extra as { eas: { projectId: string } }).eas.projectId = 'proj-123';
    mockNotifications.getExpoPushTokenAsync.mockResolvedValue({ type: 'expo', data: 'ExponentPushToken[abc]' });

    const token = await registerForPushNotifications();

    expect(token).toBe('ExponentPushToken[abc]');
    (Constants.expoConfig!.extra as { eas: { projectId: string } }).eas.projectId = '';
  });
});

describe('web notifications', () => {
  let NotificationMock: jest.Mock & { permission?: string };

  beforeEach(async () => {
    jest.useFakeTimers({ now: new Date(2026, 0, 15, 10, 0, 0) });
    (Platform as { OS: string }).OS = 'web';
    NotificationMock = jest.fn() as jest.Mock & { permission?: string };
    NotificationMock.permission = 'granted';
    (globalThis as Record<string, unknown>).Notification = NotificationMock;
    (globalThis as Record<string, unknown>).window = globalThis;
    await requestWebNotificationPermission(); // arms webPermissionGranted
    NotificationMock.mockClear();
  });

  afterEach(() => {
    clearWebTimers();
    delete (globalThis as Record<string, unknown>).Notification;
    delete (globalThis as Record<string, unknown>).window;
  });

  it('rolls past absolute times to tomorrow', () => {
    // now 10:00 — 09:00 already passed, so the timer targets tomorrow 09:00 (23h)
    scheduleWebNotifications([makeMedicine()], [makeSchedule({ times: ['09:00'] })]);

    jest.advanceTimersByTime(23 * 3600000 - 1000);
    expect(NotificationMock).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1000);
    expect(NotificationMock).toHaveBeenCalledTimes(1);
    // icon must be an image URL, not an emoji — we pass none
    expect(NotificationMock.mock.calls[0][1]).not.toHaveProperty('icon');
  });

  it('re-arms absolute timers for the next day after firing', () => {
    // now 10:00 — fires tomorrow 09:00, then must self-re-arm daily (App.tsx
    // no longer reschedules on every refresh thanks to fingerprint gating)
    scheduleWebNotifications([makeMedicine()], [makeSchedule({ times: ['09:00'] })]);

    jest.advanceTimersByTime(23 * 3600000);
    expect(NotificationMock).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(24 * 3600000);
    expect(NotificationMock).toHaveBeenCalledTimes(2);

    // clearWebTimers cancels the re-armed timer too
    clearWebTimers();
    jest.advanceTimersByTime(48 * 3600000);
    expect(NotificationMock).toHaveBeenCalledTimes(2);
  });

  it('anchors interval timers to schedule.createdAt', () => {
    // Created 08:00, every 6h, now 10:00 -> first fire at 14:00 (in 4h), not 16:00
    const schedule = makeSchedule({
      type: 'interval',
      times: undefined,
      intervalHours: 6,
      createdAt: new Date(2026, 0, 15, 8, 0, 0).toISOString(),
    });
    scheduleWebNotifications([makeMedicine()], [schedule]);

    jest.advanceTimersByTime(4 * 3600000 - 1000);
    expect(NotificationMock).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1000);
    expect(NotificationMock).toHaveBeenCalledTimes(1);

    // Re-arms for the next interval
    jest.advanceTimersByTime(6 * 3600000);
    expect(NotificationMock).toHaveBeenCalledTimes(2);
  });

  it('clearWebTimers cancels re-armed interval timers', () => {
    const schedule = makeSchedule({
      type: 'interval',
      times: undefined,
      intervalHours: 6,
      createdAt: new Date(2026, 0, 15, 8, 0, 0).toISOString(),
    });
    scheduleWebNotifications([makeMedicine()], [schedule]);

    jest.advanceTimersByTime(4 * 3600000); // first fire + re-arm
    expect(NotificationMock).toHaveBeenCalledTimes(1);

    clearWebTimers();
    jest.advanceTimersByTime(24 * 3600000);
    expect(NotificationMock).toHaveBeenCalledTimes(1); // no further fires
  });
});

describe('handleNotificationResponse', () => {
  const scheduledTime = '2026-01-15T14:00:00.000Z';

  function makeResponse(actionIdentifier: string, time: string = scheduledTime) {
    return {
      actionIdentifier,
      notification: {
        request: {
          content: {
            data: { medicineId: 'm1', scheduleId: 's1', scheduledTime: time, type: NOTIFICATION_TYPES.DOSE },
          },
        },
      },
    } as unknown as Notifications.NotificationResponse;
  }

  beforeEach(() => {
    // Pin "now" 1h after the payload scheduledTime so it is a fresh payload
    jest.useFakeTimers({ now: new Date('2026-01-15T15:00:00.000Z') });
    useStore.setState({ medicines: [makeMedicine()], schedules: [], doseEvents: [], error: null });
    mockApi.recordDose.mockResolvedValue({
      eventId: 'e1', deviceId: 'd1', medicineId: 'm1', scheduleId: 's1',
      scheduledTime, timestamp: '', action: 'taken',
    });
  });

  it('records "taken" with the payload scheduledTime for the TAKEN action', async () => {
    await handleNotificationResponse(makeResponse('TAKEN'));

    expect(mockApi.recordDose).toHaveBeenCalledWith({
      medicineId: 'm1', scheduleId: 's1', scheduledTime, action: 'taken',
    });
  });

  it('records "taken" for a plain tap (default action)', async () => {
    await handleNotificationResponse(makeResponse(Notifications.DEFAULT_ACTION_IDENTIFIER));

    expect(mockApi.recordDose).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'taken', scheduledTime }),
    );
  });

  it('schedules a snooze and records "snoozed" for the SNOOZE action', async () => {
    await handleNotificationResponse(makeResponse('SNOOZE'));

    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect((mockNotifications.scheduleNotificationAsync.mock.calls[0][0].content.data as { type: string }).type)
      .toBe(NOTIFICATION_TYPES.SNOOZE);
    expect(mockApi.recordDose).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'snoozed', scheduledTime }),
    );
  });

  it('records "dismissed" for the DISMISS action', async () => {
    await handleNotificationResponse(makeResponse('DISMISS'));

    expect(mockApi.recordDose).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'dismissed', scheduledTime }),
    );
  });

  it('ignores payloads without medicineId/scheduleId', async () => {
    const response = {
      actionIdentifier: 'TAKEN',
      notification: { request: { content: { data: {} } } },
    } as unknown as Notifications.NotificationResponse;

    await handleNotificationResponse(response);

    expect(mockApi.recordDose).not.toHaveBeenCalled();
  });

  it('does not throw when recording fails', async () => {
    mockApi.recordDose.mockRejectedValue(new Error('offline'));

    await expect(handleNotificationResponse(makeResponse('TAKEN'))).resolves.toBeUndefined();
  });

  // Repeating triggers re-deliver the payload frozen at scheduling time, so
  // after >24h without rescheduling the embedded scheduledTime is stale and
  // must be recomputed to the most recent scheduled occurrence.
  describe('stale repeating payloads', () => {
    it('recomputes a days-stale absolute payload to that time today', async () => {
      jest.setSystemTime(new Date(2026, 0, 18, 10, 0, 0)); // Jan 18, 10:00 local
      useStore.setState({ schedules: [makeSchedule({ times: ['09:00'] })] });

      await handleNotificationResponse(
        makeResponse('TAKEN', new Date(2026, 0, 15, 9, 0, 0).toISOString()),
      );

      expect(mockApi.recordDose).toHaveBeenCalledWith(
        expect.objectContaining({ scheduledTime: new Date(2026, 0, 18, 9, 0, 0).toISOString() }),
      );
    });

    it('uses yesterday when the stale absolute time has not happened yet today', async () => {
      jest.setSystemTime(new Date(2026, 0, 18, 10, 0, 0));
      useStore.setState({ schedules: [makeSchedule({ times: ['21:00'] })] });

      await handleNotificationResponse(
        makeResponse('TAKEN', new Date(2026, 0, 15, 21, 0, 0).toISOString()),
      );

      expect(mockApi.recordDose).toHaveBeenCalledWith(
        expect.objectContaining({ scheduledTime: new Date(2026, 0, 17, 21, 0, 0).toISOString() }),
      );
    });

    it('recomputes a stale interval payload to the latest createdAt-anchored boundary', async () => {
      jest.setSystemTime(new Date(2026, 0, 18, 10, 0, 0));
      useStore.setState({
        schedules: [makeSchedule({
          type: 'interval',
          times: undefined,
          intervalHours: 6,
          createdAt: new Date(2026, 0, 15, 8, 0, 0).toISOString(),
        })],
      });

      await handleNotificationResponse(
        makeResponse('TAKEN', new Date(2026, 0, 15, 14, 0, 0).toISOString()),
      );

      // Boundaries every 6h from Jan 15 08:00 — the latest <= Jan 18 10:00 is Jan 18 08:00
      expect(mockApi.recordDose).toHaveBeenCalledWith(
        expect.objectContaining({ scheduledTime: new Date(2026, 0, 18, 8, 0, 0).toISOString() }),
      );
    });

    it('falls back to now when the schedule for a stale payload is gone', async () => {
      const now = new Date(2026, 0, 18, 10, 0, 0);
      jest.setSystemTime(now);
      useStore.setState({ schedules: [] });

      await handleNotificationResponse(
        makeResponse('TAKEN', new Date(2026, 0, 10, 9, 0, 0).toISOString()),
      );

      expect(mockApi.recordDose).toHaveBeenCalledWith(
        expect.objectContaining({ scheduledTime: now.toISOString() }),
      );
    });
  });
});
