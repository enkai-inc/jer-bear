export type MedicineForm = 'tablet' | 'capsule' | 'shot' | 'powder' | 'liquid' | 'drops' | 'puff' | 'other';

export interface Medicine {
  deviceId: string;
  medicineId: string;
  name: string;
  strength: string;     // e.g. "10mg", "40mg", "17g"
  quantity: number;      // e.g. 1, 1.5, 2
  form: MedicineForm;    // tablet, shot, powder, etc.
  instructions?: string;
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
  times?: string[];        // For absolute: ["09:00", "21:00"]
  intervalHours?: number;  // For interval: 6
  daysOfWeek?: number[];   // 0=Sun..6=Sat, empty=every day
  status: 'active' | 'paused';
  createdAt: string;
  updatedAt: string;
}

export interface DoseEvent {
  deviceId: string;
  eventId: string;
  medicineId: string;
  scheduleId: string;
  scheduledTime: string;
  timestamp: string;
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

export interface UpcomingDose {
  medicine: Medicine;
  schedule: Schedule;
  scheduledTime: Date;
}
