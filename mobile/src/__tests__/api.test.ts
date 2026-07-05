/**
 * Tests for the API service (fetch wrapper, headers, error handling).
 */
import * as api from '../services/api';

const mockFetch = jest.fn();
(globalThis as Record<string, unknown>).fetch = mockFetch;

function okResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue(okResponse([]));
});

describe('api request headers', () => {
  // NOTE: these two tests rely on module state — the "no device id" case must
  // run before setDeviceId is called anywhere in this file.
  it('omits X-Device-Id before setDeviceId is called', async () => {
    await api.fetchMedicines();

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['X-Device-Id']).toBeUndefined();
    expect(options.headers['Content-Type']).toBe('application/json');
  });

  it('injects X-Device-Id after setDeviceId', async () => {
    api.setDeviceId('device-123');
    await api.fetchMedicines();

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['X-Device-Id']).toBe('device-123');
  });
});

describe('api error handling', () => {
  it('throws the server error field on a 400 response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ error: 'name is required' }),
    });

    await expect(api.fetchMedicines()).rejects.toThrow('name is required');
  });

  it('falls back to statusText when the error body is not JSON', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: async () => { throw new Error('not json'); },
    });

    await expect(api.fetchMedicines()).rejects.toThrow('Bad Gateway');
  });
});

describe('api endpoints', () => {
  it('fetchDoseEvents passes the limit query param', async () => {
    await api.fetchDoseEvents(25);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toMatch(/\/doses\?limit=25$/);
  });

  it('fetchDoseEvents defaults limit to 50', async () => {
    await api.fetchDoseEvents();

    const [url] = mockFetch.mock.calls[0];
    expect(url).toMatch(/\/doses\?limit=50$/);
  });

  it('recordDose POSTs the dose as JSON', async () => {
    const dose = {
      medicineId: 'm1',
      scheduleId: 's1',
      scheduledTime: '2026-01-15T14:00:00.000Z',
      action: 'taken' as const,
    };
    mockFetch.mockResolvedValue(okResponse({ eventId: 'e1', ...dose }));

    await api.recordDose(dose);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toMatch(/\/doses$/);
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual(dose);
  });

  it('fetchDevice GETs /device', async () => {
    mockFetch.mockResolvedValue(okResponse({ deviceId: 'd1', caregiverCode: 'ABC123' }));

    const device = await api.fetchDevice();

    const [url] = mockFetch.mock.calls[0];
    expect(url).toMatch(/\/device$/);
    expect(device.caregiverCode).toBe('ABC123');
  });

  it('getCaregiverView GETs /caregiver/{code}', async () => {
    mockFetch.mockResolvedValue(okResponse({ medicines: [], schedules: [], recentDoses: [] }));

    await api.getCaregiverView('ABC123');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toMatch(/\/caregiver\/ABC123$/);
  });
});
