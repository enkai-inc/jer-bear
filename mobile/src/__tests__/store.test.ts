/**
 * Tests for the Zustand store
 */

// Mock the API module
jest.mock('../services/api', () => ({
  setDeviceId: jest.fn(),
  fetchMedicines: jest.fn(),
  fetchSchedules: jest.fn(),
  fetchDoseEvents: jest.fn(),
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

const mockApi = api as jest.Mocked<typeof api>;

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
      const medicines = [{ medicineId: 'm1', name: 'Aspirin', deviceId: 'd1', strength: '10mg', quantity: 1, form: 'tablet' as const, status: 'active' as const, createdAt: '', updatedAt: '' }];
      const schedules = [{ scheduleId: 's1', deviceId: 'd1', medicineId: 'm1', type: 'absolute' as const, times: ['09:00'], status: 'active' as const, createdAt: '', updatedAt: '' }];
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

    it('sets error on failure', async () => {
      mockApi.fetchMedicines.mockRejectedValue(new Error('Network error'));

      await useStore.getState().loadAll();

      expect(useStore.getState().error).toBe('Network error');
      expect(useStore.getState().loading).toBe(false);
    });
  });

  describe('addMedicine', () => {
    it('adds medicine and updates state', async () => {
      const medicine = { medicineId: 'm1', name: 'Test', deviceId: 'd1', strength: '5mg', quantity: 1, form: 'tablet' as const, status: 'active' as const, createdAt: '', updatedAt: '' };
      mockApi.createMedicine.mockResolvedValue(medicine);

      const result = await useStore.getState().addMedicine({ name: 'Test', strength: '5mg', quantity: 1, form: 'tablet' });

      expect(result).toEqual(medicine);
      expect(useStore.getState().medicines).toContainEqual(medicine);
    });
  });

  describe('removeMedicine', () => {
    it('removes medicine and associated schedules from state', async () => {
      useStore.setState({
        medicines: [
          { medicineId: 'm1', name: 'A', deviceId: 'd1', strength: '5mg', quantity: 1, form: 'tablet' as const, status: 'active' as const, createdAt: '', updatedAt: '' },
          { medicineId: 'm2', name: 'B', deviceId: 'd1', strength: '10mg', quantity: 1, form: 'capsule' as const, status: 'active' as const, createdAt: '', updatedAt: '' },
        ],
        schedules: [
          { scheduleId: 's1', deviceId: 'd1', medicineId: 'm1', type: 'absolute' as const, times: ['09:00'], status: 'active' as const, createdAt: '', updatedAt: '' },
          { scheduleId: 's2', deviceId: 'd1', medicineId: 'm2', type: 'interval' as const, intervalHours: 8, status: 'active' as const, createdAt: '', updatedAt: '' },
        ],
      });

      mockApi.deleteMedicine.mockResolvedValue(undefined);

      await useStore.getState().removeMedicine('m1');

      expect(useStore.getState().medicines).toHaveLength(1);
      expect(useStore.getState().medicines[0].medicineId).toBe('m2');
      expect(useStore.getState().schedules).toHaveLength(1);
      expect(useStore.getState().schedules[0].medicineId).toBe('m2');
    });
  });

  describe('toggleMedicinePause', () => {
    it('toggles active to paused', async () => {
      useStore.setState({
        medicines: [{ medicineId: 'm1', name: 'A', deviceId: 'd1', strength: '5mg', quantity: 1, form: 'tablet' as const, status: 'active' as const, createdAt: '', updatedAt: '' }],
      });

      mockApi.updateMedicine.mockResolvedValue({} as any);

      await useStore.getState().toggleMedicinePause('m1');

      expect(mockApi.updateMedicine).toHaveBeenCalledWith('m1', { status: 'paused' });
      expect(useStore.getState().medicines[0].status).toBe('paused');
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
  });

  describe('getUpcomingDoses', () => {
    it('returns empty for no medicines', () => {
      const doses = useStore.getState().getUpcomingDoses();
      expect(doses).toEqual([]);
    });

    it('filters out paused medicines', () => {
      useStore.setState({
        medicines: [{ medicineId: 'm1', name: 'A', deviceId: 'd1', strength: '5mg', quantity: 1, form: 'tablet' as const, status: 'paused' as const, createdAt: '', updatedAt: '' }],
        schedules: [{ scheduleId: 's1', deviceId: 'd1', medicineId: 'm1', type: 'absolute' as const, times: ['09:00'], status: 'active' as const, createdAt: '', updatedAt: '' }],
      });

      const doses = useStore.getState().getUpcomingDoses();
      expect(doses).toEqual([]);
    });

    it('filters out paused schedules', () => {
      useStore.setState({
        medicines: [{ medicineId: 'm1', name: 'A', deviceId: 'd1', strength: '5mg', quantity: 1, form: 'tablet' as const, status: 'active' as const, createdAt: '', updatedAt: '' }],
        schedules: [{ scheduleId: 's1', deviceId: 'd1', medicineId: 'm1', type: 'absolute' as const, times: ['09:00'], status: 'paused' as const, createdAt: '', updatedAt: '' }],
      });

      const doses = useStore.getState().getUpcomingDoses();
      expect(doses).toEqual([]);
    });

    it('returns upcoming doses sorted by time', () => {
      const now = new Date();
      const later = new Date(now);
      later.setHours(later.getHours() + 2);
      const laterTime = `${later.getHours().toString().padStart(2, '0')}:${later.getMinutes().toString().padStart(2, '0')}`;

      const evenLater = new Date(now);
      evenLater.setHours(evenLater.getHours() + 4);
      const evenLaterTime = `${evenLater.getHours().toString().padStart(2, '0')}:${evenLater.getMinutes().toString().padStart(2, '0')}`;

      useStore.setState({
        medicines: [
          { medicineId: 'm1', name: 'A', deviceId: 'd1', strength: '5mg', quantity: 1, form: 'tablet' as const, status: 'active' as const, createdAt: '', updatedAt: '' },
          { medicineId: 'm2', name: 'B', deviceId: 'd1', strength: '10mg', quantity: 1, form: 'capsule' as const, status: 'active' as const, createdAt: '', updatedAt: '' },
        ],
        schedules: [
          { scheduleId: 's1', deviceId: 'd1', medicineId: 'm1', type: 'absolute' as const, times: [evenLaterTime], status: 'active' as const, createdAt: '', updatedAt: '' },
          { scheduleId: 's2', deviceId: 'd1', medicineId: 'm2', type: 'absolute' as const, times: [laterTime], status: 'active' as const, createdAt: '', updatedAt: '' },
        ],
      });

      const doses = useStore.getState().getUpcomingDoses();
      expect(doses.length).toBeGreaterThanOrEqual(2);
      // Should be sorted: B (laterTime) before A (evenLaterTime)
      expect(doses[0].medicine.name).toBe('B');
      expect(doses[1].medicine.name).toBe('A');
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
