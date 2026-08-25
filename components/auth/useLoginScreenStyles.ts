import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

export function useLoginScreenStyles() {
  const { colors } = useTheme();
  return useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        keyboardView: { flex: 1 },
        header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
        scrollContent: {
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.xl,
          paddingBottom: Spacing.md,
          gap: Spacing.lg,
        },
        inputs: { gap: Spacing.md, marginTop: Spacing.sm },
        consents: { gap: 0 },
        switchMode: { alignSelf: 'flex-start', marginTop: Spacing.sm },
        footer: { paddingTop: Spacing.md, paddingBottom: Spacing.xl, width: '100%' },
      }),
    [colors.background],
  );
}
