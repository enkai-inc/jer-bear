import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing } from '../theme';

interface EmptyStateProps {
  /** Decorative emoji (hidden from screen readers). */
  icon: string;
  title: string;
  text: string;
}

/**
 * Shared empty-list placeholder (Medicines, History, ...).
 */
export function EmptyState({ icon, title, text }: EmptyStateProps) {
  return (
    <View style={styles.empty}>
      <Text
        style={styles.emptyIcon}
        accessible={false}
        importantForAccessibility="no"
      >
        {icon}
      </Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
