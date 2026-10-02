import React, { useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { IconChevronRight, IconShield } from '../icons/Icons';
import { KeyboardSafeSheet } from '../ui/KeyboardSafeSheet';
import { Text } from '../ui/Text';

type Props = {
  visible: boolean;
  onClose: () => void;
  onReport: () => void;
};

/**
 * The post overflow remains a neutral options boundary. Reporting is a
 * deliberate second action so the overflow control never silently submits or
 * drops a member directly into a policy category.
 */
export function PostOptionsSheet({ visible, onClose, onReport }: Props) {
  const reportAfterDismiss = useRef(false);
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        list: { gap: Spacing.sm },
        row: {
          minHeight: 68,
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.md,
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.sm,
          borderRadius: Radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
        },
        icon: {
          width: 42,
          height: 42,
          borderRadius: 21,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: `${colors.error}16`,
        },
        copy: { flex: 1, gap: 2 },
      }),
    [colors],
  );

  return (
    <KeyboardSafeSheet
      visible={visible}
      onClose={onClose}
      nativeDismissal
      onDismiss={() => {
        if (!reportAfterDismiss.current) return;
        reportAfterDismiss.current = false;
        onReport();
      }}
      title="Post options"
      heightFraction={0.42}
    >
      <View style={styles.list}>
        <Pressable
          style={styles.row}
          accessibilityRole="button"
          accessibilityLabel="Report post"
          accessibilityHint="Opens the report categories for this post"
          onPress={() => {
            void Haptics.selectionAsync();
            reportAfterDismiss.current = true;
            onClose();
          }}
        >
          <View style={styles.icon}>
            <IconShield size={22} color={colors.error} />
          </View>
          <View style={styles.copy}>
            <Text variant="subhead" color={colors.error}>Report post</Text>
            <Text variant="micro" color={colors.textSecondary}>
              Tell Doji about a safety or policy concern
            </Text>
          </View>
          <IconChevronRight size={21} color={colors.textTertiary} />
        </Pressable>
      </View>
    </KeyboardSafeSheet>
  );
}
