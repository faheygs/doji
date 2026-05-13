import React, { useMemo, useState, useEffect } from 'react';
import { TouchableOpacity, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui/Text';
import { UserEvent, type ChallengeType } from '../../types/database';
import {
  isExpired,
  getBannerChallengeSecondsRemaining,
  formatMinutesSecondsCountdown,
} from '../../utils/time';
import { challengeKindLabel } from '../../lib/challengeDisplay';
import { ChallengeTypeGlyph } from './ChallengeTypeGlyph';

type Props = {
  userEvent: UserEvent | null;
};

export function ChallengeBanner({ userEvent }: Props) {
  const router = useRouter();
  const { colors } = useTheme();

  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!userEvent?.daily_event?.fires_at) {
      setSecondsLeft(0);
      return;
    }
    const de = userEvent.daily_event;
    const tick = () => setSecondsLeft(getBannerChallengeSecondsRemaining(de));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [userEvent?.daily_event?.fires_at, userEvent?.daily_event?.window_minutes]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrapper: {
          marginHorizontal: Spacing.md,
          marginBottom: Spacing.sm,
          borderRadius: Radius.lg,
          overflow: 'hidden',
        },
        banner: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: Spacing.md,
          paddingHorizontal: Spacing.md,
          gap: Spacing.sm,
        },
        bannerBody: { flex: 1, gap: 2 },
        noChallenge: {
          backgroundColor: colors.surfaceElevated,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radius.lg,
          marginHorizontal: Spacing.md,
          marginBottom: Spacing.sm,
          padding: Spacing.md,
        },
        missedBanner: {
          backgroundColor: colors.surfaceMuted,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radius.lg,
          marginHorizontal: Spacing.md,
          marginBottom: Spacing.sm,
          flexDirection: 'row',
          alignItems: 'center',
          padding: Spacing.md,
          gap: Spacing.sm,
        },
        iconCircle: {
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: 'rgba(255,255,255,0.15)',
          alignItems: 'center',
          justifyContent: 'center',
        },
        metaRow: {
          flexDirection: 'row',
          gap: Spacing.sm,
          marginTop: 4,
        },
        metaPill: {
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: Radius.full,
          backgroundColor: 'rgba(255,255,255,0.2)',
        },
        timer: { alignItems: 'flex-end', gap: 4 },
        timerDigits: {
          color: '#FFFFFF',
          fontVariant: ['tabular-nums'],
        },
        timerUrgent: {
          color: '#FFEB3B',
        },
      }),
    [colors],
  );

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/(app)/challenge');
  };

  if (!userEvent) {
    return (
      <View style={styles.noChallenge}>
        <Text variant="micro" color={colors.textTertiary}>NEXT CHALLENGE</Text>
        <Text variant="body" color={colors.textSecondary} style={{ marginTop: 4 }}>
          Check back soon
        </Text>
      </View>
    );
  }

  const challenge = userEvent.challenge;
  const challengeType = (challenge?.type ?? 'photo') as ChallengeType;
  const xpReward = challenge?.xp_reward ?? 50;
  const participants = challenge?.participant_count ?? 0;

  if (userEvent.status === 'completed' || userEvent.status === 'late') {
    return null;
  }

  if (userEvent.status === 'missed' || isExpired(userEvent.expires_at)) {
    return (
      <View style={styles.missedBanner}>
        <View style={{ flex: 1 }}>
          <Text variant="micro" color={colors.textSecondary}>MISSED</Text>
          <Text variant="body" color={colors.textSecondary}>Next drop coming soon</Text>
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.92} style={styles.wrapper}>
      <LinearGradient
        colors={[colors.xpGradientStart, colors.xpGradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.banner}
      >
        <View style={styles.iconCircle}>
          <ChallengeTypeGlyph type={challengeType} size={24} color="#FFFFFF" />
        </View>
        <View style={styles.bannerBody}>
          <Text variant="micro" style={{ color: 'rgba(255,255,255,0.8)' }}>
            {challengeKindLabel(challenge ?? null, challengeType)}
          </Text>
          <Text variant="subhead" style={{ color: '#FFFFFF' }} numberOfLines={1}>
            {challenge?.title ?? 'Challenge'}
          </Text>
          <View style={styles.metaRow}>
            <View style={styles.metaPill}>
              <Text variant="nano" style={{ color: '#FFFFFF' }}>+{xpReward} XP</Text>
            </View>
            {participants > 0 && (
              <View style={styles.metaPill}>
                <Text variant="nano" style={{ color: '#FFFFFF' }}>{participants} joined</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.timer}>
          <Text
            variant="label"
            style={[styles.timerDigits, secondsLeft > 0 && secondsLeft <= 60 ? styles.timerUrgent : null]}
          >
            {formatMinutesSecondsCountdown(secondsLeft)}
          </Text>
          <Text variant="subhead" style={{ color: '#FFFFFF' }}>
            GO →
          </Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}
