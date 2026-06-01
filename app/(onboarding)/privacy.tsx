import React, { useMemo, useState } from 'react';
import { View, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import { Spacing, Radius } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { IconGlobe, IconLock } from '@/components/icons/Icons';
import { useAuthStore } from '@/stores/useAuthStore';
import { FEED_TAB_HREF } from '@/lib/navigationReturn';
import { safeReplace } from '@/lib/routes';

type PrivacyChoice = 'public' | 'private';

export default function OnboardingPrivacyScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const [choice, setChoice] = useState<PrivacyChoice>(
    useAuthStore.getState().profile?.is_private ? 'private' : 'public',
  );
  const [saving, setSaving] = useState(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.xxl,
          paddingBottom: Spacing.xxl,
          gap: Spacing.lg,
        },
        option: {
          padding: Spacing.lg,
          borderRadius: Radius.lg,
          borderWidth: 2,
          gap: Spacing.sm,
        },
        optionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        radio: {
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: 2,
          alignItems: 'center',
          justifyContent: 'center',
        },
        radioInner: { width: 12, height: 12, borderRadius: 6 },
        footer: { marginTop: 'auto' as const },
      }),
    [colors],
  );

  const finish = async () => {
    setSaving(true);
    try {
      await updateProfile({
        is_private: choice === 'private',
        onboarding_completed_at: new Date().toISOString(),
      });
      safeReplace(router, FEED_TAB_HREF);
    } catch {
      Toast.show({ type: 'error', text1: 'Could not finish setup' });
    } finally {
      setSaving(false);
    }
  };

  const renderOption = (
    id: PrivacyChoice,
    title: string,
    description: string,
    Icon: React.ComponentType<{ size?: number; color: string }>,
  ) => {
    const selected = choice === id;
    return (
      <TouchableOpacity
        key={id}
        activeOpacity={0.9}
        onPress={() => setChoice(id)}
        style={[
          styles.option,
          {
            borderColor: selected ? colors.primary : colors.border,
            backgroundColor: selected ? `${colors.primary}0D` : colors.surface,
          },
        ]}
      >
        <View style={styles.optionHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            <Icon size={20} color={selected ? colors.primary : colors.textSecondary} />
            <Text variant="subhead" color={selected ? colors.primary : colors.text}>
              {title}
            </Text>
          </View>
          <View style={[styles.radio, { borderColor: selected ? colors.primary : colors.border }]}>
            {selected ? <View style={[styles.radioInner, { backgroundColor: colors.primary }]} /> : null}
          </View>
        </View>
        <Text variant="body" color={colors.textSecondary} style={{ lineHeight: 22 }}>
          {description}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text variant="displayMedium">Who can see your responses?</Text>
      {renderOption(
        'public',
        'Public',
        'Anyone on Doji can see your responses and follow you.',
        IconGlobe,
      )}
      {renderOption(
        'private',
        'Private',
        'Only approved followers can see your responses.',
        IconLock,
      )}
      <View style={styles.footer}>
        <Button onPress={() => void finish()} loading={saving} fullWidth size="lg">
          Let's go
        </Button>
      </View>
    </SafeAreaView>
  );
}
