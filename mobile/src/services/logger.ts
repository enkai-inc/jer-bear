export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  source: string;
  message: string;
}

const MAX_ENTRIES = 200;
const logs: LogEntry[] = [];
const listeners = new Set<() => void>();

export function appendLog(level: LogEntry['level'], source: string, message: string) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
  };
  logs.unshift(entry); // newest first
  if (logs.length > MAX_ENTRIES) logs.length = MAX_ENTRIES;
  for (const fn of listeners) fn();
}

export function getLogs(): LogEntry[] {
  return logs;
}

export function clearLogs() {
  logs.length = 0;
  for (const fn of listeners) fn();
}

export function subscribeLogs(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
