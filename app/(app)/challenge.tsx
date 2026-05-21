import React, { useEffect, useMemo } from 'react';
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

export default function ChallengeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const catColors = useMemo(() => getCategoryColors(colors), [colors]);

  const { data: userEvent, isLoading } = useUserEvent();

  const challenge = userEvent?.challenge;
  const challengeType = challenge?.type ?? 'photo';
  const category = challenge?.category ?? 'wild';
  const letter = CategoryLetters[category] ?? '?';
  const color = catColors[category] ?? colors.text;

  const firesAt = userEvent?.daily_event?.fires_at;
  const notYetLive = firesAt ? secondsUntilFiresAt(firesAt) > 0 : false;

  const isMissed =
    userEvent?.status === 'missed' || (userEvent && isExpired(userEvent.expires_at));
  const isCompleted =
    userEvent?.status === 'completed' || userEvent?.status === 'late';

  const heroScale = useSharedValue(0.92);
  const heroStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heroScale.value }],
  }));

  useEffect(() => {
    heroScale.value = withSpring(1, { damping: 14, stiffness: 160 });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, []);

  const handleStartChallenge = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (challengeType === 'poll') {
      router.push('/(app)/poll');
    } else if (challengeType === 'task') {
      router.push('/(app)/task');
    } else {
      router.push('/(app)/camera');
    }
  };

  const handleClose = () => {
    backOrHome(router);
  };

  const ctaLabel =
    challengeType === 'poll'
      ? 'Vote Now'
      : challengeType === 'task'
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

        <Animated.View entering={FadeInDown.delay(220).springify()}>
          <View style={styles.xpChip}>
            <Text variant="label" color={colors.primary}>
              +{challenge?.xp_reward ?? 50} XP
            </Text>
          </View>
        </Animated.View>

        {isMissed ? (
          <Animated.View entering={FadeInDown.delay(320).springify()} style={styles.stateBlock}>
            <Text variant="headingLarge">Missed</Text>
            <Text variant="body" color={colors.textSecondary} style={styles.stateCopy}>
              Window closed. Next challenge drops soon.
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
        {!isMissed && !isCompleted ? (
          <Button onPress={handleStartChallenge} fullWidth size="lg">
            {ctaLabel}
          </Button>
        ) : (
          <Button onPress={handleClose} variant="secondary" fullWidth size="lg">
            Back to feed
          </Button>
        )}
      </Animated.View>
    </SafeAreaView>
  );
}
