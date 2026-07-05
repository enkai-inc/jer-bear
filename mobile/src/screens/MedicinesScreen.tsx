import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MedicinesStackParamList } from '../navigation/types';
import { colors, spacing, borderRadius } from '../theme';
import { MedicineCard } from '../components/MedicineCard';
import { useStore } from '../store';

export function MedicinesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MedicinesStackParamList>>();
  const { medicines, schedules, removeMedicine, toggleMedicinePause } = useStore();

  function handleDelete(medicineId: string, name: string) {
    Alert.alert(
      'Remove Medicine',
      `Are you sure you want to remove ${name}? This will also delete its schedules.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeMedicine(medicineId),
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Medicines</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('AddMedicine')}
          accessibilityLabel="Add medicine"
          accessibilityRole="button"
        >
          <Ionicons name="add" size={24} color={colors.textLight} />
        </TouchableOpacity>
      </View>

      {medicines.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>💊</Text>
          <Text style={styles.emptyTitle}>No medicines yet</Text>
          <Text style={styles.emptyText}>
            Tap the + button to add your first medicine
          </Text>
        </View>
      ) : (
        <FlatList
          data={medicines}
          keyExtractor={(item) => item.medicineId}
          contentContainerStyle={styles.list}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={5}
          renderItem={({ item }) => (
            <MedicineCard
              medicine={item}
              schedules={schedules}
              onPress={() =>
                navigation.navigate('EditMedicine', {
                  medicineId: item.medicineId,
                })
              }
              onTogglePause={() => toggleMedicinePause(item.medicineId)}
            />
          )}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
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
});
