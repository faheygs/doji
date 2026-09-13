import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Radius, Spacing, webScrollParentStyle } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import type { Challenge } from '../../types/database';
import { Skeleton } from '../ui/Skeleton';

type SkeletonChallenge = Pick<Challenge, 'type' | 'poll_kind' | 'requires_photo' | 'requires_video'>;

function HeaderSkeleton() {
  return (
    <View style={styles.row}>
      <Skeleton width={42} height={42} radius={21} />
      <View style={styles.textGroup}>
        <Skeleton width="38%" height={12} />
        <Skeleton width="24%" height={10} />
      </View>
    </View>
  );
}

function ReactionSkeleton() {
  return (
    <View style={styles.reactions}>
      {[0, 1, 2, 3, 4].map((item) => (
        <Skeleton key={item} width={34} height={28} radius={Radius.full} />
      ))}
    </View>
  );
}

function PollSkeleton({ optionCount }: { optionCount: number }) {
  return (
    <>
      <Skeleton width="78%" height={22} />
      <Skeleton width="44%" height={12} />
      <View style={styles.optionGroup}>
        {Array.from({ length: optionCount }, (_, index) => (
          <Skeleton key={index} height={52} radius={Radius.md} />
        ))}
      </View>
    </>
  );
}

function TextSkeleton() {
  return (
    <>
      <Skeleton width="26%" height={11} />
      <Skeleton width="88%" height={20} />
      <Skeleton width="72%" height={20} />
      <Skeleton width="22%" height={11} />
      <Skeleton height={62} radius={Radius.md} />
    </>
  );
}

function PhotoSkeleton({ height }: { height: number }) {
  return (
    <>
      <Skeleton width="62%" height={11} />
      <Skeleton height={height} radius={0} />
      <Skeleton width="54%" height={12} />
    </>
  );
}

/** Cold-load placeholders mirror the active challenge and never replace cached feed data. */
export function FeedSkeleton({ challenge }: { challenge?: SkeletonChallenge | null }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isPoll = challenge?.type === 'poll';
  const isPhoto = challenge?.type === 'photo' || Boolean(
    challenge?.requires_photo || challenge?.requires_video,
  );
  const cards = isPoll ? 1 : 5;
  const optionCount = challenge?.poll_kind === 'wyr' ? 2 : 4;
  const photoHeight = challenge?.requires_video && !challenge?.requires_photo
    ? Math.round((width - Spacing.md * 4) * 9 / 16)
    : width - Spacing.md * 4;
  const themed = useMemo(
    () => ({ backgroundColor: colors.surfaceElevated, borderColor: colors.hairline }),
    [colors.hairline, colors.surfaceElevated],
  );

  return (
    <ScrollView
      style={webScrollParentStyle}
      contentContainerStyle={styles.wrap}
      showsVerticalScrollIndicator={false}
      pointerEvents="auto"
      accessibilityRole="progressbar"
      accessibilityLabel={`Loading ${isPoll ? 'shared challenge' : 'challenge posts'}`}
    >
      {Array.from({ length: cards }, (_, index) => (
        <View key={index} style={[styles.card, themed]} pointerEvents="none">
          <HeaderSkeleton />
          {isPoll ? (
            <PollSkeleton optionCount={optionCount} />
          ) : isPhoto ? (
            <PhotoSkeleton height={photoHeight} />
          ) : (
            <TextSkeleton />
          )}
          <ReactionSkeleton />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: Spacing.md, paddingBottom: Spacing.xxl },
  card: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
    padding: Spacing.md,
    gap: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  textGroup: { flex: 1, gap: Spacing.xs },
  optionGroup: { gap: Spacing.sm },
  reactions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: Spacing.xs,
  },
});
