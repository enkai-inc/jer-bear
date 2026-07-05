import { create } from 'zustand';
import { Medicine, Schedule, DoseEvent, UpcomingDose } from '../types';
import * as api from '../services/api';
import { appendLog } from '../services/logger';

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
      const [medicines, schedules, doseEvents] = await Promise.all([
        api.fetchMedicines(),
        api.fetchSchedules(),
        api.fetchDoseEvents(),
      ]);
      appendLog('info', 'store', `loadAll: ${medicines.length} meds, ${schedules.length} schedules, ${doseEvents.length} events`);
      set({ medicines, schedules, doseEvents, loading: false });
    } catch (err) {
      appendLog('error', 'store', `loadAll failed: ${(err as Error).message}`);
      set({ error: (err as Error).message, loading: false });
    }
  },

  addMedicine: async (data) => {
    appendLog('info', 'store', `addMedicine: ${data.name} ${data.strength}`);
    const medicine = await api.createMedicine(data);
    appendLog('info', 'store', `addMedicine success: id=${medicine.medicineId}`);
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
    appendLog('info', 'store', `addSchedule: type=${data.type} times=${data.times?.join(',')} interval=${data.intervalHours}`);
    const schedule = await api.createSchedule(data);
    appendLog('info', 'store', `addSchedule success: id=${schedule.scheduleId}`);
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
    const { medicines, schedules, doseEvents } = get();
    const now = new Date();
    const today = now.getDay(); // 0=Sun..6=Sat
    const upcoming: UpcomingDose[] = [];
    const OVERDUE_GRACE_MS = 5 * 60 * 1000; // Keep overdue doses visible for 5 minutes

    // Build a set of recently handled dose keys (scheduleId + hour:minute)
    // to filter out doses already taken/dismissed today
    const handledKeys = new Set<string>();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    for (const event of doseEvents) {
      if (event.action === 'snoozed') continue; // snoozed doses should still show
      const eventTime = new Date(event.timestamp);
      if (eventTime >= todayStart) {
        // Key by scheduleId + scheduled hour to dedup
        const scheduledDate = new Date(event.scheduledTime);
        const key = `${event.scheduleId}-${scheduledDate.getHours()}:${scheduledDate.getMinutes()}`;
        handledKeys.add(key);
      }
    }

    for (const schedule of schedules) {
      if (schedule.status !== 'active') continue;
      const medicine = medicines.find(m => m.medicineId === schedule.medicineId);
      if (!medicine || medicine.status !== 'active') continue;

      // Check daysOfWeek filter
      const daysOfWeek = schedule.daysOfWeek;
      if (daysOfWeek && daysOfWeek.length > 0 && !daysOfWeek.includes(today)) continue;

      if (schedule.type === 'absolute' && schedule.times) {
        for (const time of schedule.times) {
          const parts = time.split(':');
          const h = parseInt(parts[0], 10);
          const m = parseInt(parts[1] || '0', 10);
          if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) continue;

          const scheduledTime = new Date(now);
          scheduledTime.setHours(h, m, 0, 0);

          // Check if already handled
          const key = `${schedule.scheduleId}-${h}:${m}`;
          if (handledKeys.has(key) && scheduledTime <= now) continue;

          if (scheduledTime < now) {
            // Keep overdue doses visible within grace period so alerts can fire
            const overdueMs = now.getTime() - scheduledTime.getTime();
            if (overdueMs > OVERDUE_GRACE_MS) {
              // Past grace period — show as tomorrow
              scheduledTime.setDate(scheduledTime.getDate() + 1);
            }
            // else: keep as today's time (overdue but within grace window)
          }

          upcoming.push({ medicine, schedule, scheduledTime });
        }
      }

      if (schedule.type === 'interval' && schedule.intervalHours) {
        const intervalHours = Number(schedule.intervalHours);
        if (isNaN(intervalHours) || intervalHours <= 0) continue;

        const intervalMs = intervalHours * 60 * 60 * 1000;

        // Anchor to schedule creation time instead of midnight
        const createdAt = new Date(schedule.createdAt);
        let anchor = new Date(createdAt);

        // Step forward from creation time to find the next upcoming dose
        while (anchor < now) {
          anchor = new Date(anchor.getTime() + intervalMs);
        }

        // Also check if the most recent past interval is within grace period
        const prevAnchor = new Date(anchor.getTime() - intervalMs);
        const prevOverdueMs = now.getTime() - prevAnchor.getTime();
        const prevKey = `${schedule.scheduleId}-${prevAnchor.getHours()}:${prevAnchor.getMinutes()}`;
        if (prevOverdueMs <= OVERDUE_GRACE_MS && !handledKeys.has(prevKey)) {
          upcoming.push({ medicine, schedule, scheduledTime: prevAnchor });
        }

        // Check if this dose was already handled
        const key = `${schedule.scheduleId}-${anchor.getHours()}:${anchor.getMinutes()}`;
        if (!handledKeys.has(key)) {
          upcoming.push({ medicine, schedule, scheduledTime: anchor });
        }
      }
    }

    return upcoming.sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime());
  },

  clearError: () => set({ error: null }),
}));
