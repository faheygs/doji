import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

export function useFormatScreenStyles() {
  const { colors } = useTheme();
  return useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.sm,
        },
        scroll: { flexGrow: 1, paddingBottom: Spacing.lg },
        content: {
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.xl,
          gap: Spacing.lg,
        },
        title: { textAlign: 'center' },
        ruleBanner: {
          borderRadius: Radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: `${colors.primary}55`,
          backgroundColor: `${colors.primary}12`,
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.sm,
        },
        inputWrap: { minHeight: 120 },
        validationOk: { color: colors.success },
        validationErr: { color: colors.error },
        footer: { width: '100%', paddingVertical: Spacing.lg },
        submitButton: {
          width: '100%',
          height: 52,
          borderRadius: Radius.md,
          alignItems: 'center',
          justifyContent: 'center',
        },
      }),
    [colors],
  );
}
