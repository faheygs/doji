import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

export function usePostCommentsSheetStyles() {
  const { colors } = useTheme();

  return useMemo(
    () =>
      StyleSheet.create({
        modalRoot: { flex: 1 },
        backdrop: {
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: 'rgba(0,0,0,0.25)',
        },
        sheet: {
          width: '100%',
          backgroundColor: colors.surface,
          borderTopLeftRadius: Radius.lg,
          borderTopRightRadius: Radius.lg,
          borderWidth: 1,
          borderBottomWidth: 0,
          borderColor: colors.border,
          overflow: 'hidden',
          flexDirection: 'column',
          alignSelf: 'stretch',
        },
        dragStrip: {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.hairline,
        },
        sheetHandle: {
          alignSelf: 'center',
          width: 40,
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.textTertiary,
          opacity: 0.45,
          marginTop: Spacing.sm,
          marginBottom: Spacing.xs,
        },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: Spacing.md,
          paddingBottom: Spacing.sm,
        },
        headerTitle: { flex: 1 },
        headerMeta: {
          fontVariant: ['tabular-nums'],
          marginRight: Spacing.sm,
        },
        ownerRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: Spacing.md,
          paddingBottom: Spacing.sm,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.hairline,
        },
        closeHit: { padding: Spacing.xs },
        body: { flex: 1, minHeight: 0, minWidth: 0 },
      }),
    [colors],
  );
}
