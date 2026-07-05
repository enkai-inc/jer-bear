import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '../theme';
import { BearMascot } from '../components/BearMascot';
import { DoseAlertModal } from '../components/DoseAlertModal';
import { useStore } from '../store';
import { UpcomingDose } from '../types';
import { sendWebNotification } from '../services/notifications';
import { appendLog } from '../services/logger';

export function HomeScreen() {
  const {
    medicines,
    schedules,
    doseEvents,
    loading,
    loadAll,
    getUpcomingDoses,
    recordDoseAction,
    error,
    clearError,
  } = useStore();

  const [refreshing, setRefreshing] = useState(false);
  const [alertDose, setAlertDose] = useState<UpcomingDose | null>(null);
  const [, setTick] = useState(0); // force re-render for time updates
  const alertedDoses = useRef(new Set<string>());

  useEffect(() => {
    loadAll();
  }, []);

  // Check every 30 seconds for due doses — auto-pop the alert modal and fire web notification
  useEffect(() => {
    function checkDueDoses() {
      setTick(t => t + 1); // also refreshes "In X min" labels
      const doses = getUpcomingDoses();
      const now = new Date();
      appendLog('info', 'alertCheck', `Checking ${doses.length} upcoming dose(s) at ${now.toLocaleTimeString()}`);
      for (const dose of doses) {
        const diffMs = dose.scheduledTime.getTime() - now.getTime();
        const diffMins = Math.round(diffMs / 60000);
        appendLog('info', 'alertCheck', `  ${dose.medicine.name} @ ${dose.scheduledTime.toLocaleTimeString()} — diff: ${diffMins}m (${diffMs}ms)`);

        // Dose is due (within 5 minute overdue window)
        if (diffMs <= 0 && diffMs > -300000) {
          const key = `${dose.schedule.scheduleId}-${dose.scheduledTime.getTime()}`;
          if (!alertedDoses.current.has(key)) {
            appendLog('info', 'alertCheck', `  → ALERT TRIGGERED for ${dose.medicine.name}`);
            alertedDoses.current.add(key);
            setAlertDose(dose);
            const qty = dose.medicine.quantity !== 1 ? `${dose.medicine.quantity} x ` : '';
            sendWebNotification(
              `🧸 ${dose.medicine.name}`,
              `Take ${qty}${dose.medicine.strength} (${dose.medicine.form})`,
            );
            break; // one alert at a time
          } else {
            appendLog('info', 'alertCheck', `  → Already alerted (key: ${key})`);
          }
        }
      }
    }
    const timer = setInterval(checkDueDoses, 15000); // check every 15 seconds
    checkDueDoses(); // check immediately
    return () => clearInterval(timer);
  }, [medicines, schedules, doseEvents]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  const upcoming = useMemo(() => getUpcomingDoses(), [medicines, schedules, doseEvents]);
  const activeMeds = medicines.filter(m => m.status === 'active').length;

  function getBearMessage(): string {
    if (medicines.length === 0) {
      return "Hi! I'm Jer-Bear! Add your medicines to get started.";
    }
    if (upcoming.length === 0) {
      return "All caught up! No medicines due right now.";
    }
    const next = upcoming[0];
    const timeStr = next.scheduledTime.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
    return `Next up: ${next.medicine.name} at ${timeStr}`;
  }

  function formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.round(diffMs / 60000);

    if (diffMins < 0) return 'Overdue';
    if (diffMins === 0) return 'Now';
    if (diffMins < 60) return `In ${diffMins} min`;
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return mins > 0 ? `In ${hours}h ${mins}m` : `In ${hours}h`;
  }

  async function handleDoseAction(
    dose: UpcomingDose,
    action: 'taken' | 'dismissed' | 'snoozed',
  ) {
    await recordDoseAction({
      medicineId: dose.medicine.medicineId,
      scheduleId: dose.schedule.scheduleId,
      scheduledTime: dose.scheduledTime.toISOString(),
      action,
    });
    setAlertDose(null);
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <Text style={styles.title}>Jer-Bear</Text>
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => { clearError(); loadAll(); }} style={styles.retryButton} accessibilityLabel="Retry loading" accessibilityRole="button">
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}
        <BearMascot message={getBearMessage()} />

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{activeMeds}</Text>
            <Text style={styles.statLabel}>Active Meds</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{upcoming.length}</Text>
            <Text style={styles.statLabel}>Upcoming</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Today's Schedule</Text>

        {upcoming.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              {medicines.length === 0
                ? 'Add medicines to see your schedule'
                : 'No upcoming doses scheduled'}
            </Text>
          </View>
        ) : (
          upcoming.slice(0, 10).map((dose, i) => (
            <TouchableOpacity
              key={`${dose.schedule.scheduleId}-${i}`}
              style={styles.doseCard}
              onPress={() => setAlertDose(dose)}
              accessibilityLabel={`${dose.medicine.name}, ${dose.medicine.strength}, scheduled at ${formatTime(dose.scheduledTime)}, ${formatRelativeTime(dose.scheduledTime)}`}
              accessibilityRole="button"
            >
              <View style={styles.doseTime}>
                <Text style={styles.doseTimeText}>
                  {formatTime(dose.scheduledTime)}
                </Text>
                <Text style={styles.doseRelative}>
                  {formatRelativeTime(dose.scheduledTime)}
                </Text>
              </View>
              <View style={styles.doseInfo}>
                <Text style={styles.doseMedicine}>{dose.medicine.name}</Text>
                <Text style={styles.doseDosage}>
                  {dose.medicine.quantity !== 1 ? `${dose.medicine.quantity}x ` : ''}{dose.medicine.strength} ({dose.medicine.form})
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <DoseAlertModal
        visible={alertDose !== null}
        medicine={alertDose?.medicine ?? null}
        scheduledTime={alertDose?.scheduledTime.toISOString() ?? ''}
        onTaken={() => alertDose && handleDoseAction(alertDose, 'taken')}
        onSnooze={() => alertDose && handleDoseAction(alertDose, 'snoozed')}
        onDismiss={() => alertDose && handleDoseAction(alertDose, 'dismissed')}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginVertical: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surfaceWarm,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.primary,
  },
  statLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  emptyCard: {
    backgroundColor: colors.surfaceWarm,
    borderRadius: borderRadius.md,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  emptyText: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  doseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  doseTime: {
    width: 80,
    marginRight: spacing.sm,
  },
  doseTimeText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  doseRelative: {
    fontSize: 12,
    color: colors.accent,
    marginTop: 2,
  },
  doseInfo: {
    flex: 1,
  },
  doseMedicine: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  doseDosage: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.danger + '15',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.danger + '40',
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: colors.danger,
  },
  retryButton: {
    backgroundColor: colors.danger,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginLeft: spacing.sm,
  },
  retryText: {
    color: colors.textLight,
    fontSize: 13,
    fontWeight: '600',
  },
});
