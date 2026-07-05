jest.mock('../lambda/src/db');
import * as db from '../lambda/src/db';
import { handler } from '../lambda/src/api';
import { APIGatewayProxyEvent } from 'aws-lambda';

const mockDb = db as jest.Mocked<typeof db>;

// Device IDs are UUID-shaped (mobile always sends Crypto.randomUUID()).
const DEVICE_ID = '123e4567-e89b-42d3-a456-426614174000';
const WEB_ORIGIN = 'https://jer-bear.digitaldevops.io';

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    resource: '/',
    httpMethod: 'GET',
    headers: { 'X-Device-Id': DEVICE_ID },
    pathParameters: null,
    queryStringParameters: null,
    body: null,
    ...overrides,
  } as APIGatewayProxyEvent;
}

const sampleMedicine = {
  deviceId: DEVICE_ID,
  medicineId: 'med-001',
  name: 'Aspirin',
  strength: '100mg',
  quantity: 1,
  form: 'tablet' as const,
  instructions: 'Take with food',
  status: 'active' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const sampleSchedule = {
  deviceId: DEVICE_ID,
  scheduleId: 'sched-001',
  medicineId: 'med-001',
  type: 'absolute' as const,
  times: ['09:00'],
  intervalHours: null,
  daysOfWeek: [],
  status: 'active' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const sampleDoseEvent = {
  deviceId: DEVICE_ID,
  eventId: 'evt-001',
  medicineId: 'med-001',
  scheduleId: 'sched-001',
  scheduledTime: '2026-01-01T09:00:00.000Z',
  timestamp: '2026-01-01T09:05:00.000Z',
  action: 'taken' as const,
};

const sampleDevice = {
  deviceId: DEVICE_ID,
  pushToken: 'push-token-abc',
  platform: 'ios' as const,
  timezone: 'America/New_York',
  caregiverCode: 'ABC123',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {/* suppress expected error logs */});
});

// ─── Medicines ────────────────────────────────────────────────────────────────

describe('GET /medicines', () => {
  it('returns the medicines list for the device', async () => {
    mockDb.getMedicines.mockResolvedValue([sampleMedicine]);

    const res = await handler(makeEvent({ resource: '/medicines', httpMethod: 'GET' }));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([sampleMedicine]);
    expect(mockDb.getMedicines).toHaveBeenCalledWith(DEVICE_ID);
  });

  it('returns an empty array when there are no medicines', async () => {
    mockDb.getMedicines.mockResolvedValue([]);

    const res = await handler(makeEvent({ resource: '/medicines', httpMethod: 'GET' }));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([]);
  });
});

describe('POST /medicines', () => {
  it('creates a medicine and returns 201', async () => {
    mockDb.putMedicine.mockResolvedValue(undefined);

    const res = await handler(makeEvent({
      resource: '/medicines',
      httpMethod: 'POST',
      body: JSON.stringify({ name: 'Aspirin', strength: '100mg', quantity: 1, form: 'tablet' }),
    }));

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('Aspirin');
    expect(body.strength).toBe('100mg');
    expect(body.deviceId).toBe(DEVICE_ID);
    expect(body.medicineId).toBeDefined();
    expect(body.status).toBe('active');
    expect(mockDb.putMedicine).toHaveBeenCalledTimes(1);
  });

  it('applies default values for quantity and form', async () => {
    mockDb.putMedicine.mockResolvedValue(undefined);

    const res = await handler(makeEvent({
      resource: '/medicines',
      httpMethod: 'POST',
      body: JSON.stringify({ name: 'Ibuprofen', strength: '200mg' }),
    }));

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.quantity).toBe(1);
    expect(body.form).toBe('tablet');
  });

  it('trims and length-limits instructions', async () => {
    mockDb.putMedicine.mockResolvedValue(undefined);

    const res = await handler(makeEvent({
      resource: '/medicines',
      httpMethod: 'POST',
      body: JSON.stringify({ name: 'Aspirin', strength: '100mg', instructions: `  ${'x'.repeat(600)}  ` }),
    }));

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).instructions).toHaveLength(500);
  });

  it('rejects empty name with 400', async () => {
    const res = await handler(makeEvent({
      resource: '/medicines',
      httpMethod: 'POST',
      body: JSON.stringify({ name: '', strength: '100mg' }),
    }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'Medicine name is required' });
    expect(mockDb.putMedicine).not.toHaveBeenCalled();
  });

  it('rejects a name longer than 200 characters', async () => {
    const res = await handler(makeEvent({
      resource: '/medicines',
      httpMethod: 'POST',
      body: JSON.stringify({ name: 'a'.repeat(201), strength: '100mg' }),
    }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'Medicine name too long' });
    expect(mockDb.putMedicine).not.toHaveBeenCalled();
  });

  it('rejects missing strength', async () => {
    const res = await handler(makeEvent({
      resource: '/medicines',
      httpMethod: 'POST',
      body: JSON.stringify({ name: 'Aspirin' }),
    }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'Strength is required' });
    expect(mockDb.putMedicine).not.toHaveBeenCalled();
  });

  it.each([[0], [101], ['abc']])('rejects invalid quantity %p', async (quantity) => {
    const res = await handler(makeEvent({
      resource: '/medicines',
      httpMethod: 'POST',
      body: JSON.stringify({ name: 'Aspirin', strength: '100mg', quantity }),
    }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'Quantity must be between 0 and 100' });
    expect(mockDb.putMedicine).not.toHaveBeenCalled();
  });

  it('rejects an unknown medicine form', async () => {
    const res = await handler(makeEvent({
      resource: '/medicines',
      httpMethod: 'POST',
      body: JSON.stringify({ name: 'Aspirin', strength: '100mg', form: 'potion' }),
    }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'Invalid medicine form' });
    expect(mockDb.putMedicine).not.toHaveBeenCalled();
  });
});

describe('GET /medicines/{medicineId}', () => {
  it('returns the medicine when it exists', async () => {
    mockDb.getMedicine.mockResolvedValue(sampleMedicine);

    const res = await handler(makeEvent({
      resource: '/medicines/{medicineId}',
      httpMethod: 'GET',
      pathParameters: { medicineId: 'med-001' },
    }));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual(sampleMedicine);
    expect(mockDb.getMedicine).toHaveBeenCalledWith(DEVICE_ID, 'med-001');
  });

  it('returns 404 when medicine does not exist', async () => {
    mockDb.getMedicine.mockResolvedValue(undefined);

    const res = await handler(makeEvent({
      resource: '/medicines/{medicineId}',
      httpMethod: 'GET',
      pathParameters: { medicineId: 'nonexistent' },
    }));

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'Medicine not found' });
  });
});

describe('PUT /medicines/{medicineId}', () => {
  it('updates an existing medicine', async () => {
    mockDb.getMedicine.mockResolvedValue(sampleMedicine);
    mockDb.putMedicine.mockResolvedValue(undefined);

    const res = await handler(makeEvent({
      resource: '/medicines/{medicineId}',
      httpMethod: 'PUT',
      pathParameters: { medicineId: 'med-001' },
      body: JSON.stringify({ name: 'Aspirin EC', status: 'paused' }),
    }));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('Aspirin EC');
    expect(body.status).toBe('paused');
    expect(body.medicineId).toBe('med-001');
    expect(body.deviceId).toBe(DEVICE_ID);
    expect(mockDb.putMedicine).toHaveBeenCalledTimes(1);
  });

  it('returns 404 when medicine does not exist', async () => {
    mockDb.getMedicine.mockResolvedValue(undefined);

    const res = await handler(makeEvent({
      resource: '/medicines/{medicineId}',
      httpMethod: 'PUT',
      pathParameters: { medicineId: 'nonexistent' },
      body: JSON.stringify({ name: 'New Name' }),
    }));

    expect(res.statusCode).toBe(404);
  });

  it('rejects a status outside the allow-list', async () => {
    mockDb.getMedicine.mockResolvedValue(sampleMedicine);

    const res = await handler(makeEvent({
      resource: '/medicines/{medicineId}',
      httpMethod: 'PUT',
      pathParameters: { medicineId: 'med-001' },
      body: JSON.stringify({ status: 'garbage' }),
    }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'Invalid status' });
    expect(mockDb.putMedicine).not.toHaveBeenCalled();
  });

  it('validates present fields without requiring the rest (partial update)', async () => {
    mockDb.getMedicine.mockResolvedValue(sampleMedicine);

    const res = await handler(makeEvent({
      resource: '/medicines/{medicineId}',
      httpMethod: 'PUT',
      pathParameters: { medicineId: 'med-001' },
      body: JSON.stringify({ quantity: 101 }),
    }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'Quantity must be between 0 and 100' });
    expect(mockDb.putMedicine).not.toHaveBeenCalled();
  });
});

describe('DELETE /medicines/{medicineId}', () => {
  it('deletes the medicine and cascades to associated schedules', async () => {
    const schedules = [
      { ...sampleSchedule, scheduleId: 'sched-001' },
      { ...sampleSchedule, scheduleId: 'sched-002' },
    ];
    mockDb.getSchedulesByMedicine.mockResolvedValue(schedules);
    mockDb.deleteSchedule.mockResolvedValue(undefined);
    mockDb.deleteMedicine.mockResolvedValue(undefined);

    const res = await handler(makeEvent({
      resource: '/medicines/{medicineId}',
      httpMethod: 'DELETE',
      pathParameters: { medicineId: 'med-001' },
    }));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ deleted: true });
    expect(mockDb.getSchedulesByMedicine).toHaveBeenCalledWith(DEVICE_ID, 'med-001');
    expect(mockDb.deleteSchedule).toHaveBeenCalledTimes(2);
    expect(mockDb.deleteSchedule).toHaveBeenCalledWith(DEVICE_ID, 'sched-001');
    expect(mockDb.deleteSchedule).toHaveBeenCalledWith(DEVICE_ID, 'sched-002');
    expect(mockDb.deleteMedicine).toHaveBeenCalledWith(DEVICE_ID, 'med-001');
  });

  it('deletes the medicine with no associated schedules', async () => {
    mockDb.getSchedulesByMedicine.mockResolvedValue([]);
    mockDb.deleteSchedule.mockResolvedValue(undefined);
    mockDb.deleteMedicine.mockResolvedValue(undefined);

    const res = await handler(makeEvent({
      resource: '/medicines/{medicineId}',
      httpMethod: 'DELETE',
      pathParameters: { medicineId: 'med-001' },
    }));

    expect(res.statusCode).toBe(200);
    expect(mockDb.deleteSchedule).not.toHaveBeenCalled();
    expect(mockDb.deleteMedicine).toHaveBeenCalledWith(DEVICE_ID, 'med-001');
  });
});

// ─── Schedules ────────────────────────────────────────────────────────────────

describe('GET /schedules', () => {
  it('returns the schedules list for the device', async () => {
    mockDb.getSchedules.mockResolvedValue([sampleSchedule]);

    const res = await handler(makeEvent({ resource: '/schedules', httpMethod: 'GET' }));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([sampleSchedule]);
    expect(mockDb.getSchedules).toHaveBeenCalledWith(DEVICE_ID);
  });
});

describe('POST /schedules', () => {
  it('creates a schedule and returns 201', async () => {
    mockDb.putSchedule.mockResolvedValue(undefined);

    const res = await handler(makeEvent({
      resource: '/schedules',
      httpMethod: 'POST',
      body: JSON.stringify({
        medicineId: 'med-001',
        type: 'absolute',
        times: ['09:00', '21:00'],
        daysOfWeek: [],
      }),
    }));

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.medicineId).toBe('med-001');
    expect(body.type).toBe('absolute');
    expect(body.times).toEqual(['09:00', '21:00']);
    expect(body.scheduleId).toBeDefined();
    expect(body.deviceId).toBe(DEVICE_ID);
    expect(body.status).toBe('active');
    expect(mockDb.putSchedule).toHaveBeenCalledTimes(1);
  });

  it('creates an interval schedule', async () => {
    mockDb.putSchedule.mockResolvedValue(undefined);

    const res = await handler(makeEvent({
      resource: '/schedules',
      httpMethod: 'POST',
      body: JSON.stringify({
        medicineId: 'med-001',
        type: 'interval',
        intervalHours: 8,
      }),
    }));

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.type).toBe('interval');
    expect(body.intervalHours).toBe(8);
  });

  it('rejects invalid schedule type with 400', async () => {
    const res = await handler(makeEvent({
      resource: '/schedules',
      httpMethod: 'POST',
      body: JSON.stringify({
        medicineId: 'med-001',
        type: 'invalid-type',
        times: [],
      }),
    }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'Invalid schedule type' });
    expect(mockDb.putSchedule).not.toHaveBeenCalled();
  });

  it('rejects a missing medicineId', async () => {
    const res = await handler(makeEvent({
      resource: '/schedules',
      httpMethod: 'POST',
      body: JSON.stringify({ type: 'absolute', times: ['09:00'] }),
    }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'medicineId is required' });
    expect(mockDb.putSchedule).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, 'At least one time is required for absolute schedules'],
    [[], 'At least one time is required for absolute schedules'],
    [['25:00'], 'Time out of range: 25:00'],
    [['9:60'], 'Time out of range: 9:60'],
    [[900], 'Invalid time format: 900'],
  ])('rejects absolute schedule with times %p', async (times, error) => {
    const res = await handler(makeEvent({
      resource: '/schedules',
      httpMethod: 'POST',
      body: JSON.stringify({ medicineId: 'med-001', type: 'absolute', times }),
    }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error });
    expect(mockDb.putSchedule).not.toHaveBeenCalled();
  });

  it.each([[0], [169], ['abc']])('rejects interval schedule with intervalHours %p', async (intervalHours) => {
    const res = await handler(makeEvent({
      resource: '/schedules',
      httpMethod: 'POST',
      body: JSON.stringify({ medicineId: 'med-001', type: 'interval', intervalHours }),
    }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'intervalHours must be between 0 and 168' });
    expect(mockDb.putSchedule).not.toHaveBeenCalled();
  });

  it('rejects a non-array daysOfWeek', async () => {
    const res = await handler(makeEvent({
      resource: '/schedules',
      httpMethod: 'POST',
      body: JSON.stringify({ medicineId: 'med-001', type: 'absolute', times: ['09:00'], daysOfWeek: 'weekdays' }),
    }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'daysOfWeek must be an array' });
    expect(mockDb.putSchedule).not.toHaveBeenCalled();
  });

  it('rejects a day of week outside 0-6', async () => {
    const res = await handler(makeEvent({
      resource: '/schedules',
      httpMethod: 'POST',
      body: JSON.stringify({ medicineId: 'med-001', type: 'absolute', times: ['09:00'], daysOfWeek: [7] }),
    }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'Invalid day of week' });
    expect(mockDb.putSchedule).not.toHaveBeenCalled();
  });
});

describe('PUT /schedules/{scheduleId}', () => {
  it('updates an existing schedule', async () => {
    mockDb.getSchedule.mockResolvedValue(sampleSchedule);
    mockDb.putSchedule.mockResolvedValue(undefined);

    const res = await handler(makeEvent({
      resource: '/schedules/{scheduleId}',
      httpMethod: 'PUT',
      pathParameters: { scheduleId: 'sched-001' },
      body: JSON.stringify({ times: ['08:00', '20:00'], status: 'paused' }),
    }));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.times).toEqual(['08:00', '20:00']);
    expect(body.status).toBe('paused');
    expect(body.scheduleId).toBe('sched-001');
    expect(body.deviceId).toBe(DEVICE_ID);
    expect(mockDb.getSchedule).toHaveBeenCalledWith(DEVICE_ID, 'sched-001');
    expect(mockDb.putSchedule).toHaveBeenCalledTimes(1);
  });

  it('accepts the mobile interval payload with an empty times array', async () => {
    // AddMedicineScreen always sends `times: []` for interval schedules —
    // regression test for the partial validation rejecting the app's own payload.
    mockDb.getSchedule.mockResolvedValue(sampleSchedule);
    mockDb.putSchedule.mockResolvedValue(undefined);

    const res = await handler(makeEvent({
      resource: '/schedules/{scheduleId}',
      httpMethod: 'PUT',
      pathParameters: { scheduleId: 'sched-001' },
      body: JSON.stringify({ type: 'interval', times: [], intervalHours: 6 }),
    }));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.type).toBe('interval');
    expect(body.times).toEqual([]);
    expect(body.intervalHours).toBe(6);
    expect(mockDb.putSchedule).toHaveBeenCalledTimes(1);
  });

  it('accepts an empty times array when the stored schedule is interval and no type is sent', async () => {
    mockDb.getSchedule.mockResolvedValue({
      ...sampleSchedule,
      type: 'interval' as const,
      times: [],
      intervalHours: 6,
    });
    mockDb.putSchedule.mockResolvedValue(undefined);

    const res = await handler(makeEvent({
      resource: '/schedules/{scheduleId}',
      httpMethod: 'PUT',
      pathParameters: { scheduleId: 'sched-001' },
      body: JSON.stringify({ times: [] }),
    }));

    expect(res.statusCode).toBe(200);
    expect(mockDb.putSchedule).toHaveBeenCalledTimes(1);
  });

  it('still rejects an empty times array for an absolute schedule', async () => {
    mockDb.getSchedule.mockResolvedValue(sampleSchedule);

    const res = await handler(makeEvent({
      resource: '/schedules/{scheduleId}',
      httpMethod: 'PUT',
      pathParameters: { scheduleId: 'sched-001' },
      body: JSON.stringify({ times: [] }),
    }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'At least one time is required for absolute schedules' });
    expect(mockDb.putSchedule).not.toHaveBeenCalled();
  });

  it('returns 404 when the schedule does not exist', async () => {
    mockDb.getSchedule.mockResolvedValue(undefined);

    const res = await handler(makeEvent({
      resource: '/schedules/{scheduleId}',
      httpMethod: 'PUT',
      pathParameters: { scheduleId: 'nonexistent' },
      body: JSON.stringify({ times: ['08:00'] }),
    }));

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'Schedule not found' });
    expect(mockDb.putSchedule).not.toHaveBeenCalled();
  });

  it('rejects out-of-range times', async () => {
    mockDb.getSchedule.mockResolvedValue(sampleSchedule);

    const res = await handler(makeEvent({
      resource: '/schedules/{scheduleId}',
      httpMethod: 'PUT',
      pathParameters: { scheduleId: 'sched-001' },
      body: JSON.stringify({ times: ['99:99'] }),
    }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'Time out of range: 99:99' });
    expect(mockDb.putSchedule).not.toHaveBeenCalled();
  });

  it('rejects a negative intervalHours', async () => {
    mockDb.getSchedule.mockResolvedValue(sampleSchedule);

    const res = await handler(makeEvent({
      resource: '/schedules/{scheduleId}',
      httpMethod: 'PUT',
      pathParameters: { scheduleId: 'sched-001' },
      body: JSON.stringify({ intervalHours: -5 }),
    }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'intervalHours must be between 0 and 168' });
    expect(mockDb.putSchedule).not.toHaveBeenCalled();
  });

  it('rejects a status outside the allow-list', async () => {
    mockDb.getSchedule.mockResolvedValue(sampleSchedule);

    const res = await handler(makeEvent({
      resource: '/schedules/{scheduleId}',
      httpMethod: 'PUT',
      pathParameters: { scheduleId: 'sched-001' },
      body: JSON.stringify({ status: 'garbage' }),
    }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'Invalid status' });
    expect(mockDb.putSchedule).not.toHaveBeenCalled();
  });
});

describe('DELETE /schedules/{scheduleId}', () => {
  it('deletes the schedule', async () => {
    mockDb.deleteSchedule.mockResolvedValue(undefined);

    const res = await handler(makeEvent({
      resource: '/schedules/{scheduleId}',
      httpMethod: 'DELETE',
      pathParameters: { scheduleId: 'sched-001' },
    }));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ deleted: true });
    expect(mockDb.deleteSchedule).toHaveBeenCalledWith(DEVICE_ID, 'sched-001');
  });
});

// ─── Dose Events ──────────────────────────────────────────────────────────────

describe('GET /doses', () => {
  it('returns dose events with the default limit', async () => {
    mockDb.getDoseEvents.mockResolvedValue([sampleDoseEvent]);

    const res = await handler(makeEvent({ resource: '/doses', httpMethod: 'GET' }));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([sampleDoseEvent]);
    expect(mockDb.getDoseEvents).toHaveBeenCalledWith(DEVICE_ID, 50);
  });

  it('accepts a custom limit via query string', async () => {
    mockDb.getDoseEvents.mockResolvedValue([sampleDoseEvent]);

    const res = await handler(makeEvent({
      resource: '/doses',
      httpMethod: 'GET',
      queryStringParameters: { limit: '10' },
    }));

    expect(res.statusCode).toBe(200);
    expect(mockDb.getDoseEvents).toHaveBeenCalledWith(DEVICE_ID, 10);
  });

  it.each([
    ['0', 1],
    ['999', 200],
    ['abc', 50],
  ])('clamps limit %p to %p', async (limit, expected) => {
    mockDb.getDoseEvents.mockResolvedValue([]);

    const res = await handler(makeEvent({
      resource: '/doses',
      httpMethod: 'GET',
      queryStringParameters: { limit },
    }));

    expect(res.statusCode).toBe(200);
    expect(mockDb.getDoseEvents).toHaveBeenCalledWith(DEVICE_ID, expected);
  });
});

describe('POST /doses', () => {
  it('records a dose event and returns 201', async () => {
    mockDb.putDoseEvent.mockResolvedValue(undefined);

    const res = await handler(makeEvent({
      resource: '/doses',
      httpMethod: 'POST',
      body: JSON.stringify({
        medicineId: 'med-001',
        scheduleId: 'sched-001',
        scheduledTime: '2026-01-01T09:00:00.000Z',
        action: 'taken',
      }),
    }));

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.medicineId).toBe('med-001');
    expect(body.scheduleId).toBe('sched-001');
    expect(body.action).toBe('taken');
    expect(body.eventId).toBeDefined();
    expect(body.deviceId).toBe(DEVICE_ID);
    expect(mockDb.putDoseEvent).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid action with 400', async () => {
    const res = await handler(makeEvent({
      resource: '/doses',
      httpMethod: 'POST',
      body: JSON.stringify({
        medicineId: 'med-001',
        scheduleId: 'sched-001',
        scheduledTime: '2026-01-01T09:00:00.000Z',
        action: 'eaten',
      }),
    }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'Invalid action' });
    expect(mockDb.putDoseEvent).not.toHaveBeenCalled();
  });

  it.each([
    ['medicineId', 'medicineId is required'],
    ['scheduleId', 'scheduleId is required'],
    ['scheduledTime', 'scheduledTime is required'],
    ['action', 'Invalid action'],
  ])('rejects a dose missing %s', async (missingField, error) => {
    const fullBody: Record<string, unknown> = {
      medicineId: 'med-001',
      scheduleId: 'sched-001',
      scheduledTime: '2026-01-01T09:00:00.000Z',
      action: 'taken',
    };
    delete fullBody[missingField];

    const res = await handler(makeEvent({
      resource: '/doses',
      httpMethod: 'POST',
      body: JSON.stringify(fullBody),
    }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error });
    expect(mockDb.putDoseEvent).not.toHaveBeenCalled();
  });
});

// ─── Device Registration ──────────────────────────────────────────────────────

describe('POST /device', () => {
  it('registers a new device when no existing device', async () => {
    mockDb.getDevice.mockResolvedValue(undefined);
    mockDb.putDevice.mockResolvedValue(undefined);

    const res = await handler(makeEvent({
      resource: '/device',
      httpMethod: 'POST',
      body: JSON.stringify({
        deviceId: DEVICE_ID,
        pushToken: 'new-push-token',
        platform: 'ios',
        timezone: 'America/Chicago',
      }),
    }));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.deviceId).toBe(DEVICE_ID);
    expect(body.pushToken).toBe('new-push-token');
    expect(body.platform).toBe('ios');
    expect(body.timezone).toBe('America/Chicago');
    expect(mockDb.putDevice).toHaveBeenCalledTimes(1);
  });

  it('updates an existing device preserving prior caregiverCode', async () => {
    mockDb.getDevice.mockResolvedValue(sampleDevice);
    mockDb.putDevice.mockResolvedValue(undefined);

    const res = await handler(makeEvent({
      resource: '/device',
      httpMethod: 'POST',
      body: JSON.stringify({
        deviceId: DEVICE_ID,
        pushToken: 'updated-token',
        platform: 'ios',
        timezone: 'America/New_York',
      }),
    }));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.caregiverCode).toBe('ABC123');
    expect(body.pushToken).toBe('updated-token');
  });

  it('generates a new deviceId when none is provided', async () => {
    mockDb.getDevice.mockResolvedValue(undefined);
    mockDb.putDevice.mockResolvedValue(undefined);

    const res = await handler(makeEvent({
      resource: '/device',
      httpMethod: 'POST',
      body: JSON.stringify({ platform: 'android' }),
    }));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.deviceId).toBeDefined();
    expect(body.deviceId).not.toBe('');
  });

  it('rejects a non-UUID deviceId (device hijack guard)', async () => {
    const res = await handler(makeEvent({
      resource: '/device',
      httpMethod: 'POST',
      body: JSON.stringify({ deviceId: 'victim-device', pushToken: 'attacker-token' }),
    }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'Invalid deviceId format' });
    expect(mockDb.putDevice).not.toHaveBeenCalled();
  });

  it('uses default timezone America/New_York when none provided', async () => {
    mockDb.getDevice.mockResolvedValue(undefined);
    mockDb.putDevice.mockResolvedValue(undefined);

    const res = await handler(makeEvent({
      resource: '/device',
      httpMethod: 'POST',
      body: JSON.stringify({ deviceId: DEVICE_ID }),
    }));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).timezone).toBe('America/New_York');
  });
});

describe('GET /device', () => {
  it('returns the device for the caller', async () => {
    mockDb.getDevice.mockResolvedValue(sampleDevice);

    const res = await handler(makeEvent({ resource: '/device', httpMethod: 'GET' }));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual(sampleDevice);
    expect(mockDb.getDevice).toHaveBeenCalledWith(DEVICE_ID);
  });

  it('returns 404 when the device is not registered', async () => {
    mockDb.getDevice.mockResolvedValue(undefined);

    const res = await handler(makeEvent({ resource: '/device', httpMethod: 'GET' }));

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'Device not found' });
  });
});

// ─── Caregiver ────────────────────────────────────────────────────────────────

describe('POST /caregiver', () => {
  it('generates a 6-char A-Z0-9 caregiver code for an existing device', async () => {
    const deviceWithoutCode = { ...sampleDevice, caregiverCode: undefined };
    mockDb.getDevice.mockResolvedValue(deviceWithoutCode);
    mockDb.putDevice.mockResolvedValue(undefined);

    const res = await handler(makeEvent({
      resource: '/caregiver',
      httpMethod: 'POST',
    }));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.caregiverCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(mockDb.putDevice).toHaveBeenCalledTimes(1);
  });

  it('reuses an existing caregiver code', async () => {
    mockDb.getDevice.mockResolvedValue(sampleDevice);
    mockDb.putDevice.mockResolvedValue(undefined);

    const res = await handler(makeEvent({
      resource: '/caregiver',
      httpMethod: 'POST',
    }));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).caregiverCode).toBe('ABC123');
  });

  it('returns 404 when device not found', async () => {
    mockDb.getDevice.mockResolvedValue(undefined);

    const res = await handler(makeEvent({
      resource: '/caregiver',
      httpMethod: 'POST',
    }));

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'Device not found' });
  });
});

describe('GET /caregiver/{code}', () => {
  it('returns caregiver view with medicines, schedules, and recent doses', async () => {
    mockDb.getDeviceByCaregiverCode.mockResolvedValue(sampleDevice);
    mockDb.getMedicines.mockResolvedValue([sampleMedicine]);
    mockDb.getSchedules.mockResolvedValue([sampleSchedule]);
    mockDb.getDoseEvents.mockResolvedValue([sampleDoseEvent]);

    const res = await handler(makeEvent({
      resource: '/caregiver/{code}',
      httpMethod: 'GET',
      pathParameters: { code: 'ABC123' },
    }));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.medicines).toEqual([sampleMedicine]);
    expect(body.schedules).toEqual([sampleSchedule]);
    expect(body.recentDoses).toEqual([sampleDoseEvent]);
    expect(mockDb.getDeviceByCaregiverCode).toHaveBeenCalledWith('ABC123');
    expect(mockDb.getMedicines).toHaveBeenCalledWith(sampleDevice.deviceId);
    expect(mockDb.getSchedules).toHaveBeenCalledWith(sampleDevice.deviceId);
    expect(mockDb.getDoseEvents).toHaveBeenCalledWith(sampleDevice.deviceId, 100);
  });

  it('uppercases a lowercase code before lookup', async () => {
    mockDb.getDeviceByCaregiverCode.mockResolvedValue(sampleDevice);
    mockDb.getMedicines.mockResolvedValue([]);
    mockDb.getSchedules.mockResolvedValue([]);
    mockDb.getDoseEvents.mockResolvedValue([]);

    const res = await handler(makeEvent({
      resource: '/caregiver/{code}',
      httpMethod: 'GET',
      pathParameters: { code: 'abc123' },
    }));

    expect(res.statusCode).toBe(200);
    expect(mockDb.getDeviceByCaregiverCode).toHaveBeenCalledWith('ABC123');
  });

  it('rejects a code that is not exactly 6 characters', async () => {
    const res = await handler(makeEvent({
      resource: '/caregiver/{code}',
      httpMethod: 'GET',
      pathParameters: { code: 'ABC12' },
    }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'Invalid caregiver code format' });
    expect(mockDb.getDeviceByCaregiverCode).not.toHaveBeenCalled();
  });

  it('returns 404 for an invalid caregiver code', async () => {
    mockDb.getDeviceByCaregiverCode.mockResolvedValue(undefined);

    const res = await handler(makeEvent({
      resource: '/caregiver/{code}',
      httpMethod: 'GET',
      pathParameters: { code: 'XXXXXX' },
    }));

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'Invalid caregiver code' });
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe('unknown routes', () => {
  it('returns 404 for an unrecognised resource', async () => {
    const res = await handler(makeEvent({
      resource: '/unknown',
      httpMethod: 'GET',
    }));

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'Not found' });
  });

  it('returns 404 for a known resource with an unsupported method', async () => {
    const res = await handler(makeEvent({
      resource: '/medicines',
      httpMethod: 'PATCH',
    }));

    expect(res.statusCode).toBe(404);
  });
});

describe('X-Device-Id authentication', () => {
  it('returns 401 when X-Device-Id header is absent', async () => {
    const res = await handler(makeEvent({
      resource: '/medicines',
      httpMethod: 'GET',
      headers: {},
    }));

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ error: 'Missing X-Device-Id header' });
    expect(mockDb.getMedicines).not.toHaveBeenCalled();
  });

  it.each([
    ['a path traversal string', '../../etc/passwd'],
    ['an over-long value', 'a'.repeat(129)],
    ['a non-UUID value', 'test-device-123'],
  ])('returns 401 for %s', async (_label, deviceId) => {
    const res = await handler(makeEvent({
      resource: '/medicines',
      httpMethod: 'GET',
      headers: { 'X-Device-Id': deviceId },
    }));

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ error: 'Invalid X-Device-Id format' });
    expect(mockDb.getMedicines).not.toHaveBeenCalled();
  });

  it('accepts the lowercase x-device-id header', async () => {
    mockDb.getMedicines.mockResolvedValue([]);

    const res = await handler(makeEvent({
      resource: '/medicines',
      httpMethod: 'GET',
      headers: { 'x-device-id': DEVICE_ID },
    }));

    expect(res.statusCode).toBe(200);
    expect(mockDb.getMedicines).toHaveBeenCalledWith(DEVICE_ID);
  });
});

describe('server errors', () => {
  it('returns a generic 500 body when the db throws (no internal detail leaked)', async () => {
    mockDb.getMedicines.mockRejectedValue(new Error('ConditionalCheckFailedException: secret table detail'));

    const res = await handler(makeEvent({ resource: '/medicines', httpMethod: 'GET' }));

    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body)).toEqual({ error: 'Internal server error' });
  });

  it('returns 400 for a malformed JSON body', async () => {
    const res = await handler(makeEvent({
      resource: '/medicines',
      httpMethod: 'POST',
      body: '{not json',
    }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'Invalid JSON' });
    expect(mockDb.putMedicine).not.toHaveBeenCalled();
  });
});

// ─── Response shape ───────────────────────────────────────────────────────────

describe('response headers', () => {
  it('includes Content-Type and the restricted CORS origin on every response', async () => {
    mockDb.getMedicines.mockResolvedValue([]);

    const res = await handler(makeEvent({ resource: '/medicines', httpMethod: 'GET' }));

    expect(res.headers?.['Content-Type']).toBe('application/json');
    expect(res.headers?.['Access-Control-Allow-Origin']).toBe(WEB_ORIGIN);
  });

  it('echoes an allow-listed request origin', async () => {
    mockDb.getMedicines.mockResolvedValue([]);

    const res = await handler(makeEvent({
      resource: '/medicines',
      httpMethod: 'GET',
      headers: { 'X-Device-Id': DEVICE_ID, origin: 'http://localhost:8081' },
    }));

    expect(res.headers?.['Access-Control-Allow-Origin']).toBe('http://localhost:8081');
  });

  it('falls back to the web origin for a non-allow-listed origin', async () => {
    mockDb.getMedicines.mockResolvedValue([]);

    const res = await handler(makeEvent({
      resource: '/medicines',
      httpMethod: 'GET',
      headers: { 'X-Device-Id': DEVICE_ID, origin: 'https://evil.example' },
    }));

    expect(res.headers?.['Access-Control-Allow-Origin']).toBe(WEB_ORIGIN);
  });
});
