import React, { useEffect, useState, useCallback } from 'react';
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

export function HomeScreen() {
  const {
    medicines,
    schedules,
    loading,
    loadAll,
    getUpcomingDoses,
    recordDoseAction,
  } = useStore();

  const [refreshing, setRefreshing] = useState(false);
  const [alertDose, setAlertDose] = useState<UpcomingDose | null>(null);
  const [, setTick] = useState(0); // force re-render for time updates

  useEffect(() => {
    loadAll();
  }, []);

  // Re-render every 30 seconds to keep "In X min" labels current
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  const upcoming = getUpcomingDoses();
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
});
