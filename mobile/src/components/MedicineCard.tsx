import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '../theme';
import { Medicine, Schedule } from '../types';
import { formatDoseQuantity, formatSchedule } from '../utils/format';

interface MedicineCardProps {
  medicine: Medicine;
  /** Only this medicine's schedules — pass a stable, pre-grouped array so React.memo is effective. */
  schedules: Schedule[];
  onPress: (medicineId: string) => void;
  onTogglePause: (medicineId: string) => void;
  onDelete: (medicineId: string, name: string) => void;
}

export const MedicineCard = React.memo(function MedicineCard({ medicine, schedules, onPress, onTogglePause, onDelete }: MedicineCardProps) {
  const isPaused = medicine.status === 'paused';

  return (
    <TouchableOpacity
      style={[styles.card, isPaused && styles.cardPaused]}
      onPress={() => onPress(medicine.medicineId)}
      activeOpacity={0.7}
      accessibilityLabel={`${medicine.name}, ${medicine.strength}, ${isPaused ? 'paused' : 'active'}`}
      accessibilityRole="button"
      accessibilityHint="Opens this medicine for editing"
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.pill}>
            <Text style={styles.pillEmoji} accessible={false} importantForAccessibility="no">💊</Text>
          </View>
          <View style={styles.info}>
            <View style={styles.nameRow}>
              <Text style={[styles.name, isPaused && styles.textPaused]}>
                {medicine.name}
              </Text>
              {isPaused && (
                <View style={styles.pausedBadge}>
                  <Text style={styles.pausedText}>PAUSED</Text>
                </View>
              )}
            </View>
            <Text style={[styles.dosage, isPaused && styles.textPaused]}>
              {formatDoseQuantity(medicine)}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => onTogglePause(medicine.medicineId)}
            style={styles.pauseButton}
            accessibilityLabel={isPaused ? 'Resume medicine' : 'Pause medicine'}
            accessibilityRole="button"
            accessibilityState={{ selected: isPaused }}
          >
            <Ionicons
              name={isPaused ? 'play-circle' : 'pause-circle'}
              size={28}
              color={isPaused ? colors.success : colors.paused}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onDelete(medicine.medicineId, medicine.name)}
            style={styles.deleteButton}
            accessibilityLabel={`Remove ${medicine.name}`}
            accessibilityRole="button"
          >
            <Ionicons name="trash-outline" size={24} color={colors.danger} />
          </TouchableOpacity>
        </View>

        {schedules.length > 0 && (
          <View style={styles.scheduleRow}>
            <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.scheduleText}>
              {schedules.map(formatSchedule).join(' | ')}
            </Text>
          </View>
        )}

        {medicine.instructions ? (
          <Text style={[styles.instructions, isPaused && styles.textPaused]}>
            {medicine.instructions}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: colors.borderStrong, // interactive card — >=3:1 border per WCAG 1.4.11
  },
  cardPaused: {
    // No opacity here — opacity-composited text fails WCAG AA contrast.
    // Paused state is signaled by border, background, text color, and badge.
    backgroundColor: colors.surfaceTint,
    borderColor: colors.paused,
  },
  content: {
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pill: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillEmoji: {
    fontSize: 20,
  },
  info: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  dosage: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  pauseButton: {
    padding: spacing.sm, // 28pt icon + 2x8pt padding = 44pt touch target
  },
  deleteButton: {
    padding: spacing.sm,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scheduleText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  instructions: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  textPaused: {
    color: colors.paused,
  },
  pausedBadge: {
    backgroundColor: colors.paused,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  pausedText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textLight,
  },
});
