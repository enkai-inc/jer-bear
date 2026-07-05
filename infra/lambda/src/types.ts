export type MedicineForm = 'tablet' | 'capsule' | 'shot' | 'powder' | 'liquid' | 'drops' | 'puff' | 'other';

export interface Medicine {
  deviceId: string;
  medicineId: string;
  name: string;
  strength: string;     // e.g. "10mg", "40mg", "17g"
  quantity: number;      // e.g. 1, 1.5, 2 — how many to take per dose
  form: MedicineForm;    // tablet, shot, powder, etc.
  instructions?: string; // e.g. "take with food"
  status: 'active' | 'paused';
  createdAt: string;
  updatedAt: string;
}

export type ScheduleType = 'absolute' | 'interval';

export interface Schedule {
  deviceId: string;
  scheduleId: string;
  medicineId: string;
  type: ScheduleType;
  // For absolute: "09:00", "14:00", "21:00"
  // For interval: not used (intervalHours used instead)
  times?: string[];
  // For interval: hours between doses (e.g. 6)
  intervalHours?: number;
  // Days of week (0=Sun, 6=Sat). Empty = every day.
  daysOfWeek?: number[];
  status: 'active' | 'paused';
  createdAt: string;
  updatedAt: string;
}

export interface DoseEvent {
  deviceId: string;
  eventId: string;
  medicineId: string;
  scheduleId: string;
  scheduledTime: string; // ISO timestamp of when dose was scheduled
  timestamp: string;     // ISO timestamp of when action was taken
  action: 'taken' | 'dismissed' | 'snoozed' | 'missed';
}

export interface Device {
  deviceId: string;
  pushToken?: string;
  platform?: 'ios' | 'android';
  caregiverCode?: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}
