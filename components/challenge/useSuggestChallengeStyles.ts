import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Radius, Shadows, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

export function useSuggestChallengeStyles() {
  const { colors } = useTheme();
  return useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        scrollContent: {
          paddingHorizontal: Spacing.lg,
          paddingBottom: Spacing.xxl,
          gap: Spacing.lg,
        },
        header: { paddingTop: Spacing.md, alignItems: 'center', gap: Spacing.xs },
        headerTitle: { textAlign: 'center', letterSpacing: -0.5 },
        headerSubtitle: { textAlign: 'center', lineHeight: 18, maxWidth: 300 },
        formCard: { gap: Spacing.lg, ...Shadows.card },
        typeHero: {
          width: 56,
          height: 56,
          borderRadius: 28,
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: 'center',
        },
        typeChipScroll: {
          flexGrow: 1,
          justifyContent: 'center',
          gap: Spacing.sm,
          paddingVertical: 2,
        },
        typeChip: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingVertical: 8,
          paddingHorizontal: Spacing.md,
          borderRadius: Radius.full,
          borderWidth: 1.5,
        },
        typeHint: { textAlign: 'center', lineHeight: 18, paddingHorizontal: Spacing.sm },
        sectionBlock: { gap: Spacing.sm },
        sectionLabel: { textAlign: 'center' },
        sectionHint: { textAlign: 'center', lineHeight: 18 },
        divider: {
          height: StyleSheet.hairlineWidth,
          backgroundColor: colors.border,
          marginVertical: -Spacing.xs,
        },
        bodyInput: {
          minHeight: 120,
          textAlignVertical: 'top',
          backgroundColor: colors.background,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radius.md,
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.md,
        },
        optionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
        optionInput: {
          flex: 1,
          borderRadius: Radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.sm + 2,
          color: colors.text,
          backgroundColor: colors.background,
        },
        ruleRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: Spacing.sm,
        },
        ruleChip: {
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.sm,
          borderRadius: Radius.full,
          borderWidth: 1.5,
        },
        formatControl: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: Spacing.sm,
          flexWrap: 'wrap',
        },
        letterInput: {
          width: 52,
          height: 52,
          borderRadius: Radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          color: colors.text,
          backgroundColor: colors.background,
          textAlign: 'center',
          fontSize: 22,
          fontWeight: '700',
        },
        stepperBtn: {
          width: 40,
          height: 40,
          borderRadius: Radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        },
        addOptionBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: Spacing.xs,
          paddingVertical: Spacing.xs,
        },
        iconBtn: { padding: Spacing.sm },
        tipCard: { ...Shadows.card },
        tipText: { textAlign: 'center', lineHeight: 20 },
      }),
    [colors],
  );
}
