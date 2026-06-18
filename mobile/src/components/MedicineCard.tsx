import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '../theme';
import { Medicine, Schedule } from '../types';

interface MedicineCardProps {
  medicine: Medicine;
  schedules: Schedule[];
  onPress: () => void;
  onTogglePause: () => void;
}

export function MedicineCard({ medicine, schedules, onPress, onTogglePause }: MedicineCardProps) {
  const isPaused = medicine.status === 'paused';
  const activeSchedules = schedules.filter(s => s.medicineId === medicine.medicineId);

  function formatSchedule(schedule: Schedule): string {
    if (schedule.type === 'absolute' && schedule.times) {
      return schedule.times.map(t => {
        const [h, m] = t.split(':').map(Number);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const hour = h % 12 || 12;
        return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
      }).join(', ');
    }
    if (schedule.type === 'interval' && schedule.intervalHours) {
      return `Every ${schedule.intervalHours} hours`;
    }
    return '';
  }

  return (
    <TouchableOpacity
      style={[styles.card, isPaused && styles.cardPaused]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.pill}>
            <Text style={styles.pillEmoji}>💊</Text>
          </View>
          <View style={styles.info}>
            <Text style={[styles.name, isPaused && styles.textPaused]}>
              {medicine.name}
            </Text>
            <Text style={[styles.dosage, isPaused && styles.textPaused]}>
              {medicine.quantity !== 1 ? `${medicine.quantity} x ` : ''}{medicine.strength} ({medicine.form})
            </Text>
          </View>
          <TouchableOpacity onPress={onTogglePause} style={styles.pauseButton}>
            <Ionicons
              name={isPaused ? 'play-circle' : 'pause-circle'}
              size={28}
              color={isPaused ? colors.success : colors.paused}
            />
          </TouchableOpacity>
        </View>

        {activeSchedules.length > 0 && (
          <View style={styles.scheduleRow}>
            <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.scheduleText}>
              {activeSchedules.map(formatSchedule).join(' | ')}
            </Text>
          </View>
        )}

        {medicine.instructions ? (
          <Text style={[styles.instructions, isPaused && styles.textPaused]}>
            {medicine.instructions}
          </Text>
        ) : null}

        {isPaused && (
          <View style={styles.pausedBadge}>
            <Text style={styles.pausedText}>PAUSED</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

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
    borderColor: colors.border,
  },
  cardPaused: {
    opacity: 0.6,
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
  name: {
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
    padding: spacing.xs,
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
    position: 'absolute',
    top: 0,
    right: 0,
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
