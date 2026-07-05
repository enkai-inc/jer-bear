import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Animated } from 'react-native';
import { colors, spacing, borderRadius } from '../theme';
import { Medicine } from '../types';

interface DoseAlertModalProps {
  visible: boolean;
  medicine: Medicine | null;
  scheduledTime: string;
  onTaken: () => void;
  onSnooze: () => void;
  onDismiss: () => void;
}

export const DoseAlertModal = React.memo(function DoseAlertModal({
  visible,
  medicine,
  scheduledTime,
  onTaken,
  onSnooze,
  onDismiss,
}: DoseAlertModalProps) {
  if (!medicine) return null;

  const timeStr = new Date(scheduledTime).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.bearIcon}>🧸</Text>
          <Text style={styles.title}>Time for your medicine!</Text>
          <Text style={styles.medicineName}>{medicine.name}</Text>
          <Text style={styles.dosage}>
            {medicine.quantity !== 1 ? `${medicine.quantity} x ` : ''}{medicine.strength} ({medicine.form})
          </Text>
          {medicine.instructions ? (
            <Text style={styles.instructions}>{medicine.instructions}</Text>
          ) : null}
          <Text style={styles.time}>Scheduled at {timeStr}</Text>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.takenButton]}
              onPress={onTaken}
              accessibilityRole="button"
              accessibilityLabel="Mark dose as taken"
            >
              <Text style={styles.takenText}>Taken</Text>
            </TouchableOpacity>

            <View style={styles.secondaryActions}>
              <TouchableOpacity
                style={[styles.button, styles.snoozeButton]}
                onPress={onSnooze}
                accessibilityRole="button"
                accessibilityLabel="Snooze for 5 minutes"
              >
                <Text style={styles.snoozeText}>Snooze 5 min</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.dismissButton]}
                onPress={onDismiss}
                accessibilityRole="button"
                accessibilityLabel="Dismiss reminder"
              >
                <Text style={styles.dismissText}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modal: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  bearIcon: {
    fontSize: 56,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  medicineName: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  dosage: {
    fontSize: 18,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  instructions: {
    fontSize: 14,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  time: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  actions: {
    width: '100%',
    gap: spacing.sm,
  },
  button: {
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  takenButton: {
    backgroundColor: colors.success,
  },
  takenText: {
    color: colors.textLight,
    fontSize: 18,
    fontWeight: '700',
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  snoozeButton: {
    flex: 1,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  snoozeText: {
    color: colors.primaryDark,
    fontSize: 15,
    fontWeight: '600',
  },
  dismissButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dismissText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
});
