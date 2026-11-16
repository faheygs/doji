import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Radius, Spacing } from '../../constants/theme';
import { ProfileAvatar } from '../ui/ProfileAvatar';
import { Text } from '../ui/Text';
import type { DojiContributor } from './DojiContributorCredit';
import { ChallengeTypeGlyph } from './ChallengeTypeGlyph';
import type { ChallengeType, PollKind } from '../../types/database';

/** The caller owns eligibility and the authoritative timer; this is presentation only. */
export function DojiContributorHero({
  contributor,
  challengeType = 'photo',
  pollKind,
  title,
  description,
  xpReward,
  children,
}: {
  contributor: DojiContributor | null;
  challengeType?: ChallengeType;
  pollKind?: PollKind | null;
  title: string;
  description?: string | null;
  xpReward?: number | null;
  children?: ReactNode;
}) {
  return (
    <View style={styles.page}>
      <LinearGradient
        colors={['#512D91', '#703B87', '#A34226']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.spotlight}
      >
        {typeof xpReward === 'number' && Number.isFinite(xpReward) && xpReward > 0 ? (
          <View style={styles.xpBadge}>
            <Text
              variant="label"
              color="#512D91"
              accessibilityLabel={`${xpReward} experience points`}
            >
              {xpReward} XP
            </Text>
          </View>
        ) : null}
        <View style={styles.avatarRing}>
          {contributor ? (
            <ProfileAvatar profile={contributor} size={88} />
          ) : (
            <View
              style={styles.typeEmblem}
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
            >
              <ChallengeTypeGlyph
                type={challengeType}
                title={title}
                pollKind={pollKind}
                size={40}
                color="#FFFFFF"
              />
            </View>
          )}
        </View>
        {contributor ? (
          <View style={styles.identity}>
            <Text variant="body" color="#FFFFFF">
              Brought to you by
            </Text>
            <Text variant="displayLarge" color="#FFFFFF" style={styles.username}>
              @{contributor.username}
            </Text>
          </View>
        ) : null}
        <View style={styles.divider} />
        <View style={styles.prompt}>
          <Text variant="displayLarge" color="#FFFFFF" style={styles.question}>
            {title}
          </Text>
          {description ? (
            <Text variant="body" color="#FFFFFF" style={styles.description}>
              {description}
            </Text>
          ) : null}
        </View>
      </LinearGradient>
      {children ? <View style={styles.timer}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', gap: Spacing.md },
  spotlight: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.xl,
    gap: Spacing.md,
  },
  avatarRing: { padding: 7, borderRadius: 999, borderWidth: 2, borderColor: '#FFC98B' },
  typeEmblem: {
    width: 88,
    height: 88,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  xpBadge: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    backgroundColor: '#FFE4B5',
  },
  identity: { alignItems: 'center', gap: Spacing.xs, width: '100%' },
  username: { textAlign: 'center', fontWeight: '800' },
  divider: { width: 40, height: 2, backgroundColor: '#FFC98B' },
  prompt: { gap: Spacing.sm, width: '100%' },
  question: { textAlign: 'center', fontSize: 30, lineHeight: 36, letterSpacing: -0.5 },
  description: { textAlign: 'center', lineHeight: 24 },
  timer: {
    alignItems: 'center',
  },
});
