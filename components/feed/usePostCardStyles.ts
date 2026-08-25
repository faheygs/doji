import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Radius, Shadows, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

export function usePostCardStyles() {
  const { colors } = useTheme();
  return useMemo(
    () => StyleSheet.create({
      card: {
        backgroundColor: colors.surfaceElevated,
        borderRadius: Radius.lg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.hairline,
        marginBottom: Spacing.lg,
        marginHorizontal: Spacing.md,
        overflow: 'hidden',
        ...Shadows.card,
      },
      youPill: {
        paddingHorizontal: Spacing.sm,
        paddingVertical: 3,
        borderRadius: Radius.full,
        backgroundColor: `${colors.primary}22`,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: `${colors.primary}55`,
      },
      header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm + 2,
      },
      userInfo: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
      nameContainer: { flex: 1, justifyContent: 'center' },
      challengeGlyphCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceMuted,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.hairline,
      },
      imageTap: { position: 'relative' },
      media: {
        width: '100%',
        alignSelf: 'stretch',
        aspectRatio: 1,
        backgroundColor: colors.surfaceElevated,
      },
      videoMedia: {
        width: '100%',
        alignSelf: 'stretch',
        aspectRatio: 16 / 9,
        backgroundColor: colors.mediaLetterbox,
      },
      frontThumbnailContainer: {
        position: 'absolute',
        bottom: Spacing.sm,
        right: Spacing.sm,
        borderRadius: 8,
        overflow: 'hidden',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.background,
      },
      frontThumbnail: { width: 72, height: 72 },
      lockMessage: { textAlign: 'center', lineHeight: 20 },
      lateBadge: {
        position: 'absolute',
        top: Spacing.sm,
        left: Spacing.sm,
        backgroundColor: `${colors.warning}26`,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: `${colors.warning}73`,
        paddingHorizontal: Spacing.sm,
        paddingVertical: 4,
        borderRadius: 6,
      },
      captionPlain: {
        marginHorizontal: Spacing.md,
        marginTop: Spacing.sm,
        marginBottom: Spacing.xs,
      },
      lockedBody: {
        width: '100%',
        alignSelf: 'stretch',
        aspectRatio: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.background,
        gap: Spacing.xs,
      },
      pollBodyWrap: { position: 'relative' },
    }),
    [colors],
  );
}
