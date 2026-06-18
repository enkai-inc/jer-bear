import { create } from 'zustand';
import { Medicine, Schedule, DoseEvent, UpcomingDose } from '../types';
import * as api from '../services/api';

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
    try {
      const [medicines, schedules, doseEvents] = await Promise.all([
        api.fetchMedicines(),
        api.fetchSchedules(),
        api.fetchDoseEvents(),
      ]);
      set({ medicines, schedules, doseEvents, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  addMedicine: async (data) => {
    const medicine = await api.createMedicine(data);
    set(s => ({ medicines: [...s.medicines, medicine] }));
    return medicine;
  },

  editMedicine: async (id, data) => {
    const updated = await api.updateMedicine(id, data);
    set(s => ({
      medicines: s.medicines.map(m => m.medicineId === id ? updated : m),
    }));
  },

  removeMedicine: async (id) => {
    await api.deleteMedicine(id);
    set(s => ({
      medicines: s.medicines.filter(m => m.medicineId !== id),
      schedules: s.schedules.filter(sc => sc.medicineId !== id),
    }));
  },

  toggleMedicinePause: async (id) => {
    const medicine = get().medicines.find(m => m.medicineId === id);
    if (!medicine) return;
    const newStatus = medicine.status === 'active' ? 'paused' : 'active';
    await api.updateMedicine(id, { status: newStatus });
    set(s => ({
      medicines: s.medicines.map(m =>
        m.medicineId === id ? { ...m, status: newStatus } : m
      ),
    }));
  },

  addSchedule: async (data) => {
    const schedule = await api.createSchedule(data);
    set(s => ({ schedules: [...s.schedules, schedule] }));
    return schedule;
  },

  editSchedule: async (id, data) => {
    const updated = await api.updateSchedule(id, data);
    set(s => ({
      schedules: s.schedules.map(sc => sc.scheduleId === id ? updated : sc),
    }));
  },

  removeSchedule: async (id) => {
    await api.deleteSchedule(id);
    set(s => ({
      schedules: s.schedules.filter(sc => sc.scheduleId !== id),
    }));
  },

  toggleSchedulePause: async (id) => {
    const schedule = get().schedules.find(s => s.scheduleId === id);
    if (!schedule) return;
    const newStatus = schedule.status === 'active' ? 'paused' : 'active';
    await api.updateSchedule(id, { status: newStatus });
    set(s => ({
      schedules: s.schedules.map(sc =>
        sc.scheduleId === id ? { ...sc, status: newStatus } : sc
      ),
    }));
  },

  recordDoseAction: async (data) => {
    const event = await api.recordDose(data);
    set(s => ({ doseEvents: [event, ...s.doseEvents] }));
  },

  generateCaregiverCode: async () => {
    const { caregiverCode } = await api.generateCaregiverCode();
    set({ caregiverCode });
    return caregiverCode;
  },

  getUpcomingDoses: () => {
    const { medicines, schedules } = get();
    const now = new Date();
    const upcoming: UpcomingDose[] = [];

    for (const schedule of schedules) {
      if (schedule.status !== 'active') continue;
      const medicine = medicines.find(m => m.medicineId === schedule.medicineId);
      if (!medicine || medicine.status !== 'active') continue;

      if (schedule.type === 'absolute' && schedule.times) {
        for (const time of schedule.times) {
          const [h, m] = time.split(':').map(Number);
          const scheduledTime = new Date(now);
          scheduledTime.setHours(h, m, 0, 0);

          // If time has passed today, schedule for tomorrow
          if (scheduledTime < now) {
            scheduledTime.setDate(scheduledTime.getDate() + 1);
          }

          upcoming.push({ medicine, schedule, scheduledTime });
        }
      }

      if (schedule.type === 'interval' && schedule.intervalHours) {
        const intervalMs = schedule.intervalHours * 60 * 60 * 1000;
        const midnight = new Date(now);
        midnight.setHours(0, 0, 0, 0);

        let next = new Date(midnight);
        while (next < now) {
          next = new Date(next.getTime() + intervalMs);
        }
        upcoming.push({ medicine, schedule, scheduledTime: next });
      }
    }

    return upcoming.sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime());
  },

  clearError: () => set({ error: null }),
}));
