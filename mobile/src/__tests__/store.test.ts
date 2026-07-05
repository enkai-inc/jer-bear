/**
 * Tests for the Zustand store
 */

// Mock the API module
jest.mock('../services/api', () => ({
  setDeviceId: jest.fn(),
  fetchMedicines: jest.fn(),
  fetchSchedules: jest.fn(),
  fetchDoseEvents: jest.fn(),
  fetchDevice: jest.fn(),
  createMedicine: jest.fn(),
  updateMedicine: jest.fn(),
  deleteMedicine: jest.fn(),
  createSchedule: jest.fn(),
  updateSchedule: jest.fn(),
  deleteSchedule: jest.fn(),
  recordDose: jest.fn(),
  generateCaregiverCode: jest.fn(),
}));

import { useStore } from '../store';
import * as api from '../services/api';
import { Medicine, Schedule } from '../types';

const mockApi = api as jest.Mocked<typeof api>;

function makeMedicine(overrides: Partial<Medicine> = {}): Medicine {
  return {
    medicineId: 'm1', name: 'A', deviceId: 'd1', strength: '5mg', quantity: 1,
    form: 'tablet', status: 'active', createdAt: '', updatedAt: '', ...overrides,
  };
}

function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    scheduleId: 's1', deviceId: 'd1', medicineId: 'm1', type: 'absolute',
    times: ['09:00'], status: 'active', createdAt: '', updatedAt: '', ...overrides,
  };
}

// Reset store between tests
beforeEach(() => {
  useStore.setState({
    medicines: [],
    schedules: [],
    doseEvents: [],
    deviceId: null,
    caregiverCode: null,
    loading: false,
    error: null,
  });
  jest.clearAllMocks();
  // loadAll hydrates the device record best-effort; default to "not registered"
  mockApi.fetchDevice.mockRejectedValue(new Error('Device not found'));
});

describe('useStore', () => {
  describe('setDeviceId', () => {
    it('sets device ID and calls api.setDeviceId', () => {
      useStore.getState().setDeviceId('test-123');
      expect(useStore.getState().deviceId).toBe('test-123');
      expect(mockApi.setDeviceId).toHaveBeenCalledWith('test-123');
    });
  });

  describe('loadAll', () => {
    it('loads medicines, schedules, and dose events', async () => {
      const medicines = [makeMedicine({ name: 'Aspirin', strength: '10mg' })];
      const schedules = [makeSchedule()];
      const doseEvents = [{ eventId: 'e1', deviceId: 'd1', medicineId: 'm1', scheduleId: 's1', scheduledTime: '', timestamp: '', action: 'taken' as const }];

      mockApi.fetchMedicines.mockResolvedValue(medicines);
      mockApi.fetchSchedules.mockResolvedValue(schedules);
      mockApi.fetchDoseEvents.mockResolvedValue(doseEvents);

      await useStore.getState().loadAll();

      expect(useStore.getState().medicines).toEqual(medicines);
      expect(useStore.getState().schedules).toEqual(schedules);
      expect(useStore.getState().doseEvents).toEqual(doseEvents);
      expect(useStore.getState().loading).toBe(false);
    });

    it('hydrates caregiverCode from the device record', async () => {
      mockApi.fetchMedicines.mockResolvedValue([]);
      mockApi.fetchSchedules.mockResolvedValue([]);
      mockApi.fetchDoseEvents.mockResolvedValue([]);
      mockApi.fetchDevice.mockResolvedValue({
        deviceId: 'd1', caregiverCode: 'ABC123', timezone: 'UTC', createdAt: '', updatedAt: '',
      });

      await useStore.getState().loadAll();

      expect(useStore.getState().caregiverCode).toBe('ABC123');
    });

    it('still loads when the device record is missing', async () => {
      mockApi.fetchMedicines.mockResolvedValue([makeMedicine()]);
      mockApi.fetchSchedules.mockResolvedValue([]);
      mockApi.fetchDoseEvents.mockResolvedValue([]);

      await useStore.getState().loadAll();

      expect(useStore.getState().error).toBeNull();
      expect(useStore.getState().medicines).toHaveLength(1);
      expect(useStore.getState().caregiverCode).toBeNull();
    });

    it('sets error on failure', async () => {
      mockApi.fetchMedicines.mockRejectedValue(new Error('Network error'));
      mockApi.fetchSchedules.mockResolvedValue([]);
      mockApi.fetchDoseEvents.mockResolvedValue([]);

      await useStore.getState().loadAll();

      expect(useStore.getState().error).toBe('Network error');
      expect(useStore.getState().loading).toBe(false);
    });
  });

  describe('addMedicine', () => {
    it('adds medicine and updates state', async () => {
      const medicine = makeMedicine({ name: 'Test' });
      mockApi.createMedicine.mockResolvedValue(medicine);

      const result = await useStore.getState().addMedicine({ name: 'Test', strength: '5mg', quantity: 1, form: 'tablet' });

      expect(result).toEqual(medicine);
      expect(useStore.getState().medicines).toContainEqual(medicine);
    });

    it('propagates API rejection without mutating state', async () => {
      mockApi.createMedicine.mockRejectedValue(new Error('Validation failed'));

      await expect(
        useStore.getState().addMedicine({ name: 'Test', strength: '5mg', quantity: 1, form: 'tablet' }),
      ).rejects.toThrow('Validation failed');

      expect(useStore.getState().medicines).toEqual([]);
    });
  });

  describe('editMedicine', () => {
    it('replaces the matching medicine', async () => {
      useStore.setState({ medicines: [makeMedicine(), makeMedicine({ medicineId: 'm2', name: 'B' })] });
      const updated = makeMedicine({ name: 'Renamed' });
      mockApi.updateMedicine.mockResolvedValue(updated);

      await useStore.getState().editMedicine('m1', { name: 'Renamed' });

      expect(mockApi.updateMedicine).toHaveBeenCalledWith('m1', { name: 'Renamed' });
      expect(useStore.getState().medicines[0]).toEqual(updated);
      expect(useStore.getState().medicines[1].name).toBe('B');
    });

    it('sets store.error and rethrows on failure', async () => {
      useStore.setState({ medicines: [makeMedicine()] });
      mockApi.updateMedicine.mockRejectedValue(new Error('Update failed'));

      await expect(useStore.getState().editMedicine('m1', { name: 'X' })).rejects.toThrow('Update failed');

      expect(useStore.getState().error).toBe('Update failed');
      expect(useStore.getState().medicines[0].name).toBe('A');
    });
  });

  describe('removeMedicine', () => {
    it('removes medicine and associated schedules from state', async () => {
      useStore.setState({
        medicines: [makeMedicine(), makeMedicine({ medicineId: 'm2', name: 'B', form: 'capsule' })],
        schedules: [
          makeSchedule(),
          makeSchedule({ scheduleId: 's2', medicineId: 'm2', type: 'interval', times: undefined, intervalHours: 8 }),
        ],
      });

      mockApi.deleteMedicine.mockResolvedValue(undefined);

      await useStore.getState().removeMedicine('m1');

      expect(useStore.getState().medicines).toHaveLength(1);
      expect(useStore.getState().medicines[0].medicineId).toBe('m2');
      expect(useStore.getState().schedules).toHaveLength(1);
      expect(useStore.getState().schedules[0].medicineId).toBe('m2');
    });

    it('sets store.error and rethrows on failure', async () => {
      useStore.setState({ medicines: [makeMedicine()] });
      mockApi.deleteMedicine.mockRejectedValue(new Error('Delete failed'));

      await expect(useStore.getState().removeMedicine('m1')).rejects.toThrow('Delete failed');

      expect(useStore.getState().error).toBe('Delete failed');
      expect(useStore.getState().medicines).toHaveLength(1);
    });
  });

  describe('toggleMedicinePause', () => {
    it('toggles active to paused', async () => {
      useStore.setState({ medicines: [makeMedicine()] });

      mockApi.updateMedicine.mockResolvedValue({} as Medicine);

      await useStore.getState().toggleMedicinePause('m1');

      expect(mockApi.updateMedicine).toHaveBeenCalledWith('m1', { status: 'paused' });
      expect(useStore.getState().medicines[0].status).toBe('paused');
    });

    it('toggles paused to active', async () => {
      useStore.setState({ medicines: [makeMedicine({ status: 'paused' })] });
      mockApi.updateMedicine.mockResolvedValue({} as Medicine);

      await useStore.getState().toggleMedicinePause('m1');

      expect(mockApi.updateMedicine).toHaveBeenCalledWith('m1', { status: 'active' });
      expect(useStore.getState().medicines[0].status).toBe('active');
    });

    it('is a no-op for an unknown id (api not called)', async () => {
      useStore.setState({ medicines: [makeMedicine()] });

      await useStore.getState().toggleMedicinePause('nope');

      expect(mockApi.updateMedicine).not.toHaveBeenCalled();
      expect(useStore.getState().medicines[0].status).toBe('active');
    });

    it('sets store.error and rethrows on failure', async () => {
      useStore.setState({ medicines: [makeMedicine()] });
      mockApi.updateMedicine.mockRejectedValue(new Error('Pause failed'));

      await expect(useStore.getState().toggleMedicinePause('m1')).rejects.toThrow('Pause failed');

      expect(useStore.getState().error).toBe('Pause failed');
      expect(useStore.getState().medicines[0].status).toBe('active');
    });
  });

  describe('addSchedule', () => {
    it('appends the created schedule', async () => {
      const schedule = makeSchedule();
      mockApi.createSchedule.mockResolvedValue(schedule);

      const result = await useStore.getState().addSchedule({ medicineId: 'm1', type: 'absolute', times: ['09:00'] });

      expect(result).toEqual(schedule);
      expect(useStore.getState().schedules).toContainEqual(schedule);
    });
  });

  describe('editSchedule', () => {
    it('replaces the matching schedule', async () => {
      useStore.setState({ schedules: [makeSchedule(), makeSchedule({ scheduleId: 's2' })] });
      const updated = makeSchedule({ times: ['21:00'] });
      mockApi.updateSchedule.mockResolvedValue(updated);

      await useStore.getState().editSchedule('s1', { times: ['21:00'] });

      expect(useStore.getState().schedules[0]).toEqual(updated);
      expect(useStore.getState().schedules[1].times).toEqual(['09:00']);
    });
  });

  describe('removeSchedule', () => {
    it('filters the removed schedule', async () => {
      useStore.setState({ schedules: [makeSchedule(), makeSchedule({ scheduleId: 's2' })] });
      mockApi.deleteSchedule.mockResolvedValue(undefined);

      await useStore.getState().removeSchedule('s1');

      expect(useStore.getState().schedules).toHaveLength(1);
      expect(useStore.getState().schedules[0].scheduleId).toBe('s2');
    });
  });

  describe('toggleSchedulePause', () => {
    it('toggles active to paused', async () => {
      useStore.setState({ schedules: [makeSchedule()] });
      mockApi.updateSchedule.mockResolvedValue({} as Schedule);

      await useStore.getState().toggleSchedulePause('s1');

      expect(mockApi.updateSchedule).toHaveBeenCalledWith('s1', { status: 'paused' });
      expect(useStore.getState().schedules[0].status).toBe('paused');
    });

    it('toggles paused to active', async () => {
      useStore.setState({ schedules: [makeSchedule({ status: 'paused' })] });
      mockApi.updateSchedule.mockResolvedValue({} as Schedule);

      await useStore.getState().toggleSchedulePause('s1');

      expect(mockApi.updateSchedule).toHaveBeenCalledWith('s1', { status: 'active' });
      expect(useStore.getState().schedules[0].status).toBe('active');
    });
  });

  describe('recordDoseAction', () => {
    it('records dose and prepends to events', async () => {
      const event = { eventId: 'e1', deviceId: 'd1', medicineId: 'm1', scheduleId: 's1', scheduledTime: '', timestamp: '', action: 'taken' as const };
      mockApi.recordDose.mockResolvedValue(event);

      await useStore.getState().recordDoseAction({
        medicineId: 'm1',
        scheduleId: 's1',
        scheduledTime: new Date().toISOString(),
        action: 'taken',
      });

      expect(useStore.getState().doseEvents[0]).toEqual(event);
    });

    it('sets store.error and rethrows on failure', async () => {
      mockApi.recordDose.mockRejectedValue(new Error('Record failed'));

      await expect(useStore.getState().recordDoseAction({
        medicineId: 'm1',
        scheduleId: 's1',
        scheduledTime: new Date().toISOString(),
        action: 'taken',
      })).rejects.toThrow('Record failed');

      expect(useStore.getState().error).toBe('Record failed');
      expect(useStore.getState().doseEvents).toEqual([]);
    });
  });

  describe('generateCaregiverCode', () => {
    it('stores and returns the generated code', async () => {
      mockApi.generateCaregiverCode.mockResolvedValue({ caregiverCode: 'XYZ789' });

      const code = await useStore.getState().generateCaregiverCode();

      expect(code).toBe('XYZ789');
      expect(useStore.getState().caregiverCode).toBe('XYZ789');
    });
  });

  describe('getUpcomingDoses', () => {
    beforeEach(() => {
      // Fixed clock: Thursday, Jan 15 2026, 08:00 local
      jest.useFakeTimers({ now: new Date(2026, 0, 15, 8, 0, 0) });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns empty for no medicines', () => {
      const doses = useStore.getState().getUpcomingDoses();
      expect(doses).toEqual([]);
    });

    it('filters out paused medicines', () => {
      useStore.setState({
        medicines: [makeMedicine({ status: 'paused' })],
        schedules: [makeSchedule()],
      });

      const doses = useStore.getState().getUpcomingDoses();
      expect(doses).toEqual([]);
    });

    it('filters out paused schedules', () => {
      useStore.setState({
        medicines: [makeMedicine()],
        schedules: [makeSchedule({ status: 'paused' })],
      });

      const doses = useStore.getState().getUpcomingDoses();
      expect(doses).toEqual([]);
    });

    it('returns upcoming doses sorted by time', () => {
      useStore.setState({
        medicines: [makeMedicine(), makeMedicine({ medicineId: 'm2', name: 'B', strength: '10mg', form: 'capsule' })],
        schedules: [
          makeSchedule({ scheduleId: 's1', medicineId: 'm1', times: ['12:00'] }),
          makeSchedule({ scheduleId: 's2', medicineId: 'm2', times: ['10:00'] }),
        ],
      });

      const doses = useStore.getState().getUpcomingDoses();
      expect(doses).toHaveLength(2);
      // Sorted: B (10:00) before A (12:00)
      expect(doses[0].medicine.name).toBe('B');
      expect(doses[0].scheduledTime).toEqual(new Date(2026, 0, 15, 10, 0, 0));
      expect(doses[1].medicine.name).toBe('A');
      expect(doses[1].scheduledTime).toEqual(new Date(2026, 0, 15, 12, 0, 0));
    });
  });

  describe('clearError', () => {
    it('clears error state', () => {
      useStore.setState({ error: 'some error' });
      useStore.getState().clearError();
      expect(useStore.getState().error).toBeNull();
    });
  });
});
