import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import * as db from './db';

function response(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}

const MAX_STRING_LENGTH = 500;
const VALID_FORMS = ['tablet', 'capsule', 'shot', 'powder', 'liquid', 'drops', 'puff', 'other'];
const VALID_ACTIONS = ['taken', 'dismissed', 'snoozed', 'missed'];
const VALID_SCHEDULE_TYPES = ['absolute', 'interval'];
const TIME_REGEX = /^\d{1,2}:\d{2}$/;

function sanitizeString(val: unknown, maxLen = MAX_STRING_LENGTH): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

function validateMedicineInput(body: Record<string, unknown>): string | null {
  const name = sanitizeString(body.name);
  if (!name) return 'Medicine name is required';
  if (name.length > 200) return 'Medicine name too long';

  const strength = sanitizeString(body.strength);
  if (!strength) return 'Strength is required';

  if (body.quantity !== undefined) {
    const qty = Number(body.quantity);
    if (isNaN(qty) || qty <= 0 || qty > 100) return 'Quantity must be between 0 and 100';
  }

  if (body.form !== undefined && !VALID_FORMS.includes(body.form as string)) {
    return 'Invalid medicine form';
  }

  return null;
}

function validateScheduleInput(body: Record<string, unknown>): string | null {
  if (!body.medicineId || typeof body.medicineId !== 'string') return 'medicineId is required';
  if (!body.type || !VALID_SCHEDULE_TYPES.includes(body.type as string)) return 'Invalid schedule type';

  if (body.type === 'absolute') {
    const times = body.times;
    if (!Array.isArray(times) || times.length === 0) return 'At least one time is required for absolute schedules';
    if (times.length > 24) return 'Too many times specified';
    for (const t of times) {
      if (typeof t !== 'string' || !TIME_REGEX.test(t)) return `Invalid time format: ${t}`;
      const [h, m] = t.split(':').map(Number);
      if (h < 0 || h > 23 || m < 0 || m > 59) return `Time out of range: ${t}`;
    }
  }

  if (body.type === 'interval') {
    const hrs = Number(body.intervalHours);
    if (isNaN(hrs) || hrs <= 0 || hrs > 168) return 'intervalHours must be between 0 and 168';
  }

  if (body.daysOfWeek !== undefined) {
    if (!Array.isArray(body.daysOfWeek)) return 'daysOfWeek must be an array';
    for (const d of body.daysOfWeek) {
      if (typeof d !== 'number' || d < 0 || d > 6) return 'Invalid day of week';
    }
  }

  return null;
}

function validateDoseInput(body: Record<string, unknown>): string | null {
  if (!body.medicineId || typeof body.medicineId !== 'string') return 'medicineId is required';
  if (!body.scheduleId || typeof body.scheduleId !== 'string') return 'scheduleId is required';
  if (!body.scheduledTime || typeof body.scheduledTime !== 'string') return 'scheduledTime is required';
  if (!body.action || !VALID_ACTIONS.includes(body.action as string)) return 'Invalid action';
  return null;
}

function getDeviceId(event: APIGatewayProxyEvent): string {
  const deviceId = event.headers['x-device-id'] || event.headers['X-Device-Id'];
  if (!deviceId) throw new Error('Missing X-Device-Id header');
  if (deviceId.length > 128 || !/^[\w-]+$/.test(deviceId)) throw new Error('Invalid X-Device-Id format');
  return deviceId;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const { resource, httpMethod } = event;
    const body = event.body ? JSON.parse(event.body) : {};

    // ─── Medicines ───────────────────────────────────────────

    if (resource === '/medicines' && httpMethod === 'GET') {
      const deviceId = getDeviceId(event);
      const medicines = await db.getMedicines(deviceId);
      return response(200, medicines);
    }

    if (resource === '/medicines' && httpMethod === 'POST') {
      const deviceId = getDeviceId(event);
      const validationError = validateMedicineInput(body);
      if (validationError) return response(400, { error: validationError });
      const now = new Date().toISOString();
      const medicine = {
        deviceId,
        medicineId: uuidv4(),
        name: body.name,
        strength: body.strength,
        quantity: body.quantity ?? 1,
        form: body.form ?? 'tablet',
        instructions: body.instructions || '',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };
      await db.putMedicine(medicine);
      return response(201, medicine);
    }

    if (resource === '/medicines/{medicineId}' && httpMethod === 'GET') {
      const deviceId = getDeviceId(event);
      const medicine = await db.getMedicine(deviceId, event.pathParameters!.medicineId!);
      if (!medicine) return response(404, { error: 'Medicine not found' });
      return response(200, medicine);
    }

    if (resource === '/medicines/{medicineId}' && httpMethod === 'PUT') {
      const deviceId = getDeviceId(event);
      const medicineId = event.pathParameters!.medicineId!;
      const existing = await db.getMedicine(deviceId, medicineId);
      if (!existing) return response(404, { error: 'Medicine not found' });

      if (body.quantity !== undefined) {
        const qty = Number(body.quantity);
        if (isNaN(qty) || qty <= 0 || qty > 100) return response(400, { error: 'Quantity must be between 0 and 100' });
      }
      if (body.form !== undefined && !VALID_FORMS.includes(body.form as string)) {
        return response(400, { error: 'Invalid medicine form' });
      }

      const updated = {
        ...existing,
        // Whitelist allowed fields
        ...(body.name !== undefined && { name: sanitizeString(body.name) }),
        ...(body.strength !== undefined && { strength: sanitizeString(body.strength) }),
        ...(body.quantity !== undefined && { quantity: body.quantity }),
        ...(body.form !== undefined && { form: body.form }),
        ...(body.instructions !== undefined && { instructions: sanitizeString(body.instructions) }),
        ...(body.status !== undefined && { status: body.status }),
        deviceId,
        medicineId,
        updatedAt: new Date().toISOString(),
      };
      await db.putMedicine(updated);
      return response(200, updated);
    }

    if (resource === '/medicines/{medicineId}' && httpMethod === 'DELETE') {
      const deviceId = getDeviceId(event);
      const medicineId = event.pathParameters!.medicineId!;
      // Also delete associated schedules
      const schedules = await db.getSchedulesByMedicine(deviceId, medicineId);
      for (const s of schedules) {
        await db.deleteSchedule(deviceId, s.scheduleId);
      }
      await db.deleteMedicine(deviceId, medicineId);
      return response(200, { deleted: true });
    }

    // ─── Schedules ───────────────────────────────────────────

    if (resource === '/schedules' && httpMethod === 'GET') {
      const deviceId = getDeviceId(event);
      const schedules = await db.getSchedules(deviceId);
      return response(200, schedules);
    }

    if (resource === '/schedules' && httpMethod === 'POST') {
      const deviceId = getDeviceId(event);
      const validationError = validateScheduleInput(body);
      if (validationError) return response(400, { error: validationError });
      const now = new Date().toISOString();
      const schedule = {
        deviceId,
        scheduleId: uuidv4(),
        medicineId: body.medicineId,
        type: body.type, // 'absolute' | 'interval'
        times: body.times ?? [],
        intervalHours: body.intervalHours ?? null,
        daysOfWeek: body.daysOfWeek ?? [],
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };
      await db.putSchedule(schedule);
      return response(201, schedule);
    }

    if (resource === '/schedules/{scheduleId}' && httpMethod === 'PUT') {
      const deviceId = getDeviceId(event);
      const scheduleId = event.pathParameters!.scheduleId!;
      const schedules = await db.getSchedules(deviceId);
      const existing = schedules.find(s => s.scheduleId === scheduleId);
      if (!existing) return response(404, { error: 'Schedule not found' });

      const updated = {
        ...existing,
        // Whitelist allowed fields
        ...(body.type !== undefined && { type: body.type }),
        ...(body.times !== undefined && { times: body.times }),
        ...(body.intervalHours !== undefined && { intervalHours: body.intervalHours }),
        ...(body.daysOfWeek !== undefined && { daysOfWeek: body.daysOfWeek }),
        ...(body.status !== undefined && { status: body.status }),
        deviceId,
        scheduleId,
        updatedAt: new Date().toISOString(),
      };
      await db.putSchedule(updated);
      return response(200, updated);
    }

    if (resource === '/schedules/{scheduleId}' && httpMethod === 'DELETE') {
      const deviceId = getDeviceId(event);
      await db.deleteSchedule(deviceId, event.pathParameters!.scheduleId!);
      return response(200, { deleted: true });
    }

    // ─── Dose Events ─────────────────────────────────────────

    if (resource === '/doses' && httpMethod === 'GET') {
      const deviceId = getDeviceId(event);
      const limit = Math.min(Math.max(parseInt(event.queryStringParameters?.limit || '50', 10) || 50, 1), 200);
      const events = await db.getDoseEvents(deviceId, limit);
      return response(200, events);
    }

    if (resource === '/doses' && httpMethod === 'POST') {
      const deviceId = getDeviceId(event);
      const validationError = validateDoseInput(body);
      if (validationError) return response(400, { error: validationError });
      const doseEvent = {
        deviceId,
        eventId: uuidv4(),
        medicineId: body.medicineId,
        scheduleId: body.scheduleId,
        scheduledTime: body.scheduledTime,
        timestamp: new Date().toISOString(),
        action: body.action, // 'taken' | 'dismissed' | 'snoozed' | 'missed'
      };
      await db.putDoseEvent(doseEvent);
      return response(201, doseEvent);
    }

    // ─── Device Registration ─────────────────────────────────

    if (resource === '/device' && httpMethod === 'POST') {
      const deviceId = body.deviceId || uuidv4();
      const now = new Date().toISOString();
      const existing = await db.getDevice(deviceId);
      const device = {
        ...(existing || {}),
        deviceId,
        pushToken: body.pushToken || existing?.pushToken,
        platform: body.platform || existing?.platform,
        timezone: body.timezone || existing?.timezone || 'America/New_York',
        caregiverCode: existing?.caregiverCode,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      await db.putDevice(device);
      return response(200, device);
    }

    if (resource === '/device' && httpMethod === 'GET') {
      const deviceId = getDeviceId(event);
      const device = await db.getDevice(deviceId);
      if (!device) return response(404, { error: 'Device not found' });
      return response(200, device);
    }

    // ─── Caregiver ───────────────────────────────────────────

    if (resource === '/caregiver' && httpMethod === 'POST') {
      const deviceId = getDeviceId(event);
      const device = await db.getDevice(deviceId);
      if (!device) return response(404, { error: 'Device not found' });

      // Generate a 6-character alphanumeric code
      const code = device.caregiverCode || uuidv4().slice(0, 6).toUpperCase();
      await db.putDevice({
        ...device,
        caregiverCode: code,
        updatedAt: new Date().toISOString(),
      });
      return response(200, { caregiverCode: code });
    }

    if (resource === '/caregiver/{code}' && httpMethod === 'GET') {
      const code = (event.pathParameters!.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length !== 6) return response(400, { error: 'Invalid caregiver code format' });
      const device = await db.getDeviceByCaregiverCode(code);
      if (!device) return response(404, { error: 'Invalid caregiver code' });

      // Return read-only view: medicines, schedules, recent doses
      const [medicines, schedules, doses] = await Promise.all([
        db.getMedicines(device.deviceId),
        db.getSchedules(device.deviceId),
        db.getDoseEvents(device.deviceId, 100),
      ]);

      return response(200, {
        medicines,
        schedules,
        recentDoses: doses,
      });
    }

    return response(404, { error: 'Not found' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('API error:', err);
    return response(500, { error: message });
  }
}
