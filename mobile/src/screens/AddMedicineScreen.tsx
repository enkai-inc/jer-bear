import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '../theme';
import { useStore } from '../store';
import { showAlert } from '../utils/alert';
import { ScheduleType, MedicineForm } from '../types';
import { MedicinesStackParamList } from '../navigation/types';

const FORMS: { value: MedicineForm; label: string }[] = [
  { value: 'tablet', label: 'Tablet' },
  { value: 'capsule', label: 'Capsule' },
  { value: 'shot', label: 'Shot' },
  { value: 'powder', label: 'Powder' },
  { value: 'liquid', label: 'Liquid' },
  { value: 'drops', label: 'Drops' },
  { value: 'puff', label: 'Puff' },
  { value: 'other', label: 'Other' },
];

export function AddMedicineScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MedicinesStackParamList>>();
  const route = useRoute<RouteProp<MedicinesStackParamList, 'EditMedicine'>>();
  const medicines = useStore(s => s.medicines);
  const schedules = useStore(s => s.schedules);
  const addMedicine = useStore(s => s.addMedicine);
  const editMedicine = useStore(s => s.editMedicine);
  const removeMedicine = useStore(s => s.removeMedicine);
  const addSchedule = useStore(s => s.addSchedule);
  const editSchedule = useStore(s => s.editSchedule);

  const editingId = route.params?.medicineId;
  const existingMedicine = editingId
    ? medicines.find(m => m.medicineId === editingId)
    : null;
  const existingSchedules = editingId
    ? schedules.filter(s => s.medicineId === editingId)
    : [];

  const [name, setName] = useState(existingMedicine?.name || '');
  const [strength, setStrength] = useState(existingMedicine?.strength || '');
  const [quantity, setQuantity] = useState(String(existingMedicine?.quantity ?? '1'));
  const [form, setForm] = useState<MedicineForm>(existingMedicine?.form || 'tablet');
  const [instructions, setInstructions] = useState(existingMedicine?.instructions || '');

  // Schedule state
  const [scheduleType, setScheduleType] = useState<ScheduleType>(
    existingSchedules[0]?.type || 'absolute'
  );
  const [times, setTimes] = useState<string[]>(
    existingSchedules[0]?.times || ['09:00']
  );
  const [intervalHours, setIntervalHours] = useState(
    String(existingSchedules[0]?.intervalHours || 6)
  );

  const [saving, setSaving] = useState(false);

  function addTime() {
    setTimes([...times, '12:00']);
  }

  function removeTime(index: number) {
    setTimes(times.filter((_, i) => i !== index));
  }

  function updateTime(index: number, value: string) {
    const updated = [...times];
    // Basic validation: allow HH:MM format
    updated[index] = value;
    setTimes(updated);
  }

  async function handleSave() {
    if (!name.trim()) {
      showAlert('Missing Name', 'Please enter a medicine name.');
      return;
    }
    if (!strength.trim()) {
      showAlert('Missing Strength', 'Please enter the medicine strength (e.g. 10mg).');
      return;
    }

    // Validate schedule times
    if (scheduleType === 'absolute') {
      for (const time of times) {
        const match = time.match(/^(\d{1,2}):(\d{2})$/);
        if (!match) {
          showAlert('Invalid Time', `"${time}" is not valid. Use HH:MM format (e.g. 09:00, 14:30).`);
          return;
        }
        const h = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        if (h < 0 || h > 23 || m < 0 || m > 59) {
          showAlert('Invalid Time', `"${time}" is out of range. Hours: 0-23, Minutes: 0-59.`);
          return;
        }
      }
    }

    if (scheduleType === 'interval') {
      const hrs = parseFloat(intervalHours);
      if (isNaN(hrs) || hrs <= 0) {
        showAlert('Invalid Interval', 'Please enter a positive number of hours.');
        return;
      }
    }

    setSaving(true);
    try {
      let medicineId = editingId;
      let isNewMedicine = false;

      if (existingMedicine) {
        await editMedicine(editingId, {
          name: name.trim(),
          strength: strength.trim(),
          quantity: parseFloat(quantity) || 1,
          form,
          instructions: instructions.trim(),
        });
      } else {
        const med = await addMedicine({
          name: name.trim(),
          strength: strength.trim(),
          quantity: parseFloat(quantity) || 1,
          form,
          instructions: instructions.trim(),
        });
        medicineId = med.medicineId;
        isNewMedicine = true;
      }

      // Handle schedule
      const scheduleData = {
        type: scheduleType,
        times: scheduleType === 'absolute' ? times : [],
        intervalHours: scheduleType === 'interval' ? parseFloat(intervalHours) : undefined,
      };

      try {
        if (existingSchedules.length > 0) {
          await editSchedule(existingSchedules[0].scheduleId, scheduleData);
        } else {
          await addSchedule({
            medicineId: medicineId!,
            ...scheduleData,
          });
        }
      } catch (scheduleErr) {
        // If schedule creation fails for a new medicine, clean up the orphaned medicine
        if (isNewMedicine && medicineId) {
          await removeMedicine(medicineId).catch(() => {});
        }
        throw scheduleErr;
      }

      navigation.goBack();
    } catch (err) {
      showAlert('Error', (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
            accessibilityRole="button"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {existingMedicine ? 'Edit Medicine' : 'Add Medicine'}
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.label}>Medicine Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Aspirin"
            placeholderTextColor={colors.paused}
            accessibilityLabel="Medicine name"
          />

          <Text style={styles.label}>Strength (per unit)</Text>
          <TextInput
            style={styles.input}
            value={strength}
            onChangeText={setStrength}
            placeholder="e.g. 10mg, 40mg, 17g"
            placeholderTextColor={colors.paused}
            accessibilityLabel="Medicine strength"
          />

          <Text style={styles.label}>Quantity per dose</Text>
          <TextInput
            style={styles.input}
            value={quantity}
            onChangeText={setQuantity}
            placeholder="e.g. 1, 1.5, 2"
            placeholderTextColor={colors.paused}
            keyboardType="decimal-pad"
            accessibilityLabel="Quantity per dose"
          />

          <Text style={styles.label}>Form</Text>
          <View style={styles.unitPicker}>
            {FORMS.map(f => (
              <TouchableOpacity
                key={f.value}
                style={[styles.unitChip, form === f.value && styles.unitChipActive]}
                onPress={() => setForm(f.value)}
                accessibilityRole="button"
                accessibilityLabel={`Select ${f.label} form`}
                accessibilityState={{ selected: form === f.value }}
              >
                <Text
                  style={[
                    styles.unitChipText,
                    form === f.value && styles.unitChipTextActive,
                  ]}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Instructions (optional)</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={instructions}
            onChangeText={setInstructions}
            placeholder="e.g. Take with food"
            placeholderTextColor={colors.paused}
            multiline
            accessibilityLabel="Instructions"
          />

          <Text style={styles.sectionTitle}>Schedule</Text>

          <View style={styles.typeToggle}>
            <TouchableOpacity
              style={[
                styles.typeButton,
                scheduleType === 'absolute' && styles.typeButtonActive,
              ]}
              onPress={() => setScheduleType('absolute')}
              accessibilityRole="button"
              accessibilityLabel="Schedule by set times"
              accessibilityState={{ selected: scheduleType === 'absolute' }}
            >
              <Ionicons
                name="time-outline"
                size={18}
                color={scheduleType === 'absolute' ? colors.textLight : colors.text}
              />
              <Text
                style={[
                  styles.typeButtonText,
                  scheduleType === 'absolute' && styles.typeButtonTextActive,
                ]}
              >
                Set Times
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.typeButton,
                scheduleType === 'interval' && styles.typeButtonActive,
              ]}
              onPress={() => setScheduleType('interval')}
              accessibilityRole="button"
              accessibilityLabel="Schedule by interval"
              accessibilityState={{ selected: scheduleType === 'interval' }}
            >
              <Ionicons
                name="repeat-outline"
                size={18}
                color={scheduleType === 'interval' ? colors.textLight : colors.text}
              />
              <Text
                style={[
                  styles.typeButtonText,
                  scheduleType === 'interval' && styles.typeButtonTextActive,
                ]}
              >
                Every X Hours
              </Text>
            </TouchableOpacity>
          </View>

          {scheduleType === 'absolute' ? (
            <View>
              {times.map((time, index) => (
                <View key={index} style={styles.timeRow}>
                  <TextInput
                    style={[styles.input, styles.timeInput]}
                    value={time}
                    onChangeText={(v) => updateTime(index, v)}
                    placeholder="HH:MM"
                    placeholderTextColor={colors.paused}
                    accessibilityLabel={`Dose time ${index + 1}`}
                  />
                  {times.length > 1 && (
                    <TouchableOpacity
                      onPress={() => removeTime(index)}
                      style={styles.removeTimeBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityRole="button"
                      accessibilityLabel="Remove time"
                    >
                      <Ionicons name="close-circle" size={24} color={colors.danger} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              <TouchableOpacity
                onPress={addTime}
                style={styles.addTimeBtn}
                accessibilityRole="button"
                accessibilityLabel="Add another time"
              >
                <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                <Text style={styles.addTimeText}>Add another time</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <Text style={styles.label}>Every how many hours?</Text>
              <TextInput
                style={styles.input}
                value={intervalHours}
                onChangeText={setIntervalHours}
                placeholder="6"
                placeholderTextColor={colors.paused}
                keyboardType="numeric"
                accessibilityLabel="Interval in hours"
              />
            </View>
          )}

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
            accessibilityRole="button"
            accessibilityState={{ disabled: saving, busy: saving }}
          >
            <Text style={styles.saveButtonText}>
              {saving ? 'Saving...' : existingMedicine ? 'Update' : 'Add Medicine'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
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
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  multiline: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  unitPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  unitChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  unitChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  unitChipText: {
    fontSize: 13,
    color: colors.text,
  },
  unitChipTextActive: {
    color: colors.textLight,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  typeToggle: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  typeButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  typeButtonTextActive: {
    color: colors.textLight,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  timeInput: {
    flex: 1,
  },
  removeTimeBtn: {
    padding: spacing.xs,
  },
  addTimeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  addTimeText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.xl,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  saveButtonDisabled: {
    // Never signal disabled with opacity (WCAG AA contrast fails when composited)
    backgroundColor: colors.paused,
    shadowOpacity: 0,
    elevation: 0,
  },
  saveButtonText: {
    color: colors.textLight,
    fontSize: 17,
    fontWeight: '700',
  },
});
