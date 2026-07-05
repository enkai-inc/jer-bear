// Table names must be set before the db / notification-checker modules load
// (both read process.env at module scope).
process.env.MEDICINES_TABLE = 'medicines-table';
process.env.SCHEDULES_TABLE = 'schedules-table';
process.env.DOSE_EVENTS_TABLE = 'dose-events-table';
process.env.DEVICES_TABLE = 'devices-table';

import { DynamoDBDocumentClient, GetCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { handler, isScheduleDue, getLocalTimeParts, hasDoseEventInWindow } from '../lambda/src/notification-checker';
import { Schedule } from '../lambda/src/types';

const ddbMock = mockClient(DynamoDBDocumentClient);

const DEVICE_ID = '123e4567-e89b-42d3-a456-426614174000';
const NY = 'America/New_York';

function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    deviceId: DEVICE_ID,
    scheduleId: 'sched-001',
    medicineId: 'med-001',
    type: 'absolute',
    times: ['09:00'],
    intervalHours: null,
    daysOfWeek: [],
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  ddbMock.reset();
});

// ─── getLocalTimeParts ────────────────────────────────────────────────────────

describe('getLocalTimeParts', () => {
  it('converts a UTC instant to device-local hour/minute/day', () => {
    // 2026-01-06T02:30Z is Mon Jan 5, 21:30 in New York (EST, UTC-5)
    const parts = getLocalTimeParts(new Date('2026-01-06T02:30:00Z'), NY);
    expect(parts).toEqual({ hour: 21, minute: 30, day: 1 });
  });

  it('returns UTC parts for the UTC timezone', () => {
    const parts = getLocalTimeParts(new Date('2026-01-06T02:30:00Z'), 'UTC');
    expect(parts).toEqual({ hour: 2, minute: 30, day: 2 });
  });
});

// ─── isScheduleDue: absolute schedules ────────────────────────────────────────

describe('isScheduleDue (absolute)', () => {
  it('is due only at the exact local hour:minute in the device timezone', () => {
    const schedule = makeSchedule({ times: ['21:00'] });
    // Mon Jan 5, 21:00 EST == 2026-01-06T02:00Z
    expect(isScheduleDue(schedule, new Date('2026-01-06T02:00:00Z'), NY)).toBe(true);
    expect(isScheduleDue(schedule, new Date('2026-01-06T02:01:00Z'), NY)).toBe(false);
    // Same wall-clock instant is 02:00 in UTC — not 21:00
    expect(isScheduleDue(schedule, new Date('2026-01-06T02:00:00Z'), 'UTC')).toBe(false);
  });

  it('applies the daysOfWeek filter in local time, not UTC', () => {
    // 2026-01-06T02:00Z is UTC Tuesday but still Monday in New York
    const now = new Date('2026-01-06T02:00:00Z');
    expect(isScheduleDue(makeSchedule({ times: ['21:00'], daysOfWeek: [1] }), now, NY)).toBe(true);
    expect(isScheduleDue(makeSchedule({ times: ['21:00'], daysOfWeek: [2] }), now, NY)).toBe(false);
  });

  it('matches any one of multiple times', () => {
    const schedule = makeSchedule({ times: ['08:00', '14:00'] });
    // 14:00 EST == 19:00Z
    expect(isScheduleDue(schedule, new Date('2026-01-05T19:00:00Z'), NY)).toBe(true);
    expect(isScheduleDue(schedule, new Date('2026-01-05T20:00:00Z'), NY)).toBe(false);
  });

  it('is never due without times', () => {
    const schedule = makeSchedule({ times: undefined });
    expect(isScheduleDue(schedule, new Date('2026-01-05T14:00:00Z'), NY)).toBe(false);
  });

  it('fires exactly once on the spring-forward DST day', () => {
    // US DST starts 2026-03-08 (02:00 EST -> 03:00 EDT). A 09:00 schedule
    // must be due for exactly one minute of the UTC day.
    const schedule = makeSchedule({ times: ['09:00'] });
    let dueCount = 0;
    const dayStart = new Date('2026-03-08T00:00:00Z').getTime();
    for (let m = 0; m < 24 * 60; m++) {
      if (isScheduleDue(schedule, new Date(dayStart + m * 60000), NY)) dueCount++;
    }
    expect(dueCount).toBe(1);
    // 09:00 EDT (UTC-4) == 13:00Z, not the pre-DST 14:00Z
    expect(isScheduleDue(schedule, new Date('2026-03-08T13:00:00Z'), NY)).toBe(true);
    expect(isScheduleDue(schedule, new Date('2026-03-08T14:00:00Z'), NY)).toBe(false);
  });
});

// ─── isScheduleDue: interval schedules ────────────────────────────────────────

describe('isScheduleDue (interval)', () => {
  const schedule = makeSchedule({
    type: 'interval',
    times: undefined,
    intervalHours: 6,
    createdAt: '2026-01-05T08:00:00.000Z',
  });

  it('is due within the 1-minute window of a createdAt-anchored boundary', () => {
    // Boundaries at 08:00, 14:00, 20:00, ...
    expect(isScheduleDue(schedule, new Date('2026-01-05T14:00:30Z'), NY)).toBe(true);
    expect(isScheduleDue(schedule, new Date('2026-01-05T13:59:30Z'), NY)).toBe(true);
    expect(isScheduleDue(schedule, new Date('2026-01-05T20:00:00Z'), NY)).toBe(true);
  });

  it('is not due mid-interval', () => {
    expect(isScheduleDue(schedule, new Date('2026-01-05T17:00:00Z'), NY)).toBe(false);
    expect(isScheduleDue(schedule, new Date('2026-01-05T14:02:00Z'), NY)).toBe(false);
  });

  it('anchors to createdAt regardless of DST transitions (UTC math)', () => {
    // 6h boundaries from the UTC anchor continue uninterrupted across
    // 2026-03-08 spring-forward: 2026-03-08T08:00Z is a boundary.
    expect(isScheduleDue(schedule, new Date('2026-03-08T08:00:00Z'), NY)).toBe(true);
    expect(isScheduleDue(schedule, new Date('2026-03-08T09:00:00Z'), NY)).toBe(false);
  });

  it('is never due with a missing, zero, or negative intervalHours', () => {
    const now = new Date('2026-01-05T14:00:00Z');
    expect(isScheduleDue(makeSchedule({ type: 'interval', intervalHours: null }), now, NY)).toBe(false);
    expect(isScheduleDue(makeSchedule({ type: 'interval', intervalHours: 0 }), now, NY)).toBe(false);
    expect(isScheduleDue(makeSchedule({ type: 'interval', intervalHours: -6 }), now, NY)).toBe(false);
  });

  it('is never due with an unparseable createdAt', () => {
    const bad = makeSchedule({ type: 'interval', intervalHours: 6, createdAt: 'not-a-date' });
    expect(isScheduleDue(bad, new Date('2026-01-05T14:00:00Z'), NY)).toBe(false);
  });
});

// ─── hasDoseEventInWindow ─────────────────────────────────────────────────────

describe('hasDoseEventInWindow', () => {
  const now = new Date('2026-01-05T14:00:00Z');

  it('returns true when a dose event exists in the 30-minute window', async () => {
    ddbMock.on(QueryCommand, { TableName: 'dose-events-table' }).resolves({
      Items: [{ eventId: 'evt-001', scheduleId: 'sched-001' }],
    });

    await expect(hasDoseEventInWindow(DEVICE_ID, 'sched-001', now)).resolves.toBe(true);
  });

  it('returns false when no dose event exists', async () => {
    ddbMock.on(QueryCommand, { TableName: 'dose-events-table' }).resolves({ Items: [] });

    await expect(hasDoseEventInWindow(DEVICE_ID, 'sched-001', now)).resolves.toBe(false);
  });

  it('queries the byTimestamp GSI from now minus 30 minutes', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    await hasDoseEventInWindow(DEVICE_ID, 'sched-001', now);

    const calls = ddbMock.commandCalls(QueryCommand);
    expect(calls).toHaveLength(1);
    const input = calls[0].args[0].input;
    expect(input.IndexName).toBe('byTimestamp');
    expect(input.ExpressionAttributeValues).toMatchObject({
      ':d': DEVICE_ID,
      ':s': 'sched-001',
      ':start': '2026-01-05T13:30:00.000Z',
    });
  });
});

// ─── handler (end-to-end with mocked DynamoDB + Expo push) ────────────────────

describe('handler', () => {
  // Frozen at Mon Jan 5, 09:00 in New York (14:00Z) — the sample schedule is due.
  const NOW = new Date('2026-01-05T14:00:00Z');

  const device = {
    deviceId: DEVICE_ID,
    pushToken: 'ExponentPushToken[abc]',
    platform: 'ios',
    timezone: NY,
  };

  const medicine = {
    deviceId: DEVICE_ID,
    medicineId: 'med-001',
    name: 'Amoxicillin',
    strength: '250mg',
    quantity: 2,
    form: 'liquid',
    status: 'active',
  };

  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ status: 'ok' }] }),
      text: async () => '',
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    ddbMock.on(ScanCommand, { TableName: 'devices-table' }).resolves({ Items: [device] });
    ddbMock.on(QueryCommand, { TableName: 'schedules-table' }).resolves({ Items: [makeSchedule()] });
    ddbMock.on(QueryCommand, { TableName: 'dose-events-table' }).resolves({ Items: [] });
    ddbMock.on(GetCommand, { TableName: 'medicines-table' }).resolves({ Item: medicine });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('posts a correctly shaped Expo push message for a due schedule', async () => {
    await handler();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://exp.host/--/api/v2/push/send');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual([
      {
        to: 'ExponentPushToken[abc]',
        title: '🧸 Amoxicillin',
        body: 'Time to take 2 x 250mg (liquid)',
        data: {
          medicineId: 'med-001',
          scheduleId: 'sched-001',
          scheduledTime: NOW.toISOString(),
        },
        sound: 'default',
        priority: 'high',
        categoryId: 'DOSE_REMINDER',
      },
    ]);
  });

  it('skips devices without a push token', async () => {
    ddbMock.on(ScanCommand, { TableName: 'devices-table' }).resolves({
      Items: [{ ...device, pushToken: undefined }],
    });

    await handler();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(ddbMock.commandCalls(QueryCommand)).toHaveLength(0);
  });

  it('skips paused schedules', async () => {
    ddbMock.on(QueryCommand, { TableName: 'schedules-table' }).resolves({
      Items: [makeSchedule({ status: 'paused' })],
    });

    await handler();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips schedules that are not due right now', async () => {
    ddbMock.on(QueryCommand, { TableName: 'schedules-table' }).resolves({
      Items: [makeSchedule({ times: ['10:30'] })],
    });

    await handler();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips paused medicines', async () => {
    ddbMock.on(GetCommand, { TableName: 'medicines-table' }).resolves({
      Item: { ...medicine, status: 'paused' },
    });

    await handler();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('suppresses the push when a dose event exists in the dedup window', async () => {
    ddbMock.on(QueryCommand, { TableName: 'dose-events-table' }).resolves({
      Items: [{ eventId: 'evt-001', scheduleId: 'sched-001' }],
    });

    await handler();

    expect(fetchMock).not.toHaveBeenCalled();
    // Short-circuits before fetching the medicine
    expect(ddbMock.commandCalls(GetCommand)).toHaveLength(0);
  });

  it('omits the quantity prefix for single-quantity medicines', async () => {
    ddbMock.on(GetCommand, { TableName: 'medicines-table' }).resolves({
      Item: { ...medicine, quantity: 1 },
    });

    await handler();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body[0].body).toBe('Time to take 250mg (liquid)');
  });

  it('logs and swallows a failed Expo push response', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {/* suppress */});
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'gateway timeout',
      json: async () => ({}),
    });

    await expect(handler()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Expo push request failed'));
    errorSpy.mockRestore();
  });

  it('redacts push tokens echoed in a failed Expo push response body', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {/* suppress */});
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '"ExponentPushToken[abc]" is not a valid push token',
      json: async () => ({}),
    });

    await handler();

    const logged = errorSpy.mock.calls.map(args => args.join(' ')).join('\n');
    expect(logged).not.toContain('ExponentPushToken[abc]');
    expect(logged).toContain('ExponentPushToken[REDACTED]');
    errorSpy.mockRestore();
  });

  it('never logs the raw push token from an error ticket message', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {/* suppress */});
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{
          status: 'error',
          message: '"ExponentPushToken[abc]" is not a registered push token.',
          details: { error: 'DeviceNotRegistered' },
        }],
      }),
      text: async () => '',
    });

    await handler();

    const logged = errorSpy.mock.calls.map(args => args.join(' ')).join('\n');
    expect(logged).not.toContain('ExponentPushToken[abc]');
    expect(logged).toContain('DeviceNotRegistered');
    errorSpy.mockRestore();
  });

  it('redacts the token from an error ticket without a details code', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {/* suppress */});
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{
          status: 'error',
          message: '"ExponentPushToken[abc]" is not a registered push token.',
        }],
      }),
      text: async () => '',
    });

    await handler();

    const logged = errorSpy.mock.calls.map(args => args.join(' ')).join('\n');
    expect(logged).not.toContain('ExponentPushToken[abc]');
    expect(logged).toContain('ExponentPushToken[REDACTED]');
    errorSpy.mockRestore();
  });
});
