/**
 * Tests for the pure dose-scheduling module — regression suite for the
 * PR #4 dose-timing fix. `now` is injected, so no store or timers needed.
 */
import {
  computeUpcomingDoses,
  parseTimeString,
  isSchedulePairActive,
} from '../services/doseSchedule';
import { Medicine, Schedule, DoseEvent } from '../types';

// Thursday, Jan 15 2026 (local time) — getDay() === 4
const BASE_YEAR = 2026;
const BASE_MONTH = 0; // January
const BASE_DAY = 15;

function localDate(hour: number, minute = 0, dayOffset = 0): Date {
  return new Date(BASE_YEAR, BASE_MONTH, BASE_DAY + dayOffset, hour, minute, 0, 0);
}

function makeMedicine(overrides: Partial<Medicine> = {}): Medicine {
  return {
    deviceId: 'd1',
    medicineId: 'm1',
    name: 'A',
    strength: '5mg',
    quantity: 1,
    form: 'tablet',
    status: 'active',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    deviceId: 'd1',
    scheduleId: 's1',
    medicineId: 'm1',
    type: 'absolute',
    times: ['09:00'],
    status: 'active',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function makeEvent(overrides: Partial<DoseEvent> = {}): DoseEvent {
  return {
    deviceId: 'd1',
    eventId: 'e1',
    medicineId: 'm1',
    scheduleId: 's1',
    scheduledTime: localDate(9).toISOString(),
    timestamp: localDate(9, 1).toISOString(),
    action: 'taken',
    ...overrides,
  };
}

describe('parseTimeString', () => {
  it('parses valid 24h times', () => {
    expect(parseTimeString('09:00')).toEqual({ hour: 9, minute: 0 });
    expect(parseTimeString('23:59')).toEqual({ hour: 23, minute: 59 });
    expect(parseTimeString('00:00')).toEqual({ hour: 0, minute: 0 });
  });

  it('defaults missing minutes to 0', () => {
    expect(parseTimeString('9')).toEqual({ hour: 9, minute: 0 });
  });

  it('rejects out-of-range and garbage values', () => {
    expect(parseTimeString('24:00')).toBeNull();
    expect(parseTimeString('25:00')).toBeNull();
    expect(parseTimeString('9:60')).toBeNull();
    expect(parseTimeString('-1:00')).toBeNull();
    expect(parseTimeString('garbage')).toBeNull();
    expect(parseTimeString('')).toBeNull();
    expect(parseTimeString(undefined as unknown as string)).toBeNull();
  });
});

describe('isSchedulePairActive', () => {
  it('is true only when both medicine and schedule are active', () => {
    expect(isSchedulePairActive(makeMedicine(), makeSchedule())).toBe(true);
    expect(isSchedulePairActive(makeMedicine({ status: 'paused' }), makeSchedule())).toBe(false);
    expect(isSchedulePairActive(makeMedicine(), makeSchedule({ status: 'paused' }))).toBe(false);
    expect(isSchedulePairActive(undefined, makeSchedule())).toBe(false);
  });
});

describe('computeUpcomingDoses — absolute schedules', () => {
  it('keeps a dose overdue by less than the grace period visible with today scheduledTime', () => {
    const doses = computeUpcomingDoses([makeMedicine()], [makeSchedule()], [], localDate(9, 3));
    expect(doses).toHaveLength(1);
    expect(doses[0].scheduledTime).toEqual(localDate(9, 0));
  });

  it('rolls a dose overdue past the grace period to tomorrow', () => {
    const doses = computeUpcomingDoses([makeMedicine()], [makeSchedule()], [], localDate(9, 6));
    expect(doses).toHaveLength(1);
    expect(doses[0].scheduledTime).toEqual(localDate(9, 0, 1)); // tomorrow 09:00
  });

  it('hides a dose already taken today', () => {
    const doses = computeUpcomingDoses(
      [makeMedicine()], [makeSchedule()], [makeEvent({ action: 'taken' })], localDate(9, 3),
    );
    expect(doses).toEqual([]);
  });

  it('does NOT hide a dose that was only snoozed', () => {
    const doses = computeUpcomingDoses(
      [makeMedicine()], [makeSchedule()], [makeEvent({ action: 'snoozed' })], localDate(9, 3),
    );
    expect(doses).toHaveLength(1);
    expect(doses[0].scheduledTime).toEqual(localDate(9, 0));
  });

  it('ignores an event from yesterday at the same time', () => {
    const yesterdayEvent = makeEvent({
      scheduledTime: localDate(9, 0, -1).toISOString(),
      timestamp: localDate(9, 1, -1).toISOString(),
    });
    const doses = computeUpcomingDoses(
      [makeMedicine()], [makeSchedule()], [yesterdayEvent], localDate(9, 3),
    );
    expect(doses).toHaveLength(1);
    expect(doses[0].scheduledTime).toEqual(localDate(9, 0));
  });

  it('skips schedules whose daysOfWeek excludes today', () => {
    // Base date is a Thursday (4)
    const schedule = makeSchedule({ daysOfWeek: [0, 1] });
    const doses = computeUpcomingDoses([makeMedicine()], [schedule], [], localDate(8, 0));
    expect(doses).toEqual([]);
  });

  it('skips invalid time strings', () => {
    const schedule = makeSchedule({ times: ['25:00', '9:60', 'garbage'] });
    const doses = computeUpcomingDoses([makeMedicine()], [schedule], [], localDate(8, 0));
    expect(doses).toEqual([]);
  });

  it('filters paused medicines and paused schedules', () => {
    expect(computeUpcomingDoses(
      [makeMedicine({ status: 'paused' })], [makeSchedule()], [], localDate(8, 0),
    )).toEqual([]);
    expect(computeUpcomingDoses(
      [makeMedicine()], [makeSchedule({ status: 'paused' })], [], localDate(8, 0),
    )).toEqual([]);
  });
});

describe('computeUpcomingDoses — interval schedules', () => {
  const intervalSchedule = (overrides: Partial<Schedule> = {}) => makeSchedule({
    type: 'interval',
    times: undefined,
    intervalHours: 6,
    createdAt: localDate(8, 0).toISOString(),
    ...overrides,
  });

  it('anchors the next dose to createdAt', () => {
    // Created 08:00, every 6h, now 12:00 -> next dose 14:00
    const doses = computeUpcomingDoses([makeMedicine()], [intervalSchedule()], [], localDate(12, 0));
    expect(doses).toHaveLength(1);
    expect(doses[0].scheduledTime).toEqual(localDate(14, 0));
  });

  it('includes the previous anchor when it is within the grace period', () => {
    // now 14:03 -> 14:00 (3 min overdue, within grace) and 20:00
    const doses = computeUpcomingDoses([makeMedicine()], [intervalSchedule()], [], localDate(14, 3));
    expect(doses).toHaveLength(2);
    expect(doses[0].scheduledTime).toEqual(localDate(14, 0));
    expect(doses[1].scheduledTime).toEqual(localDate(20, 0));
  });

  it('excludes a handled previous anchor', () => {
    const handled = makeEvent({
      scheduledTime: localDate(14, 0).toISOString(),
      timestamp: localDate(14, 1).toISOString(),
    });
    const doses = computeUpcomingDoses(
      [makeMedicine()], [intervalSchedule()], [handled], localDate(14, 3),
    );
    expect(doses).toHaveLength(1);
    expect(doses[0].scheduledTime).toEqual(localDate(20, 0));
  });

  it('skips intervalHours of 0 or NaN', () => {
    expect(computeUpcomingDoses(
      [makeMedicine()], [intervalSchedule({ intervalHours: 0 })], [], localDate(12, 0),
    )).toEqual([]);
    expect(computeUpcomingDoses(
      [makeMedicine()], [intervalSchedule({ intervalHours: NaN })], [], localDate(12, 0),
    )).toEqual([]);
  });
});

describe('computeUpcomingDoses — sorting', () => {
  it('returns doses sorted by scheduledTime', () => {
    const medicines = [makeMedicine(), makeMedicine({ medicineId: 'm2', name: 'B' })];
    const schedules = [
      makeSchedule({ scheduleId: 's1', medicineId: 'm1', times: ['12:00'] }),
      makeSchedule({ scheduleId: 's2', medicineId: 'm2', times: ['10:00'] }),
    ];
    const doses = computeUpcomingDoses(medicines, schedules, [], localDate(8, 0));
    expect(doses).toHaveLength(2);
    expect(doses[0].medicine.name).toBe('B');
    expect(doses[1].medicine.name).toBe('A');
  });
});
