import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

export function useFeedScreenStyles() {
  const { colors } = useTheme();
  return useMemo(
    () => StyleSheet.create({
      container: { flex: 1, backgroundColor: colors.background },
      listHeader: { gap: Spacing.sm, paddingBottom: Spacing.xs },
      feedTopBar: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.hairline,
        paddingBottom: Spacing.sm,
      },
      feedTopInner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.md,
        paddingTop: Spacing.xs,
      },
      topActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
      actionHit: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xs },
      bellWrap: { position: 'relative' },
      badge: {
        position: 'absolute',
        top: 2,
        right: -2,
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        paddingHorizontal: 5,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.error,
        pointerEvents: 'none',
      },
      badgeText: { color: colors.onPrimary, fontSize: 11, fontWeight: '700' },
      list: { paddingBottom: Spacing.xxl },
      empty: {
        alignItems: 'center',
        paddingTop: Spacing.xxl * 2,
        gap: Spacing.md,
        paddingHorizontal: Spacing.xl,
      },
      emptyText: { textAlign: 'center', lineHeight: 22 },
      audienceWrap: {
        flexDirection: 'row',
        marginHorizontal: Spacing.md,
        marginBottom: Spacing.xs,
        padding: 3,
        borderRadius: Radius.md,
        backgroundColor: colors.chipBackground,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
      },
      audienceSeg: {
        flex: 1,
        paddingVertical: Spacing.sm,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: Radius.sm,
      },
      audienceSegActive: {
        backgroundColor: colors.surfaceElevated,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
      },
    }),
    [colors],
  );
}
