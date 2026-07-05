import { create } from 'zustand';
import { Medicine, Schedule, DoseEvent, UpcomingDose } from '../types';
import * as api from '../services/api';
import { computeUpcomingDoses } from '../services/doseSchedule';
import { appendLog } from '../services/logger';

/**
 * Run an async store action, logging failures and surfacing them via
 * store.error (rendered by HomeScreen with a Retry), then rethrow so
 * screens with local handling still work.
 */
async function withErrorHandling<T>(
  set: (partial: { error: string }) => void,
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const message = (err as Error).message;
    appendLog('error', 'store', `${label} failed: ${message}`);
    set({ error: message });
    throw err;
  }
}

interface AppState {
  // Data
  medicines: Medicine[];
  schedules: Schedule[];
  doseEvents: DoseEvent[];
  deviceId: string | null;
  caregiverCode: string | null;

  // UI state
  loading: boolean;
  error: string | null;

  // Actions
  setDeviceId: (id: string) => void;
  loadAll: () => Promise<void>;
  addMedicine: (data: { name: string; strength: string; quantity: number; form: string; instructions?: string }) => Promise<Medicine>;
  editMedicine: (id: string, data: Partial<Medicine>) => Promise<void>;
  removeMedicine: (id: string) => Promise<void>;
  toggleMedicinePause: (id: string) => Promise<void>;
  addSchedule: (data: {
    medicineId: string;
    type: 'absolute' | 'interval';
    times?: string[];
    intervalHours?: number;
    daysOfWeek?: number[];
  }) => Promise<Schedule>;
  editSchedule: (id: string, data: Partial<Schedule>) => Promise<void>;
  removeSchedule: (id: string) => Promise<void>;
  toggleSchedulePause: (id: string) => Promise<void>;
  recordDoseAction: (data: {
    medicineId: string;
    scheduleId: string;
    scheduledTime: string;
    action: 'taken' | 'dismissed' | 'snoozed' | 'missed';
  }) => Promise<void>;
  generateCaregiverCode: () => Promise<string>;
  getUpcomingDoses: () => UpcomingDose[];
  clearError: () => void;
}

export const useStore = create<AppState>((set, get) => ({
  medicines: [],
  schedules: [],
  doseEvents: [],
  deviceId: null,
  caregiverCode: null,
  loading: false,
  error: null,

  setDeviceId: (id: string) => {
    api.setDeviceId(id);
    set({ deviceId: id });
  },

  loadAll: async () => {
    set({ loading: true, error: null });
    appendLog('info', 'store', 'loadAll: fetching data...');
    try {
      const [medicines, schedules, doseEvents, device] = await Promise.all([
        api.fetchMedicines(),
        api.fetchSchedules(),
        api.fetchDoseEvents(),
        // Hydrate caregiverCode so it survives restarts; best-effort — the
        // device record may not exist yet on first launch
        api.fetchDevice().catch(() => null),
      ]);
      appendLog('info', 'store', `loadAll: ${medicines.length} meds, ${schedules.length} schedules, ${doseEvents.length} events`);
      set({
        medicines,
        schedules,
        doseEvents,
        loading: false,
        ...(device?.caregiverCode ? { caregiverCode: device.caregiverCode } : {}),
      });
    } catch (err) {
      appendLog('error', 'store', `loadAll failed: ${(err as Error).message}`);
      set({ error: (err as Error).message, loading: false });
    }
  },

  addMedicine: async (data) => {
    appendLog('info', 'store', `addMedicine: creating (form=${data.form})`);
    const medicine = await api.createMedicine(data);
    appendLog('info', 'store', `addMedicine success: id=${medicine.medicineId}`);
    set(s => ({ medicines: [...s.medicines, medicine] }));
    return medicine;
  },

  editMedicine: async (id, data) => {
    await withErrorHandling(set, 'editMedicine', async () => {
      const updated = await api.updateMedicine(id, data);
      set(s => ({
        medicines: s.medicines.map(m => m.medicineId === id ? updated : m),
      }));
    });
  },

  removeMedicine: async (id) => {
    await withErrorHandling(set, 'removeMedicine', async () => {
      await api.deleteMedicine(id);
      set(s => ({
        medicines: s.medicines.filter(m => m.medicineId !== id),
        schedules: s.schedules.filter(sc => sc.medicineId !== id),
      }));
    });
  },

  toggleMedicinePause: async (id) => {
    const medicine = get().medicines.find(m => m.medicineId === id);
    if (!medicine) return;
    const newStatus = medicine.status === 'active' ? 'paused' : 'active';
    await withErrorHandling(set, 'toggleMedicinePause', async () => {
      await api.updateMedicine(id, { status: newStatus });
      set(s => ({
        medicines: s.medicines.map(m =>
          m.medicineId === id ? { ...m, status: newStatus } : m
        ),
      }));
    });
  },

  addSchedule: async (data) => {
    appendLog('info', 'store', `addSchedule: type=${data.type} medicineId=${data.medicineId}`);
    const schedule = await api.createSchedule(data);
    appendLog('info', 'store', `addSchedule success: id=${schedule.scheduleId}`);
    set(s => ({ schedules: [...s.schedules, schedule] }));
    return schedule;
  },

  editSchedule: async (id, data) => {
    await withErrorHandling(set, 'editSchedule', async () => {
      const updated = await api.updateSchedule(id, data);
      set(s => ({
        schedules: s.schedules.map(sc => sc.scheduleId === id ? updated : sc),
      }));
    });
  },

  removeSchedule: async (id) => {
    await withErrorHandling(set, 'removeSchedule', async () => {
      await api.deleteSchedule(id);
      set(s => ({
        schedules: s.schedules.filter(sc => sc.scheduleId !== id),
      }));
    });
  },

  toggleSchedulePause: async (id) => {
    const schedule = get().schedules.find(s => s.scheduleId === id);
    if (!schedule) return;
    const newStatus = schedule.status === 'active' ? 'paused' : 'active';
    await withErrorHandling(set, 'toggleSchedulePause', async () => {
      await api.updateSchedule(id, { status: newStatus });
      set(s => ({
        schedules: s.schedules.map(sc =>
          sc.scheduleId === id ? { ...sc, status: newStatus } : sc
        ),
      }));
    });
  },

  recordDoseAction: async (data) => {
    await withErrorHandling(set, 'recordDoseAction', async () => {
      const event = await api.recordDose(data);
      set(s => ({ doseEvents: [event, ...s.doseEvents] }));
    });
  },

  generateCaregiverCode: async () => {
    const { caregiverCode } = await api.generateCaregiverCode();
    set({ caregiverCode });
    return caregiverCode;
  },

  getUpcomingDoses: () => {
    const { medicines, schedules, doseEvents } = get();
    return computeUpcomingDoses(medicines, schedules, doseEvents, new Date());
  },

  clearError: () => set({ error: null }),
}));
