import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '../theme';
import { BearMascot } from '../components/BearMascot';
import { DoseAlertModal } from '../components/DoseAlertModal';
import { ScreenTitle } from '../components/ScreenTitle';
import { useStore } from '../store';
import { UpcomingDose } from '../types';
import {
  sendWebNotification,
  scheduleSnooze,
  requestWebNotificationPermission,
} from '../services/notifications';
import { formatTime, formatRelativeTime, formatDoseQuantity, formatDoseBody } from '../utils/format';
import { OVERDUE_GRACE_MS, ALERT_POLL_MS, SNOOZE_SECONDS } from '../constants';
import { appendLog } from '../services/logger';

/** Drop alerted-dose keys older than this so the set can't grow unboundedly. */
const ALERTED_KEY_MAX_AGE_MS = 10 * 60 * 1000;

function webNotificationPermissionIsDefault(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    'Notification' in window &&
    window.Notification.permission === 'default'
  );
}

export function HomeScreen() {
  const medicines = useStore(s => s.medicines);
  const schedules = useStore(s => s.schedules);
  const doseEvents = useStore(s => s.doseEvents);
  const error = useStore(s => s.error);
  const loadAll = useStore(s => s.loadAll);
  const getUpcomingDoses = useStore(s => s.getUpcomingDoses);
  const recordDoseAction = useStore(s => s.recordDoseAction);
  const clearError = useStore(s => s.clearError);

  const [refreshing, setRefreshing] = useState(false);
  const [alertDose, setAlertDose] = useState<UpcomingDose | null>(null);
  const [, setTick] = useState(0); // force re-render for time updates
  const [showEnableReminders, setShowEnableReminders] = useState(webNotificationPermissionIsDefault);
  const alertedDoses = useRef(new Set<string>());
  // Doses snoozed in-app, keyed by `${scheduleId}-${timestamp}` — the poller
  // re-fires these once reAlertAt passes. The grace-window path can't re-alert
  // them: the snooze period equals OVERDUE_GRACE_MS, so by the time it elapses
  // the dose has already rolled out of the upcoming list.
  const snoozedDoses = useRef(new Map<string, { dose: UpcomingDose; reAlertAt: number }>());

  useEffect(() => {
    loadAll();
  }, []);

  // Poll every ALERT_POLL_MS for due doses — auto-pop the alert modal and fire a web notification
  useEffect(() => {
    function checkDueDoses() {
      setTick(t => t + 1); // also refreshes "In X min" labels
      const doses = getUpcomingDoses();
      const now = new Date();

      // Prune stale alerted keys (`${scheduleId}-${timestamp}`) so the set stays bounded
      for (const key of alertedDoses.current) {
        const ts = Number(key.slice(key.lastIndexOf('-') + 1));
        if (!isNaN(ts) && now.getTime() - ts > ALERTED_KEY_MAX_AGE_MS) {
          alertedDoses.current.delete(key);
        }
      }

      // Re-fire alerts whose snooze period has elapsed, unless the dose was
      // taken or dismissed in the meantime (e.g. via a native notification action)
      for (const [key, entry] of snoozedDoses.current) {
        if (now.getTime() < entry.reAlertAt) continue;
        snoozedDoses.current.delete(key);
        const handled = doseEvents.some(
          e =>
            e.scheduleId === entry.dose.schedule.scheduleId &&
            (e.action === 'taken' || e.action === 'dismissed') &&
            new Date(e.timestamp).getTime() >= entry.dose.scheduledTime.getTime(),
        );
        if (handled) continue;
        appendLog('info', 'alertCheck', `Snooze elapsed — re-alerting scheduleId=${entry.dose.schedule.scheduleId}`);
        setAlertDose(entry.dose);
        sendWebNotification(`🧸 ${entry.dose.medicine.name}`, formatDoseBody(entry.dose.medicine));
        return; // one alert at a time
      }

      appendLog('info', 'alertCheck', `Checking ${doses.length} upcoming dose(s) at ${now.toLocaleTimeString()}`);
      for (const dose of doses) {
        const diffMs = dose.scheduledTime.getTime() - now.getTime();

        // Dose is due (within the overdue grace window)
        if (diffMs <= 0 && diffMs > -OVERDUE_GRACE_MS) {
          const key = `${dose.schedule.scheduleId}-${dose.scheduledTime.getTime()}`;
          if (!alertedDoses.current.has(key)) {
            appendLog('info', 'alertCheck', `Alert triggered: scheduleId=${dose.schedule.scheduleId}`);
            alertedDoses.current.add(key);
            setAlertDose(dose);
            sendWebNotification(`🧸 ${dose.medicine.name}`, formatDoseBody(dose.medicine));
            break; // one alert at a time
          }
        }
      }
    }
    const timer = setInterval(checkDueDoses, ALERT_POLL_MS);
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
    return `Next up: ${next.medicine.name} at ${formatTime(next.scheduledTime)}`;
  }

  async function handleEnableReminders() {
    await requestWebNotificationPermission();
    setShowEnableReminders(webNotificationPermissionIsDefault());
  }

  async function handleDoseAction(
    dose: UpcomingDose,
    action: 'taken' | 'dismissed' | 'snoozed',
  ) {
    try {
      await recordDoseAction({
        medicineId: dose.medicine.medicineId,
        scheduleId: dose.schedule.scheduleId,
        scheduledTime: dose.scheduledTime.toISOString(),
        action,
      });
      const key = `${dose.schedule.scheduleId}-${dose.scheduledTime.getTime()}`;
      if (action === 'snoozed') {
        // Native: schedule a one-shot snooze notification (no-op on web)
        await scheduleSnooze(dose.medicine, dose.schedule.scheduleId);
        // Web/in-app: record when to re-alert — the poller re-fires from
        // snoozedDoses since the grace window closes before the snooze elapses
        snoozedDoses.current.set(key, {
          dose,
          reAlertAt: Date.now() + SNOOZE_SECONDS * 1000,
        });
      } else {
        // Taking or dismissing (including a snoozed re-alert) cancels any
        // pending re-alert for this dose
        snoozedDoses.current.delete(key);
      }
    } catch (e) {
      // Failure is surfaced via store.error (withErrorHandling), just log here
      appendLog('error', 'home', `handleDoseAction(${action}) failed: ${(e as Error).message}`);
    } finally {
      setAlertDose(null); // never leave the modal stuck open on API failure
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <ScreenTitle style={styles.title}>Jer-Bear</ScreenTitle>
        {error && (
          <View
            style={styles.errorBanner}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => { clearError(); loadAll(); }} style={styles.retryButton} accessibilityLabel="Retry loading" accessibilityRole="button">
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}
        {showEnableReminders && (
          <TouchableOpacity
            style={styles.remindersBanner}
            onPress={handleEnableReminders}
            accessibilityRole="button"
            accessibilityLabel="Enable reminders"
          >
            <Ionicons name="notifications-outline" size={18} color={colors.primary} />
            <Text style={styles.remindersText}>
              Enable reminders to get notified when a dose is due
            </Text>
          </TouchableOpacity>
        )}
        <BearMascot message={getBearMessage()} />

        <View style={styles.statsRow}>
          <View
            style={styles.statCard}
            accessible={true}
            accessibilityLabel={`${activeMeds} active medicines`}
          >
            <Text style={styles.statNumber}>{activeMeds}</Text>
            <Text style={styles.statLabel}>Active Meds</Text>
          </View>
          <View
            style={styles.statCard}
            accessible={true}
            accessibilityLabel={`${upcoming.length} upcoming doses`}
          >
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
                <Text style={styles.doseDosage}>{formatDoseQuantity(dose.medicine)}</Text>
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
    color: colors.primary,
    textAlign: 'center',
    paddingVertical: 0,
    marginBottom: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginVertical: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surfaceTint,
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
    backgroundColor: colors.surfaceTint,
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
    borderColor: colors.borderStrong, // interactive card — >=3:1 border per WCAG 1.4.11
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
    backgroundColor: colors.dangerTint,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.danger,
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
    paddingVertical: spacing.sm + 2,
    minHeight: 44,
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  retryText: {
    color: colors.textLight,
    fontSize: 13,
    fontWeight: '600',
  },
  remindersBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceTint,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.sm,
    minHeight: 44,
    marginBottom: spacing.sm,
  },
  remindersText: {
    flex: 1,
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
  },
});
