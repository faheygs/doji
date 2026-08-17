import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import Animated, {
  FadeInDown,
  useSharedValue,
  withSpring,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import {
  Spacing,
  Radius,
  CategoryLetters,
  getCategoryColors,
  webScrollParentStyle,
} from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import { CategoryBadge } from '../../components/ui/CategoryBadge';
import { IconClose, IconCheck } from '../../components/icons/Icons';
import { useUserEvent } from '../../hooks/useUserEvent';
import { isExpired, secondsUntilFiresAt } from '../../utils/time';
import { backOrHome } from '../../lib/navigationReturn';
import { canAffordBuyIn } from '../../lib/participationGate';
import { useBuyInToday } from '../../hooks/useBuyIn';
import { useSparksBalance } from '../../hooks/useSparks';
import { SPARKS_BUY_IN_COST } from '../../constants/sparks';
import { LiveSparksPill } from '../../components/economy/SparksPill';
import { BuyInSheet } from '../../components/economy/BuyInSheet';
import { ChallengeTimer } from '../../components/challenge/ChallengeTimer';
import { challengeEntryHref } from '../../lib/routes';

export default function ChallengeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const catColors = useMemo(() => getCategoryColors(colors), [colors]);

  const { data: userEvent, isLoading, isError, refetch } = useUserEvent();
  const sparks = useSparksBalance();
  const { eligible, buyIn, isPending: buyInPending } = useBuyInToday(userEvent);
  const [buyInVisible, setBuyInVisible] = useState(false);

  const challenge = userEvent?.challenge;
  const challengeType = challenge?.type ?? 'photo';
  const category = challenge?.category ?? 'wild';
  const letter = CategoryLetters[category] ?? '?';
  const color = catColors[category] ?? colors.text;

  const firesAt = userEvent?.daily_event?.fires_at;
  const notYetLive = firesAt ? secondsUntilFiresAt(firesAt) > 0 : false;

  const isMissed = userEvent?.status === 'missed';
  const isBuyInOpen = userEvent?.status === 'buy_in_open';
  const isCompleted = userEvent?.status === 'completed';
  const isExpiredPending =
    userEvent?.status === 'pending' && userEvent && isExpired(userEvent.expires_at);

  const heroScale = useSharedValue(0.92);
  const heroStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heroScale.value }],
  }));

  useEffect(() => {
    if (isLoading) return;
    heroScale.value = withSpring(1, { damping: 14, stiffness: 160 });
    if (!isCompleted && !isMissed && !isExpiredPending && !notYetLive) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  }, [isLoading, isCompleted, isMissed, isExpiredPending, notYetLive]);

  const handleStartChallenge = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    router.push(challengeEntryHref(challengeType));
  }, [challengeType, router]);

  const handleClose = useCallback(() => {
    backOrHome(router);
  }, [router]);

  const handleBuyIn = async () => {
    try {
      await buyIn();
      setBuyInVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      requestAnimationFrame(handleStartChallenge);
    } catch (e) {
      Toast.show({
        type: 'error',
        text1: 'Buy-in failed',
        text2: e instanceof Error ? e.message : 'Try again',
      });
    }
  };

  const ctaLabel =
    challengeType === 'poll'
      ? 'Vote Now'
      : challengeType === 'task'
        ? 'Answer'
        : challengeType === 'format'
          ? 'Answer'
          : 'Open Camera';

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        header: {
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.sm,
          alignItems: 'flex-end',
        },
        closeButton: { padding: Spacing.sm },
        content: {
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.md,
          paddingBottom: Spacing.xxl,
          alignItems: 'center',
          gap: Spacing.lg,
        },
        categoryRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.md,
          alignSelf: 'flex-start',
        },
        heroRing: {
          width: 112,
          height: 112,
          borderRadius: Radius.full,
          borderWidth: 2,
          alignItems: 'center',
          justifyContent: 'center',
          marginVertical: Spacing.sm,
          backgroundColor: colors.chipBackground,
        },
        heroLetter: { letterSpacing: -2 },
        challengeText: {
          alignItems: 'center',
          gap: Spacing.sm,
          width: '100%',
        },
        title: { textAlign: 'center', letterSpacing: -0.8 },
        description: { textAlign: 'center', lineHeight: 22 },
        xpChip: {
          paddingHorizontal: Spacing.md,
          paddingVertical: 8,
          borderRadius: Radius.full,
          backgroundColor: colors.primaryPale,
        },
        stateBlock: {
          alignItems: 'center',
          gap: Spacing.sm,
          paddingHorizontal: Spacing.lg,
          paddingVertical: Spacing.xl,
        },
        stateCopy: { textAlign: 'center', lineHeight: 22 },
        doneMark: { marginBottom: Spacing.xs },
        footer: {
          paddingHorizontal: Spacing.lg,
          paddingBottom: Spacing.xl,
        },
        centered: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        },
        buyInBtn: {
          backgroundColor: colors.primary,
          borderRadius: Radius.sm,
          paddingVertical: Spacing.sm,
          paddingHorizontal: Spacing.lg,
          marginTop: Spacing.xs,
        },
      }),
    [colors],
  );

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, webScrollParentStyle]}>
        <View style={styles.centered}>
          <Text variant="body" color={colors.textSecondary}>
            Loading…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={[styles.container, webScrollParentStyle]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} hitSlop={16} style={styles.closeButton}>
            <IconClose size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <Text variant="headingLarge" style={{ marginBottom: Spacing.sm }}>Something went wrong</Text>
          <Text variant="body" color={colors.textSecondary} style={styles.stateCopy}>
            {"Couldn't load today's challenge."}
          </Text>
          <TouchableOpacity onPress={() => void refetch()} style={[styles.buyInBtn, { marginTop: Spacing.md }]}>
            <Text variant="label" color={colors.onPrimary}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!userEvent) {
    return (
      <SafeAreaView style={[styles.container, webScrollParentStyle]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} hitSlop={16} style={styles.closeButton}>
            <IconClose size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <Text variant="headingLarge" style={{ marginBottom: Spacing.sm }}>No challenge yet</Text>
          <Text variant="body" color={colors.textSecondary} style={styles.stateCopy}>
            {"Today's Doji hasn't dropped yet.\nCheck back soon."}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (notYetLive) {
    return (
      <SafeAreaView style={[styles.container, webScrollParentStyle]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} hitSlop={16} style={styles.closeButton}>
            <IconClose size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <Text variant="headingLarge" style={{ marginBottom: Spacing.sm }}>Not yet</Text>
          <Text variant="body" color={colors.textSecondary} style={styles.stateCopy}>
            This challenge hasn't dropped yet.{'\n'}Check back when the timer hits zero.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, webScrollParentStyle]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleClose} hitSlop={16} style={styles.closeButton}>
          <IconClose size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={webScrollParentStyle}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View entering={FadeInDown.springify()} style={styles.categoryRow}>
          <CategoryBadge category={category} />
        </Animated.View>

        <Animated.View style={[styles.heroRing, heroStyle, { borderColor: color }]}>
          <Text variant="displayLarge" style={[styles.heroLetter, { color }]}>
            {letter}
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).springify()} style={styles.challengeText}>
          <Text variant="displayMedium" style={styles.title}>
            {challenge?.title ?? 'Challenge'}
          </Text>
          {challenge?.description ? (
            <Text variant="body" color={colors.textSecondary} style={styles.description}>
              {challenge.description}
            </Text>
          ) : null}
        </Animated.View>

        {userEvent.status === 'pending' && !isExpiredPending ? (
          <ChallengeTimer
            expiresAt={userEvent.expires_at}
            onExpire={() => void refetch()}
            variant="ring"
          />
        ) : null}

        <Animated.View entering={FadeInDown.delay(220).springify()}>
          <View style={styles.xpChip}>
            <Text variant="label" color={colors.primary}>
              +{challenge?.xp_reward ?? 50} XP
            </Text>
          </View>
        </Animated.View>

        {(isMissed || isExpiredPending) && !isBuyInOpen ? (
          <Animated.View entering={FadeInDown.delay(320).springify()} style={styles.stateBlock}>
            <Text variant="headingLarge">Missed</Text>
            {eligible ? (
              canAffordBuyIn(sparks) ? (
                <TouchableOpacity
                  style={styles.buyInBtn}
                  onPress={() => { Haptics.selectionAsync(); setBuyInVisible(true); }}
                  disabled={buyInPending}
                  accessibilityRole="button"
                  accessibilityLabel={`Buy in for ${SPARKS_BUY_IN_COST} Sparks`}
                >
                  <Text variant="label" color={colors.onPrimary}>
                    Buy in · {SPARKS_BUY_IN_COST} Sparks
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={{ alignItems: 'center', gap: 4 }}>
                  <Text variant="body" color={colors.textSecondary} style={styles.stateCopy}>
                    Need {SPARKS_BUY_IN_COST} Sparks to rejoin.
                  </Text>
                  <LiveSparksPill compact />
                </View>
              )
            ) : (
              <Text variant="body" color={colors.textSecondary} style={styles.stateCopy}>
                Window closed.
              </Text>
            )}
          </Animated.View>
        ) : isBuyInOpen ? (
          <Animated.View entering={FadeInDown.delay(320).springify()} style={styles.stateBlock}>
            <Text variant="headingLarge">Buy-in open</Text>
            <Text variant="body" color={colors.textSecondary} style={styles.stateCopy}>
              Your Doji is open. Complete it to unlock the feed.
            </Text>
          </Animated.View>
        ) : isCompleted ? (
          <Animated.View entering={FadeInDown.delay(320).springify()} style={styles.stateBlock}>
            <View style={styles.doneMark}>
              <IconCheck size={28} color={colors.success} />
            </View>
            <Text variant="headingLarge">Done</Text>
            <Text variant="body" color={colors.success} style={styles.stateCopy}>
              Streak stays alive.
            </Text>
          </Animated.View>
        ) : null}
      </ScrollView>

      <Animated.View entering={FadeInDown.delay(420).springify()} style={styles.footer}>
        {(!isCompleted && (isBuyInOpen || (!isMissed && !isExpiredPending))) ? (
          <Button onPress={handleStartChallenge} fullWidth size="lg">
            {ctaLabel}
          </Button>
        ) : (
          <Button onPress={handleClose} variant="secondary" fullWidth size="lg">
            Back to feed
          </Button>
        )}
      </Animated.View>

      <BuyInSheet
        visible={buyInVisible}
        userEvent={userEvent ?? null}
        challenge={challenge ?? null}
        sparksBalance={sparks}
        onConfirm={handleBuyIn}
        onClose={() => setBuyInVisible(false)}
        loading={buyInPending}
      />
    </SafeAreaView>
  );
}
