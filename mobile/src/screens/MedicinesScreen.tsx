import React, { useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MedicinesStackParamList } from '../navigation/types';
import { colors, spacing } from '../theme';
import { MedicineCard } from '../components/MedicineCard';
import { EmptyState } from '../components/EmptyState';
import { ScreenTitle } from '../components/ScreenTitle';
import { showConfirm } from '../utils/alert';
import { useStore } from '../store';
import { Schedule } from '../types';

const EMPTY_SCHEDULES: Schedule[] = [];

export function MedicinesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MedicinesStackParamList>>();
  const medicines = useStore(s => s.medicines);
  const schedules = useStore(s => s.schedules);
  const removeMedicine = useStore(s => s.removeMedicine);
  const toggleMedicinePause = useStore(s => s.toggleMedicinePause);

  // Group once so each card gets a stable array of only its own schedules
  // (keeps MedicineCard's React.memo effective)
  const schedulesByMedicine = useMemo(() => {
    const groups: Record<string, Schedule[]> = {};
    for (const schedule of schedules) {
      (groups[schedule.medicineId] ??= []).push(schedule);
    }
    return groups;
  }, [schedules]);

  const handleDelete = useCallback((medicineId: string, name: string) => {
    showConfirm(
      'Remove Medicine',
      `Are you sure you want to remove ${name}? This will also delete its schedules.`,
      () => {
        // Failure is surfaced via store.error (withErrorHandling rethrows)
        removeMedicine(medicineId).catch(() => {});
      },
      'Remove',
    );
  }, [removeMedicine]);

  const handleEdit = useCallback((medicineId: string) => {
    navigation.navigate('EditMedicine', { medicineId });
  }, [navigation]);

  const handleTogglePause = useCallback((medicineId: string) => {
    toggleMedicinePause(medicineId).catch(() => {});
  }, [toggleMedicinePause]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <ScreenTitle>Medicines</ScreenTitle>
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
        <EmptyState
          icon="💊"
          title="No medicines yet"
          text="Tap the + button to add your first medicine"
        />
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
              schedules={schedulesByMedicine[item.medicineId] ?? EMPTY_SCHEDULES}
              onPress={handleEdit}
              onTogglePause={handleTogglePause}
              onDelete={handleDelete}
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
});
