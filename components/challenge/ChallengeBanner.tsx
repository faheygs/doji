import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { TouchableOpacity, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import { Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui/Text';
import { UserEvent, type ChallengeType } from '../../types/database';
import {
  isExpired,
  getBannerChallengeSecondsRemaining,
  formatMinutesSecondsCountdown,
  secondsUntilFiresAt,
  parseDate,
} from '../../utils/time';
import { challengeKindLabel } from '../../lib/challengeDisplay';
import { ChallengeTypeGlyph } from './ChallengeTypeGlyph';
import { canBuyIn, canAffordBuyIn, isMissedOrExpiredPending, showSignupDayGraceBanner } from '../../lib/participationGate';
import { useAuthStore } from '../../stores/useAuthStore';
import { useSparksBalance } from '../../hooks/useSparks';
import { useBuyInToday } from '../../hooks/useBuyIn';
import { SPARKS_BUY_IN_COST } from '../../constants/sparks';
import { LiveSparksPill } from '../economy/SparksPill';
import { BuyInSheet } from '../economy/BuyInSheet';
import { useDemoStore } from '../../stores/useDemoStore';

const GRADIENT_START = { x: 0, y: 0 } as const;
const GRADIENT_END = { x: 1, y: 1 } as const;

type Props = {
  userEvent: UserEvent | null;
};

export function ChallengeBanner({ userEvent }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  const sparks = useSparksBalance();
  const profile = useAuthStore((s) => s.profile);
  const { eligible, buyIn, isPending } = useBuyInToday(userEvent);
  const [buyInVisible, setBuyInVisible] = useState(false);

  const [secondsUntil, setSecondsUntil] = useState<number>(() => {
    if (!userEvent?.daily_event?.fires_at) return 0;
    return secondsUntilFiresAt(userEvent.daily_event.fires_at);
  });

  const [secondsLeft, setSecondsLeft] = useState(0);
  const [buyInSecondsLeft, setBuyInSecondsLeft] = useState(0);

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

  useEffect(() => {
    if (userEvent?.status !== 'buy_in_open' || !userEvent?.expires_at) {
      setBuyInSecondsLeft(0);
      return;
    }
    const expiresAt = userEvent.expires_at;
    const compute = () =>
      Math.max(0, Math.floor((parseDate(expiresAt).getTime() - Date.now()) / 1000));
    setBuyInSecondsLeft(compute());
    const id = setInterval(() => setBuyInSecondsLeft(compute()), 1000);
    return () => clearInterval(id);
  }, [userEvent?.status, userEvent?.expires_at]);

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
          color: colors.onPrimary,
          fontSize: 64,
          fontWeight: '800',
          lineHeight: 72,
          letterSpacing: -2,
          fontVariant: ['tabular-nums'],
        },
        countdownLabel: {
          color: colors.onPrimary,
          opacity: 0.85,
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
        buyInBtn: {
          backgroundColor: colors.primary,
          borderRadius: Radius.sm,
          paddingVertical: Spacing.sm,
          paddingHorizontal: Spacing.md,
        },
        iconCircle: {
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: colors.onGradientPill,
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
          backgroundColor: colors.onGradientPillStrong,
        },
        timer: { alignItems: 'flex-end', gap: 4 },
        timerDigits: {
          color: colors.onPrimary,
          fontVariant: ['tabular-nums'],
        },
        timerUrgent: {
          color: colors.warning,
        },
        textOnPrimary: { color: colors.onPrimary },
        textOnPrimaryFaded: { color: colors.onPrimary, opacity: 0.85 as const },
        textOnPrimaryArrow: { color: colors.onPrimary },
        alignEnd: { alignItems: 'flex-end' as const, gap: 2 },
        flexOne: { flex: 1 },
      }),
    [colors],
  );

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/(app)/challenge');
  }, [router]);

  const handleBuyIn = useCallback(async () => {
    try {
      await buyIn();
      setBuyInVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push('/(app)/challenge');
    } catch (e) {
      const msg = e instanceof Error
        ? e.message
        : (e as { message?: string })?.message ?? 'Unknown error';
      if (__DEV__) console.error('[BuyIn] failed:', e);
      Toast.show({
        type: 'error',
        text1: 'Buy-in failed',
        text2: msg,
      });
    }
  }, [buyIn, router]);

  if (!userEvent) {
    return null;
  }

  const challenge = userEvent.challenge;
  const challengeType = (challenge?.type ?? 'photo') as ChallengeType;
  const xpReward = challenge?.xp_reward ?? 50;
  const participants = challenge?.participant_count ?? 0;

  // In demo mode: always show the active GO banner — no timer, no completed/countdown states
  if (isDemoMode) {
    return (
      <TouchableOpacity onPress={handlePress} activeOpacity={0.92} style={styles.wrapper}>
        <LinearGradient
          colors={[colors.xpGradientStart, colors.xpGradientEnd]}
          start={GRADIENT_START}
          end={GRADIENT_END}
          style={styles.banner}
        >
          <View style={styles.iconCircle}>
            <ChallengeTypeGlyph
              type={challengeType}
              title={challenge?.title}
              size={24}
              color={colors.onPrimary}
            />
          </View>
          <View style={styles.bannerBody}>
            <Text variant="micro" style={styles.textOnPrimaryFaded}>
              {challengeKindLabel(challenge ?? null, challengeType)}
            </Text>
            <Text variant="subhead" style={styles.textOnPrimary} numberOfLines={1}>
              {challenge?.title ?? 'Challenge'}
            </Text>
          </View>
          <Text variant="subhead" style={styles.textOnPrimaryArrow}>GO →</Text>
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  if (userEvent.status === 'completed' || userEvent.status === 'late') {
    return null;
  }

  if (showSignupDayGraceBanner(userEvent, profile)) {
    return (
      <TouchableOpacity onPress={handlePress} activeOpacity={0.92} style={styles.wrapper}>
        <LinearGradient
          colors={[colors.xpGradientStart, colors.xpGradientEnd]}
          start={GRADIENT_START}
          end={GRADIENT_END}
          style={styles.banner}
        >
          <View style={styles.bannerBody}>
            <Text variant="micro" style={styles.textOnPrimaryFaded}>
              WELCOME TO DOJI
            </Text>
            <Text variant="subhead" style={styles.textOnPrimary} numberOfLines={2}>
              Complete today&apos;s Doji — free on your first day
            </Text>
          </View>
          <Text variant="subhead" style={styles.textOnPrimaryArrow}>
            GO →
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  if (userEvent.status === 'buy_in_open' && !isExpired(userEvent.expires_at)) {
    return (
      <TouchableOpacity onPress={handlePress} activeOpacity={0.92} style={styles.wrapper}>
        <LinearGradient
          colors={[colors.xpGradientStart, colors.xpGradientEnd]}
          start={GRADIENT_START}
          end={GRADIENT_END}
          style={styles.banner}
        >
          <View style={styles.bannerBody}>
            <Text variant="micro" style={styles.textOnPrimaryFaded}>
              BUY-IN OPEN
            </Text>
            <Text variant="subhead" style={styles.textOnPrimary} numberOfLines={1}>
              Complete today&apos;s Doji
            </Text>
          </View>
          <View style={styles.timer}>
            <Text variant="label" style={styles.timerDigits}>
              {formatMinutesSecondsCountdown(buyInSecondsLeft)}
            </Text>
            <Text variant="subhead" style={styles.textOnPrimaryArrow}>
              GO →
            </Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  if (userEvent.status === 'missed' || isMissedOrExpiredPending(userEvent)) {
    const showBuyIn = canBuyIn(userEvent) && eligible;
    const canPay = canAffordBuyIn(sparks);

    return (
      <>
        <View style={styles.missedBanner}>
          <Text variant="body" color={colors.textSecondary} style={styles.flexOne}>
            Missed today&apos;s Doji
          </Text>
          {showBuyIn ? (
            canPay ? (
              <TouchableOpacity
                style={styles.buyInBtn}
                onPress={() => {
                  Haptics.selectionAsync();
                  setBuyInVisible(true);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Buy in for ${SPARKS_BUY_IN_COST} Sparks`}
              >
                <Text variant="label" color={colors.onPrimary}>
                  Buy in · {SPARKS_BUY_IN_COST} Sparks
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.alignEnd}>
                <Text variant="micro" color={colors.textTertiary}>
                  Need {SPARKS_BUY_IN_COST} Sparks
                </Text>
                <LiveSparksPill compact />
              </View>
            )
          ) : null}
        </View>
        <BuyInSheet
          visible={buyInVisible}
          userEvent={userEvent}
          challenge={challenge}
          sparksBalance={sparks}
          onConfirm={handleBuyIn}
          onClose={() => setBuyInVisible(false)}
          loading={isPending}
        />
      </>
    );
  }

  if (secondsUntil > 10) {
    return (
      <View style={styles.lockedBanner}>
        <View style={styles.lockedIconCircle}>
          <ChallengeTypeGlyph
            type={challengeType}
            title={challenge?.title}
            size={22}
            color={colors.textTertiary}
          />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="micro" color={colors.textTertiary}>CHALLENGE INCOMING</Text>
          <View style={styles.lockedTitleBar} />
        </View>
      </View>
    );
  }

  if (secondsUntil > 0) {
    return (
      <View style={styles.countdownWrapper}>
        <LinearGradient
          colors={[colors.xpGradientStart, colors.xpGradientEnd]}
          start={GRADIENT_START}
          end={GRADIENT_END}
          style={styles.countdownInner}
        >
          <Text style={styles.countdownDigit}>{secondsUntil}</Text>
          <Text variant="micro" style={styles.countdownLabel}>Challenge unlocking…</Text>
        </LinearGradient>
      </View>
    );
  }

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.92} style={styles.wrapper}>
      <LinearGradient
        colors={[colors.xpGradientStart, colors.xpGradientEnd]}
        start={GRADIENT_START}
        end={GRADIENT_END}
        style={styles.banner}
      >
        <View style={styles.iconCircle}>
          <ChallengeTypeGlyph
            type={challengeType}
            title={challenge?.title}
            size={24}
            color={colors.onPrimary}
          />
        </View>
        <View style={styles.bannerBody}>
          <Text variant="micro" style={styles.textOnPrimaryFaded}>
            {challengeKindLabel(challenge ?? null, challengeType)}
          </Text>
          <Text variant="subhead" style={styles.textOnPrimary} numberOfLines={1}>
            {challenge?.title ?? 'Challenge'}
          </Text>
          <View style={styles.metaRow}>
            <View style={styles.metaPill}>
              <Text variant="nano" style={styles.textOnPrimary}>+{xpReward} XP</Text>
            </View>
            {participants > 0 && (
              <View style={styles.metaPill}>
                <Text variant="nano" style={styles.textOnPrimary}>{participants} joined</Text>
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
          <Text variant="subhead" style={styles.textOnPrimaryArrow}>
            GO →
          </Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}
