import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  Alert,
  TextInput,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '../theme';
import { useStore } from '../store';
import * as api from '../services/api';
import { Medicine, DoseEvent } from '../types';

export function CaregiverScreen() {
  const { caregiverCode, generateCaregiverCode } = useStore();
  const [generating, setGenerating] = useState(false);

  // Caregiver lookup state
  const [lookupCode, setLookupCode] = useState('');
  const [caregiverData, setCaregiverData] = useState<{
    medicines: Medicine[];
    recentDoses: DoseEvent[];
  } | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    try {
      await generateCaregiverCode();
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    }
    setGenerating(false);
  }

  async function handleShare() {
    if (!caregiverCode) return;
    await Share.share({
      message: `Use code "${caregiverCode}" in the Jer-Bear app to view my medicine schedule.`,
    });
  }

  async function handleLookup() {
    if (!lookupCode.trim()) return;
    setLookingUp(true);
    try {
      const data = await api.getCaregiverView(lookupCode.trim().toUpperCase());
      setCaregiverData(data);
    } catch (err) {
      Alert.alert('Error', 'Invalid caregiver code');
    }
    setLookingUp(false);
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Caregiver</Text>

        {/* Share your code section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="share-outline" size={20} color={colors.primary} />
            <Text style={styles.sectionTitle}>Share Your Schedule</Text>
          </View>
          <Text style={styles.sectionDesc}>
            Generate a code so caregivers can view your medicine schedule.
          </Text>

          {caregiverCode ? (
            <View style={styles.codeCard}>
              <Text style={styles.codeLabel}>Your Code</Text>
              <Text style={styles.code}>{caregiverCode}</Text>
              <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
                <Ionicons name="share" size={18} color={colors.textLight} />
                <Text style={styles.shareText}>Share Code</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.generateButton}
              onPress={handleGenerate}
              disabled={generating}
            >
              <Text style={styles.generateText}>
                {generating ? 'Generating...' : 'Generate Caregiver Code'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* View someone else's schedule */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="eye-outline" size={20} color={colors.primary} />
            <Text style={styles.sectionTitle}>View a Patient's Schedule</Text>
          </View>
          <Text style={styles.sectionDesc}>
            Enter a caregiver code to view someone's medicine schedule.
          </Text>

          <View style={styles.lookupRow}>
            <TextInput
              style={styles.lookupInput}
              value={lookupCode}
              onChangeText={setLookupCode}
              placeholder="Enter code"
              placeholderTextColor={colors.paused}
              autoCapitalize="characters"
              maxLength={6}
            />
            <TouchableOpacity
              style={styles.lookupButton}
              onPress={handleLookup}
              disabled={lookingUp}
            >
              <Text style={styles.lookupButtonText}>
                {lookingUp ? '...' : 'View'}
              </Text>
            </TouchableOpacity>
          </View>

          {caregiverData && (
            <View style={styles.caregiverView}>
              <Text style={styles.viewTitle}>
                Patient's Medicines ({caregiverData.medicines.length})
              </Text>
              {caregiverData.medicines.map(med => (
                <View key={med.medicineId} style={styles.medRow}>
                  <Text style={styles.medDot}>
                    {med.status === 'active' ? '🟢' : '⏸️'}
                  </Text>
                  <View>
                    <Text style={styles.medName}>{med.name}</Text>
                    <Text style={styles.medDosage}>
                      {med.quantity !== 1 ? `${med.quantity}x ` : ''}{med.strength} ({med.form})
                    </Text>
                  </View>
                </View>
              ))}

              <Text style={[styles.viewTitle, { marginTop: spacing.md }]}>
                Recent Activity
              </Text>
              {caregiverData.recentDoses.slice(0, 10).map(dose => {
                const med = caregiverData.medicines.find(
                  m => m.medicineId === dose.medicineId,
                );
                const time = new Date(dose.timestamp).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                });
                return (
                  <View key={dose.eventId} style={styles.activityRow}>
                    <Text style={styles.activityAction}>
                      {dose.action === 'taken' ? '✅' : dose.action === 'missed' ? '❌' : '➖'}
                    </Text>
                    <Text style={styles.activityText}>
                      {med?.name || 'Unknown'} — {dose.action} at {time}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.md,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  sectionDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  codeCard: {
    alignItems: 'center',
    backgroundColor: colors.surfaceWarm,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  codeLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  code: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 4,
    marginBottom: spacing.md,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
  },
  shareText: {
    color: colors.textLight,
    fontWeight: '600',
  },
  generateButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  generateText: {
    color: colors.textLight,
    fontSize: 16,
    fontWeight: '600',
  },
  lookupRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  lookupInput: {
    flex: 1,
    backgroundColor: colors.surfaceWarm,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lookupButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  lookupButtonText: {
    color: colors.textLight,
    fontWeight: '700',
    fontSize: 16,
  },
  caregiverView: {
    marginTop: spacing.md,
  },
  viewTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  medRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  medDot: {
    fontSize: 14,
  },
  medName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  medDosage: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
  },
  activityAction: {
    fontSize: 14,
  },
  activityText: {
    fontSize: 13,
    color: colors.textSecondary,
    flex: 1,
  },
});
