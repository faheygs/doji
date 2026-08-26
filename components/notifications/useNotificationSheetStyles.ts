import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

export function useNotificationSheetStyles() {
  const { colors } = useTheme();
  return useMemo(
    () =>
      StyleSheet.create({
        flex: { flex: 1, backgroundColor: colors.background },
        header: {
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
          borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline,
        },
        closeButton: {
          width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
        },
        list: { padding: Spacing.md, paddingBottom: Spacing.sm, gap: Spacing.sm, flexGrow: 1 },
        card: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
        actions: { flexDirection: 'row', gap: Spacing.sm },
        challengeLeading: {
          width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryLight,
          alignItems: 'center', justifyContent: 'center',
        },
        badgeLeading: {
          width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryPale,
          alignItems: 'center', justifyContent: 'center',
        },
        suggestionApprovedLeading: {
          width: 40, height: 40, borderRadius: 20, backgroundColor: colors.successLight,
          alignItems: 'center', justifyContent: 'center',
        },
        suggestionRejectedLeading: {
          width: 40, height: 40, borderRadius: 20, backgroundColor: colors.chipBackground,
          alignItems: 'center', justifyContent: 'center',
        },
        empty: {
          alignItems: 'center', paddingTop: Spacing.xxl * 2,
          paddingHorizontal: Spacing.xl, gap: Spacing.sm,
        },
        emptySub: { textAlign: 'center', lineHeight: 20 },
        footer: {
          borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline,
          paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, paddingBottom: Spacing.lg,
        },
        dismissAction: {
          justifyContent: 'center', alignItems: 'center', width: 80,
          marginBottom: Spacing.sm, borderRadius: Radius.md, backgroundColor: colors.error,
        },
        dismissActionText: { color: colors.onPrimary, fontWeight: '600', fontSize: 13 },
      }),
    [colors],
  );
}
