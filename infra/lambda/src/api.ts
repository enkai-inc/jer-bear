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

function getDeviceId(event: APIGatewayProxyEvent): string {
  const deviceId = event.headers['x-device-id'] || event.headers['X-Device-Id'];
  if (!deviceId) throw new Error('Missing X-Device-Id header');
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

      const updated = {
        ...existing,
        ...body,
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
      const now = new Date().toISOString();
      const schedule = {
        deviceId,
        scheduleId: uuidv4(),
        medicineId: body.medicineId,
        type: body.type, // 'absolute' | 'interval'
        times: body.times || [],
        intervalHours: body.intervalHours || null,
        daysOfWeek: body.daysOfWeek || [],
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
        ...body,
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
      const limit = event.queryStringParameters?.limit
        ? parseInt(event.queryStringParameters.limit, 10)
        : 50;
      const events = await db.getDoseEvents(deviceId, limit);
      return response(200, events);
    }

    if (resource === '/doses' && httpMethod === 'POST') {
      const deviceId = getDeviceId(event);
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
      const code = event.pathParameters!.code!;
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
