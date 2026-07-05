import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme';

interface BearMascotProps {
  size?: 'small' | 'large';
  message?: string;
}

export const BearMascot = React.memo(function BearMascot({ size = 'large', message }: BearMascotProps) {
  const bearSize = size === 'large' ? 100 : 60;
  const fontSize = size === 'large' ? 64 : 40;

  return (
    <View style={styles.container}>
      <View style={[styles.bearCircle, { width: bearSize, height: bearSize }]}>
        <Text style={{ fontSize }} accessible={false} importantForAccessibility="no">🧸</Text>
      </View>
      {message && (
        <View style={styles.speechBubble}>
          <Text style={styles.speechText}>{message}</Text>
          <View style={styles.speechTail} />
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 8,
  },
  bearCircle: {
    borderRadius: 999,
    backgroundColor: colors.accentLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  speechBubble: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border, // shadows don't render on web — keep a visible edge
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 8,
    maxWidth: 260,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  speechText: {
    fontSize: 15,
    color: colors.text,
    textAlign: 'center',
  },
  speechTail: {
    position: 'absolute',
    top: -8,
    alignSelf: 'center',
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.surface,
  },
});
