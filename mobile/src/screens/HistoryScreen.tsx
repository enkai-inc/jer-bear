import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '../theme';
import { useStore } from '../store';
import { DoseEvent } from '../types';

interface DoseSection {
  title: string;
  data: DoseEvent[];
}

const ACTION_CONFIG = {
  taken: { icon: 'checkmark-circle' as const, color: colors.success, label: 'Taken' },
  dismissed: { icon: 'close-circle' as const, color: colors.textSecondary, label: 'Dismissed' },
  snoozed: { icon: 'time' as const, color: colors.accent, label: 'Snoozed' },
  missed: { icon: 'alert-circle' as const, color: colors.danger, label: 'Missed' },
};

export function HistoryScreen() {
  const { doseEvents, medicines, loadAll } = useStore();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  function getMedicineName(medicineId: string): string {
    return medicines.find(m => m.medicineId === medicineId)?.name || 'Unknown';
  }

  // Group events by date
  function getSections(): DoseSection[] {
    const groups: Record<string, DoseEvent[]> = {};

    for (const event of doseEvents) {
      const date = new Date(event.timestamp).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      });
      if (!groups[date]) groups[date] = [];
      groups[date].push(event);
    }

    return Object.entries(groups).map(([title, data]) => ({ title, data }));
  }

  const sections = useMemo(() => getSections(), [doseEvents]);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>History</Text>

      {sections.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyTitle}>No dose history yet</Text>
          <Text style={styles.emptyText}>
            Your dose records will appear here
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.eventId}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item }) => {
            const config = ACTION_CONFIG[item.action];
            const time = new Date(item.timestamp).toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
            });

            return (
              <View style={styles.eventCard}>
                <View style={[styles.actionIcon, { backgroundColor: config.color + '20' }]}>
                  <Ionicons name={config.icon} size={20} color={config.color} />
                </View>
                <View style={styles.eventInfo}>
                  <Text style={styles.eventMedicine}>
                    {getMedicineName(item.medicineId)}
                  </Text>
                  <Text style={styles.eventAction}>{config.label}</Text>
                </View>
                <Text style={styles.eventTime}>{time}</Text>
              </View>
            );
          }}
        />
      )}
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
  list: {
    padding: spacing.md,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  eventInfo: {
    flex: 1,
  },
  eventMedicine: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  eventAction: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  eventTime: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
