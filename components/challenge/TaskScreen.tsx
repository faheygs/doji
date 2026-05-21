import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui/Text';
import { Typography, Spacing, Radius } from '../../constants/theme';
import { IconChevronLeft, IconCheck, IconCamera } from '../icons/Icons';
import type { Challenge } from '../../types/database';

type Props = {
  challenge: Challenge;
  onComplete: () => Promise<void>;
  onTakeProofPhoto: () => void;
  onBack: () => void;
  isCompleted: boolean;
};

export function TaskScreen({ challenge, onComplete, onTakeProofPhoto, onBack, isCompleted }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [submitting, setSubmitting] = useState(false);

  const handleComplete = async () => {
    setSubmitting(true);
    try {
      await onComplete();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.xl }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={16}>
          <IconChevronLeft size={24} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.content}>
          <View style={[styles.iconCircle, { backgroundColor: colors.primaryPale }]}>
            <IconCheck size={36} color={colors.primary} />
          </View>

          <Text variant="title" style={{ textAlign: 'center' }}>
            {challenge.title}
          </Text>

          {challenge.description ? (
            <Text variant="body" color={colors.textSecondary} style={{ textAlign: 'center', marginTop: Spacing.sm }}>
              {challenge.description}
            </Text>
          ) : null}

          <View style={[styles.xpPill, { backgroundColor: colors.primaryPale }]}>
            <Text variant="micro" color={colors.primary}>
              +{challenge.xp_reward} XP
            </Text>
          </View>

          {isCompleted ? (
            <View style={[styles.doneCard, { backgroundColor: colors.successLight }]}>
              <IconCheck size={22} color={colors.success} />
              <Text variant="subhead" color={colors.success} style={{ marginLeft: 8 }}>Task Completed</Text>
            </View>
          ) : (
            <>
              <TouchableOpacity
                onPress={handleComplete}
                disabled={submitting}
                style={[styles.ctaBtn, { backgroundColor: colors.primary }]}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Text variant="subhead" color={colors.onPrimary}>I did it!</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onTakeProofPhoto}
                style={[styles.secondaryBtn, { borderColor: colors.border }]}
                activeOpacity={0.8}
              >
                <IconCamera size={18} color={colors.textSecondary} />
                <Text variant="body" color={colors.textSecondary} style={{ marginLeft: 8 }}>
                  Take a proof photo (optional)
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, paddingHorizontal: Spacing.lg },
  backBtn: { marginBottom: Spacing.md },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  xpPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
    marginTop: Spacing.sm,
  },
  ctaBtn: {
    width: '100%',
    height: 56,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xl,
  },
  secondaryBtn: {
    width: '100%',
    height: 48,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  doneCard: {
    width: '100%',
    padding: Spacing.lg,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xl,
  },
});
