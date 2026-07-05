import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { randomInt } from 'crypto';
import * as db from './db';
import { CAREGIVER_CODE_LENGTH, DEFAULT_TIMEZONE } from './constants';
import { Medicine, MedicineForm, Schedule, ScheduleType, DoseEvent, Device } from './types';

// Must mirror the CORS allow-list in infra/lib/infra-stack.ts.
const ALLOWED_ORIGINS = ['https://jer-bear.digitaldevops.io', 'http://localhost:8081'];

// Set per invocation from the request Origin header (Lambda handles one event at a time).
let allowOrigin = ALLOWED_ORIGINS[0];

function response(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': allowOrigin,
    },
    body: JSON.stringify(body),
  };
}

/** Thrown for errors that should surface to the client with a specific status code. */
class HttpError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
  }
}

const MAX_STRING_LENGTH = 500;
const VALID_FORMS = ['tablet', 'capsule', 'shot', 'powder', 'liquid', 'drops', 'puff', 'other'];
const VALID_ACTIONS = ['taken', 'dismissed', 'snoozed', 'missed'];
const VALID_SCHEDULE_TYPES = ['absolute', 'interval'];
const VALID_STATUSES = ['active', 'paused'];
const TIME_REGEX = /^\d{1,2}:\d{2}$/;
// Device IDs are always Crypto.randomUUID() on the client — enforce the shape.
const DEVICE_ID_REGEX = /^[0-9a-fA-F-]{36}$/;
const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function sanitizeString(val: unknown, maxLen = MAX_STRING_LENGTH): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

/**
 * Generate a caregiver code from a CSPRNG over A-Z0-9 (~2.2B combinations).
 * crypto.randomInt draws uniformly, avoiding the modulo bias of mapping raw
 * bytes (0-255) onto the 36-char alphabet.
 */
function generateCaregiverCode(): string {
  let code = '';
  for (let i = 0; i < CAREGIVER_CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Validate medicine fields. With partial=true (PUT), required-field checks are
 * skipped and only the fields present on the body are validated.
 */
function validateMedicineInput(body: Record<string, unknown>, partial = false): string | null {
  if (!partial || body.name !== undefined) {
    const name = sanitizeString(body.name);
    if (!name) return 'Medicine name is required';
    if (name.length > 200) return 'Medicine name too long';
  }

  if (!partial || body.strength !== undefined) {
    const strength = sanitizeString(body.strength);
    if (!strength) return 'Strength is required';
  }

  if (body.quantity !== undefined) {
    const qty = Number(body.quantity);
    if (isNaN(qty) || qty <= 0 || qty > 100) return 'Quantity must be between 0 and 100';
  }

  if (body.form !== undefined && !VALID_FORMS.includes(body.form as string)) {
    return 'Invalid medicine form';
  }

  if (body.status !== undefined && !VALID_STATUSES.includes(body.status as string)) {
    return 'Invalid status';
  }

  return null;
}

/**
 * Validate schedule fields. With partial=true (PUT), required-field checks are
 * skipped and only the fields present on the body are validated; existingType
 * (the stored schedule's type) determines the effective type when the body
 * omits one.
 */
function validateScheduleInput(
  body: Record<string, unknown>,
  partial = false,
  existingType?: ScheduleType,
): string | null {
  if (!partial || body.medicineId !== undefined) {
    if (!body.medicineId || typeof body.medicineId !== 'string') return 'medicineId is required';
  }
  if (!partial || body.type !== undefined) {
    if (!body.type || !VALID_SCHEDULE_TYPES.includes(body.type as string)) return 'Invalid schedule type';
  }

  const effectiveType = (body.type as ScheduleType | undefined) ?? existingType;

  if (partial ? body.times !== undefined : body.type === 'absolute') {
    const times = body.times;
    if (!Array.isArray(times)) return 'At least one time is required for absolute schedules';
    // The mobile client always sends `times: []` for interval schedules —
    // only absolute schedules require a non-empty list.
    if (effectiveType !== 'interval' && times.length === 0) {
      return 'At least one time is required for absolute schedules';
    }
    if (times.length > 24) return 'Too many times specified';
    for (const t of times) {
      if (typeof t !== 'string' || !TIME_REGEX.test(t)) return `Invalid time format: ${t}`;
      const [h, m] = t.split(':').map(Number);
      if (h < 0 || h > 23 || m < 0 || m > 59) return `Time out of range: ${t}`;
    }
  }

  if (partial ? body.intervalHours !== undefined : body.type === 'interval') {
    const hrs = Number(body.intervalHours);
    if (isNaN(hrs) || hrs <= 0 || hrs > 168) return 'intervalHours must be between 0 and 168';
  }

  if (body.daysOfWeek !== undefined) {
    if (!Array.isArray(body.daysOfWeek)) return 'daysOfWeek must be an array';
    for (const d of body.daysOfWeek) {
      if (typeof d !== 'number' || d < 0 || d > 6) return 'Invalid day of week';
    }
  }

  if (body.status !== undefined && !VALID_STATUSES.includes(body.status as string)) {
    return 'Invalid status';
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
  if (!deviceId) throw new HttpError(401, 'Missing X-Device-Id header');
  if (!DEVICE_ID_REGEX.test(deviceId)) throw new HttpError(401, 'Invalid X-Device-Id format');
  return deviceId;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const origin = event.headers?.origin || event.headers?.Origin;
  allowOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  try {
    const { resource, httpMethod } = event;
    let body: Record<string, unknown> = {};
    if (event.body) {
      try {
        body = JSON.parse(event.body);
      } catch {
        return response(400, { error: 'Invalid JSON' });
      }
    }

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
      const medicine: Medicine = {
        deviceId,
        medicineId: uuidv4(),
        name: sanitizeString(body.name),
        strength: sanitizeString(body.strength),
        quantity: body.quantity !== undefined ? Number(body.quantity) : 1,
        form: (body.form as MedicineForm) ?? 'tablet',
        instructions: sanitizeString(body.instructions),
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

      const validationError = validateMedicineInput(body, true);
      if (validationError) return response(400, { error: validationError });

      const updated: Medicine = {
        ...existing,
        // Whitelist allowed fields
        ...(body.name !== undefined && { name: sanitizeString(body.name) }),
        ...(body.strength !== undefined && { strength: sanitizeString(body.strength) }),
        ...(body.quantity !== undefined && { quantity: Number(body.quantity) }),
        ...(body.form !== undefined && { form: body.form as MedicineForm }),
        ...(body.instructions !== undefined && { instructions: sanitizeString(body.instructions) }),
        ...(body.status !== undefined && { status: body.status as Medicine['status'] }),
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
      await Promise.all(schedules.map(s => db.deleteSchedule(deviceId, s.scheduleId)));
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
      const schedule: Schedule = {
        deviceId,
        scheduleId: uuidv4(),
        medicineId: body.medicineId as string,
        type: body.type as ScheduleType,
        times: (body.times as string[]) ?? [],
        intervalHours: (body.intervalHours as number | undefined) ?? null,
        daysOfWeek: (body.daysOfWeek as number[]) ?? [],
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
      const existing = await db.getSchedule(deviceId, scheduleId);
      if (!existing) return response(404, { error: 'Schedule not found' });

      const validationError = validateScheduleInput(body, true, existing.type);
      if (validationError) return response(400, { error: validationError });

      const updated: Schedule = {
        ...existing,
        // Whitelist allowed fields
        ...(body.type !== undefined && { type: body.type as ScheduleType }),
        ...(body.times !== undefined && { times: body.times as string[] }),
        ...(body.intervalHours !== undefined && { intervalHours: body.intervalHours as number }),
        ...(body.daysOfWeek !== undefined && { daysOfWeek: body.daysOfWeek as number[] }),
        ...(body.status !== undefined && { status: body.status as Schedule['status'] }),
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
      const parsed = parseInt(event.queryStringParameters?.limit || '50', 10);
      const limit = Math.min(Math.max(Number.isNaN(parsed) ? 50 : parsed, 1), 200);
      const events = await db.getDoseEvents(deviceId, limit);
      return response(200, events);
    }

    if (resource === '/doses' && httpMethod === 'POST') {
      const deviceId = getDeviceId(event);
      const validationError = validateDoseInput(body);
      if (validationError) return response(400, { error: validationError });
      const doseEvent: DoseEvent = {
        deviceId,
        eventId: uuidv4(),
        medicineId: body.medicineId as string,
        scheduleId: body.scheduleId as string,
        scheduledTime: body.scheduledTime as string,
        timestamp: new Date().toISOString(),
        action: body.action as DoseEvent['action'],
      };
      await db.putDoseEvent(doseEvent);
      return response(201, doseEvent);
    }

    // ─── Device Registration ─────────────────────────────────

    if (resource === '/device' && httpMethod === 'POST') {
      if (body.deviceId !== undefined
          && (typeof body.deviceId !== 'string' || !DEVICE_ID_REGEX.test(body.deviceId))) {
        return response(400, { error: 'Invalid deviceId format' });
      }
      const deviceId = (body.deviceId as string | undefined) || uuidv4();
      const now = new Date().toISOString();
      const existing = await db.getDevice(deviceId);
      const device: Device = {
        ...(existing ?? {}),
        deviceId,
        pushToken: (body.pushToken as string | undefined) || existing?.pushToken,
        platform: (body.platform as Device['platform']) || existing?.platform,
        timezone: (body.timezone as string | undefined) || existing?.timezone || DEFAULT_TIMEZONE,
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

      const code = device.caregiverCode || generateCaregiverCode();
      await db.putDevice({
        ...device,
        caregiverCode: code,
        updatedAt: new Date().toISOString(),
      });
      return response(200, { caregiverCode: code });
    }

    if (resource === '/caregiver/{code}' && httpMethod === 'GET') {
      const code = (event.pathParameters!.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length !== CAREGIVER_CODE_LENGTH) return response(400, { error: 'Invalid caregiver code format' });
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
    if (err instanceof HttpError) {
      return response(err.statusCode, { error: err.message });
    }
    // Never leak internal error details (DynamoDB/SDK messages) to clients.
    console.error('API error:', err);
    return response(500, { error: 'Internal server error' });
  }
}
