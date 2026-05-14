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
  secondsUntilFiresAt,
} from '../../utils/time';
import { challengeKindLabel } from '../../lib/challengeDisplay';
import { ChallengeTypeGlyph } from './ChallengeTypeGlyph';
import { IconCamera } from '../icons/Icons';

type Props = {
  userEvent: UserEvent | null;
};

export function ChallengeBanner({ userEvent }: Props) {
  const router = useRouter();
  const { colors } = useTheme();

  // Tracks seconds until fires_at (positive = future, negative = past)
  const [secondsUntil, setSecondsUntil] = useState<number>(() => {
    if (!userEvent?.daily_event?.fires_at) return 0;
    return secondsUntilFiresAt(userEvent.daily_event.fires_at);
  });

  // Tracks window-expiry countdown for the live banner
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!userEvent?.daily_event?.fires_at) {
      setSecondsUntil(0);
      setSecondsLeft(0);
      return;
    }
    const de = userEvent.daily_event;
    const tick = () => {
      setSecondsUntil(secondsUntilFiresAt(de.fires_at));
      setSecondsLeft(getBannerChallengeSecondsRemaining(de));
    };
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
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
        },
        lockedBanner: {
          backgroundColor: colors.surfaceElevated,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radius.lg,
          marginHorizontal: Spacing.md,
          marginBottom: Spacing.sm,
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: Spacing.md,
          paddingHorizontal: Spacing.md,
          gap: Spacing.sm,
        },
        lockedIconCircle: {
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: colors.chipBackground,
          alignItems: 'center',
          justifyContent: 'center',
        },
        lockedTitleBar: {
          height: 14,
          width: 120,
          borderRadius: Radius.sm,
          backgroundColor: colors.border,
          marginTop: 4,
        },
        countdownWrapper: {
          marginHorizontal: Spacing.md,
          marginBottom: Spacing.sm,
          borderRadius: Radius.lg,
          overflow: 'hidden',
        },
        countdownInner: {
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: Spacing.lg,
          paddingHorizontal: Spacing.md,
          gap: Spacing.xs,
        },
        countdownDigit: {
          color: '#FFFFFF',
          fontSize: 64,
          fontWeight: '800',
          lineHeight: 72,
          letterSpacing: -2,
          fontVariant: ['tabular-nums'],
        },
        countdownLabel: {
          color: 'rgba(255,255,255,0.8)',
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

  // No event row at all
  if (!userEvent) {
    return (
      <View style={styles.noChallenge}>
        <View style={[styles.lockedIconCircle, { opacity: 0.4 }]}>
          <IconCamera size={22} color={colors.textTertiary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="micro" color={colors.textTertiary}>TODAY'S CHALLENGE</Text>
          <Text variant="body" color={colors.textSecondary} style={{ marginTop: 2 }}>
            Coming soon...
          </Text>
        </View>
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

  // Locked — fires_at is more than 10 seconds away
  if (secondsUntil > 10) {
    return (
      <View style={styles.lockedBanner}>
        <View style={styles.lockedIconCircle}>
          <ChallengeTypeGlyph type={challengeType} size={22} color={colors.textTertiary} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="micro" color={colors.textTertiary}>CHALLENGE INCOMING</Text>
          <View style={styles.lockedTitleBar} />
        </View>
      </View>
    );
  }

  // Countdown — fires_at is 0–10 seconds away
  if (secondsUntil > 0) {
    return (
      <View style={styles.countdownWrapper}>
        <LinearGradient
          colors={[colors.xpGradientStart, colors.xpGradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.countdownInner}
        >
          <Text style={styles.countdownDigit}>{secondsUntil}</Text>
          <Text variant="micro" style={styles.countdownLabel}>Challenge unlocking…</Text>
        </LinearGradient>
      </View>
    );
  }

  // Live — fires_at has passed, challenge is active
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
