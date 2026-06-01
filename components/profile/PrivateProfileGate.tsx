import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Spacing, Radius } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { IconLock } from '@/components/icons/Icons';
import type { ViewerFollowStatus } from '@/hooks/useFollows';
import { privateGateCopy } from '@/lib/privateProfileGate';

type Props = {
  followStatus: ViewerFollowStatus;
};

export function PrivateProfileGate({ followStatus }: Props) {
  const { colors } = useTheme();
  const copy = privateGateCopy(followStatus);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          marginHorizontal: Spacing.lg,
          marginTop: Spacing.xl,
          paddingVertical: Spacing.xl,
          paddingHorizontal: Spacing.lg,
          borderRadius: Radius.lg,
          backgroundColor: colors.surfaceElevated,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          gap: Spacing.md,
        },
        iconWrap: {
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: colors.primaryLight,
          alignItems: 'center',
          justifyContent: 'center',
        },
        textBlock: {
          alignItems: 'center',
          gap: Spacing.xs,
          maxWidth: 300,
        },
        title: {
          textAlign: 'center',
        },
        body: {
          textAlign: 'center',
          lineHeight: 22,
        },
      }),
    [colors],
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.iconWrap}>
        <IconLock size={26} color={colors.primary} />
      </View>
      <View style={styles.textBlock}>
        <Text variant="headingMedium" style={styles.title}>
          {copy.title}
        </Text>
        <Text variant="bodySmall" color={colors.textSecondary} style={styles.body}>
          {copy.body}
        </Text>
      </View>
    </View>
  );
}
