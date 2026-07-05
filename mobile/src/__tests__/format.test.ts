import {
  formatDoseQuantity,
  formatDoseBody,
  formatTime,
  formatRelativeTime,
  formatSchedule,
} from '../utils/format';
import { Medicine, Schedule } from '../types';

function makeMedicine(overrides: Partial<Medicine> = {}): Medicine {
  return {
    medicineId: 'med-1',
    name: 'Amoxicillin',
    strength: '250mg',
    quantity: 1,
    form: 'tablet',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Medicine;
}

function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    scheduleId: 'sched-1',
    medicineId: 'med-1',
    type: 'absolute',
    times: ['09:00'],
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Schedule;
}

describe('formatDoseQuantity', () => {
  it('omits the multiplier for a quantity of 1', () => {
    expect(formatDoseQuantity(makeMedicine())).toBe('250mg (tablet)');
  });

  it('prefixes "N x " for quantities other than 1', () => {
    expect(formatDoseQuantity(makeMedicine({ quantity: 2 }))).toBe('2 x 250mg (tablet)');
  });
});

describe('formatDoseBody', () => {
  it('formats without instructions', () => {
    expect(formatDoseBody(makeMedicine())).toBe('Take 250mg (tablet)');
  });

  it('appends instructions when present', () => {
    expect(formatDoseBody(makeMedicine({ quantity: 2, instructions: 'with food' })))
      .toBe('Take 2 x 250mg (tablet) — with food');
  });
});

describe('formatTime', () => {
  it('renders a locale time with hour and minutes', () => {
    const rendered = formatTime(new Date(2026, 0, 15, 9, 5, 0));
    expect(rendered).toMatch(/9.05/);
  });
});

describe('formatRelativeTime', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date(2026, 0, 15, 9, 0, 0) });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns "Overdue" for past times', () => {
    expect(formatRelativeTime(new Date(2026, 0, 15, 8, 55, 0))).toBe('Overdue');
  });

  it('returns "Now" for the current minute', () => {
    expect(formatRelativeTime(new Date(2026, 0, 15, 9, 0, 10))).toBe('Now');
  });

  it('returns minutes under an hour', () => {
    expect(formatRelativeTime(new Date(2026, 0, 15, 9, 45, 0))).toBe('In 45 min');
  });

  it('returns whole hours without a minutes part', () => {
    expect(formatRelativeTime(new Date(2026, 0, 15, 11, 0, 0))).toBe('In 2h');
  });

  it('returns hours and minutes', () => {
    expect(formatRelativeTime(new Date(2026, 0, 15, 10, 30, 0))).toBe('In 1h 30m');
  });
});

describe('formatSchedule', () => {
  it('formats absolute times as a 12-hour list', () => {
    expect(formatSchedule(makeSchedule({ times: ['09:00', '21:30'] })))
      .toBe('9:00 AM, 9:30 PM');
  });

  it('formats midnight and noon correctly', () => {
    expect(formatSchedule(makeSchedule({ times: ['00:15', '12:00'] })))
      .toBe('12:15 AM, 12:00 PM');
  });

  it('shows invalid time strings verbatim', () => {
    expect(formatSchedule(makeSchedule({ times: ['99:99'] }))).toBe('99:99');
  });

  it('formats interval schedules', () => {
    expect(formatSchedule(makeSchedule({ type: 'interval', times: undefined, intervalHours: 6 })))
      .toBe('Every 6 hours');
  });

  it('returns an empty string for a schedule with no usable data', () => {
    expect(formatSchedule(makeSchedule({ times: undefined }))).toBe('');
  });
});
