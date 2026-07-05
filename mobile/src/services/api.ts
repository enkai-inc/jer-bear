import { Medicine, Schedule, DoseEvent, Device } from '../types';
import { appendLog } from './logger';

// Set via EXPO_PUBLIC_API_URL (see .env.example); the fallback is the last
// deployed JerBearStack ApiUrl and may go stale
const FALLBACK_API_URL = 'https://cvjc6vyoyl.execute-api.us-east-1.amazonaws.com/prod';
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || FALLBACK_API_URL;
if (!process.env.EXPO_PUBLIC_API_URL) {
  appendLog('warn', 'api', `EXPO_PUBLIC_API_URL not set — using hardcoded fallback ${FALLBACK_API_URL}`);
}

let deviceId: string | null = null;

export function setDeviceId(id: string) {
  deviceId = id;
}

export function getDeviceId(): string | null {
  return deviceId;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (deviceId) {
    headers['X-Device-Id'] = deviceId;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

// ─── Medicines ─────────────────────────────────────────────────

export async function fetchMedicines(): Promise<Medicine[]> {
  return request('/medicines');
}

export async function createMedicine(data: {
  name: string;
  strength: string;
  quantity: number;
  form: string;
  instructions?: string;
}): Promise<Medicine> {
  return request('/medicines', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateMedicine(
  medicineId: string,
  data: Partial<Medicine>,
): Promise<Medicine> {
  return request(`/medicines/${medicineId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteMedicine(medicineId: string): Promise<void> {
  await request(`/medicines/${medicineId}`, { method: 'DELETE' });
}

// ─── Schedules ─────────────────────────────────────────────────

export async function fetchSchedules(): Promise<Schedule[]> {
  return request('/schedules');
}

export async function createSchedule(data: {
  medicineId: string;
  type: 'absolute' | 'interval';
  times?: string[];
  intervalHours?: number;
  daysOfWeek?: number[];
}): Promise<Schedule> {
  return request('/schedules', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateSchedule(
  scheduleId: string,
  data: Partial<Schedule>,
): Promise<Schedule> {
  return request(`/schedules/${scheduleId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteSchedule(scheduleId: string): Promise<void> {
  await request(`/schedules/${scheduleId}`, { method: 'DELETE' });
}

// ─── Dose Events ───────────────────────────────────────────────

export async function fetchDoseEvents(limit = 50): Promise<DoseEvent[]> {
  return request(`/doses?limit=${limit}`);
}

export async function recordDose(data: {
  medicineId: string;
  scheduleId: string;
  scheduledTime: string;
  action: 'taken' | 'dismissed' | 'snoozed' | 'missed';
}): Promise<DoseEvent> {
  return request('/doses', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ─── Device ────────────────────────────────────────────────────

export async function fetchDevice(): Promise<Device> {
  return request('/device');
}

export async function registerDevice(data: {
  deviceId: string;
  pushToken?: string;
  platform?: string;
  timezone?: string;
}): Promise<Device> {
  return request('/device', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ─── Caregiver ─────────────────────────────────────────────────

export async function generateCaregiverCode(): Promise<{ caregiverCode: string }> {
  return request('/caregiver', { method: 'POST' });
}

export async function getCaregiverView(code: string): Promise<{
  medicines: Medicine[];
  schedules: Schedule[];
  recentDoses: DoseEvent[];
}> {
  return request(`/caregiver/${code}`);
}
