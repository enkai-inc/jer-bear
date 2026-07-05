import React from 'react';
import { Text, StyleSheet, StyleProp, TextStyle } from 'react-native';
import { spacing, typography } from '../theme';

interface ScreenTitleProps {
  children: React.ReactNode;
  /** Optional overrides (e.g. Home's centered brand title). */
  style?: StyleProp<TextStyle>;
}

/**
 * Canonical screen title — single source of truth for title typography
 * (theme.typography.title) across all tabs.
 */
export function ScreenTitle({ children, style }: ScreenTitleProps) {
  return (
    <Text style={[styles.title, style]} accessibilityRole="header">
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.title,
    paddingVertical: spacing.sm,
  },
});
