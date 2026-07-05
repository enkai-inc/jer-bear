import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius } from '../theme';
import { useStore } from '../store';
import { getLogs, clearLogs, subscribeLogs, LogEntry, appendLog } from '../services/logger';

const LEVEL_COLORS = {
  info: colors.textSecondary,
  warn: colors.warning,
  error: colors.danger,
};

export function DebugScreen() {
  const { medicines, schedules, doseEvents, deviceId, getUpcomingDoses } = useStore();
  const [logs, setLogs] = useState<LogEntry[]>(getLogs);
  const [showState, setShowState] = useState(true);

  useEffect(() => {
    return subscribeLogs(() => setLogs([...getLogs()]));
  }, []);

  const upcoming = getUpcomingDoses();
  const now = new Date();

  const handleClear = useCallback(() => {
    clearLogs();
    appendLog('info', 'debug', 'Logs cleared');
  }, []);

  const handleTestNotification = useCallback(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification('🧸 Test Notification', { body: 'If you see this, web notifications work!' });
        appendLog('info', 'debug', 'Test web notification sent');
      } else if (Notification.permission === 'default') {
        Notification.requestPermission().then(result => {
          appendLog('info', 'debug', `Permission request: ${result}`);
          if (result === 'granted') {
            new Notification('🧸 Test Notification', { body: 'If you see this, web notifications work!' });
          }
        });
      } else {
        appendLog('warn', 'debug', `Cannot send: permission=${Notification.permission}`);
      }
    } else {
      appendLog('info', 'debug', `Web Notification API not available (platform=${Platform.OS})`);
    }
  }, []);

  function renderLogItem({ item }: { item: LogEntry }) {
    const time = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return (
      <View style={styles.logRow}>
        <Text style={[styles.logTime]}>{time}</Text>
        <Text style={[styles.logLevel, { color: LEVEL_COLORS[item.level] }]}>{item.level.toUpperCase()}</Text>
        <Text style={styles.logSource}>[{item.source}]</Text>
        <Text style={styles.logMsg} numberOfLines={3}>{item.message}</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Debug Log</Text>

      <TouchableOpacity
        style={styles.toggleButton}
        onPress={() => setShowState(s => !s)}
      >
        <Text style={styles.toggleText}>{showState ? 'Hide' : 'Show'} App State</Text>
      </TouchableOpacity>

      {showState && (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>App State</Text>
          <Text style={styles.stateLine}>Platform: {Platform.OS}</Text>
          <Text style={styles.stateLine}>Device ID: {deviceId ?? 'not set'}</Text>
          <Text style={styles.stateLine}>Medicines: {medicines.length} ({medicines.filter(m => m.status === 'active').length} active)</Text>
          <Text style={styles.stateLine}>Schedules: {schedules.length} ({schedules.filter(s => s.status === 'active').length} active)</Text>
          <Text style={styles.stateLine}>Dose Events: {doseEvents.length}</Text>
          <Text style={styles.stateLine}>Upcoming Doses: {upcoming.length}</Text>
          <Text style={styles.stateLine}>Now: {now.toLocaleTimeString()}</Text>
          {upcoming.length > 0 && (
            <>
              <Text style={[styles.stateTitle, { marginTop: spacing.sm }]}>Upcoming Doses</Text>
              {upcoming.slice(0, 5).map((dose, i) => {
                const diffMs = dose.scheduledTime.getTime() - now.getTime();
                const diffMins = Math.round(diffMs / 60000);
                return (
                  <Text key={i} style={styles.stateLine}>
                    {dose.medicine.name} @ {dose.scheduledTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {' '}({diffMins > 0 ? `in ${diffMins}m` : `${Math.abs(diffMins)}m overdue`})
                  </Text>
                );
              })}
            </>
          )}
          {schedules.length > 0 && (
            <>
              <Text style={[styles.stateTitle, { marginTop: spacing.sm }]}>Schedules</Text>
              {schedules.map((s, i) => {
                const med = medicines.find(m => m.medicineId === s.medicineId);
                return (
                  <Text key={i} style={styles.stateLine}>
                    {med?.name ?? '?'}: {s.type === 'absolute' ? `times=[${s.times?.join(', ')}]` : `every ${s.intervalHours}h`}
                    {' '}({s.status}) created={new Date(s.createdAt).toLocaleTimeString()}
                  </Text>
                );
              })}
            </>
          )}
          {Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window && (
            <Text style={styles.stateLine}>Web Notification permission: {Notification.permission}</Text>
          )}
        </View>
      )}

      <View style={styles.logHeader}>
        <Text style={styles.logHeaderText}>Event Log ({logs.length})</Text>
        <View style={styles.logActions}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleTestNotification}>
            <Text style={styles.actionBtnText}>Test Notif</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.clearBtn]} onPress={handleClear}>
            <Text style={styles.actionBtnText}>Clear</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={logs}
        keyExtractor={(_, i) => String(i)}
        renderItem={renderLogItem}
        style={styles.logList}
        contentContainerStyle={styles.logListContent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  toggleButton: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surfaceWarm,
    borderRadius: borderRadius.sm,
    alignSelf: 'flex-start',
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  stateCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stateTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  stateLine: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    lineHeight: 18,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  logHeaderText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  logActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  actionBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
  },
  clearBtn: {
    backgroundColor: colors.danger,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textLight,
  },
  logList: {
    flex: 1,
  },
  logListContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
  },
  logRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    flexWrap: 'wrap',
  },
  logTime: {
    fontSize: 11,
    color: colors.paused,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    marginRight: 4,
  },
  logLevel: {
    fontSize: 11,
    fontWeight: '700',
    marginRight: 4,
    width: 38,
  },
  logSource: {
    fontSize: 11,
    color: colors.accent,
    marginRight: 4,
  },
  logMsg: {
    fontSize: 11,
    color: colors.text,
    flex: 1,
    flexShrink: 1,
  },
});
