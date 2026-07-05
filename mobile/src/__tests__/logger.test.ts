/**
 * Tests for the in-app debug logger.
 */
import { appendLog, getLogs, clearLogs, subscribeLogs } from '../services/logger';

beforeEach(() => {
  clearLogs();
});

describe('logger', () => {
  it('stores entries newest-first with level, source, and message', () => {
    appendLog('info', 'test', 'first');
    appendLog('warn', 'test', 'second');

    const logs = getLogs();
    expect(logs).toHaveLength(2);
    expect(logs[0].message).toBe('second');
    expect(logs[0].level).toBe('warn');
    expect(logs[1].message).toBe('first');
  });

  it('assigns unique, increasing ids', () => {
    appendLog('info', 'test', 'a');
    appendLog('info', 'test', 'b');

    const logs = getLogs();
    expect(typeof logs[0].id).toBe('number');
    expect(logs[0].id).toBeGreaterThan(logs[1].id);
  });

  it('caps the buffer at 200 entries, dropping the oldest', () => {
    for (let i = 0; i < 205; i++) {
      appendLog('info', 'test', `msg-${i}`);
    }

    const logs = getLogs();
    expect(logs).toHaveLength(200);
    expect(logs[0].message).toBe('msg-204'); // newest kept
    expect(logs[199].message).toBe('msg-5'); // oldest surviving
  });

  it('returns a copy from getLogs (mutations do not leak)', () => {
    appendLog('info', 'test', 'kept');

    const logs = getLogs();
    logs.length = 0;

    expect(getLogs()).toHaveLength(1);
  });

  it('notifies subscribers on append and clear, and supports unsubscribe', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeLogs(listener);

    appendLog('info', 'test', 'a');
    expect(listener).toHaveBeenCalledTimes(1);

    clearLogs();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(getLogs()).toEqual([]);

    unsubscribe();
    appendLog('info', 'test', 'b');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
