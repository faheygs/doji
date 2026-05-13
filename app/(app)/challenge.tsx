import React, { useEffect, useMemo, useState } from 'react';
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
import { CountdownRing } from '../../components/challenge/CountdownRing';
import { IconClose, IconCheck } from '../../components/icons/Icons';
import { useUserEvent } from '../../hooks/useUserEvent';
import { getTimeRemaining, isExpired } from '../../utils/time';

const DEFAULT_WINDOW_SECONDS = 15 * 60;

export default function ChallengeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const catColors = useMemo(() => getCategoryColors(colors), [colors]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        header: {
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.sm,
          alignItems: 'flex-end',
        },
        closeButton: {
          padding: Spacing.sm,
        },
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
        difficultyRow: {
          flexDirection: 'row',
          gap: 5,
        },
        difficultyDot: {
          width: 7,
          height: 7,
          borderRadius: 4,
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
        heroLetter: {
          letterSpacing: -2,
        },
        challengeText: {
          alignItems: 'center',
          gap: Spacing.sm,
          width: '100%',
        },
        title: {
          textAlign: 'center',
          letterSpacing: -0.8,
        },
        description: {
          textAlign: 'center',
          lineHeight: 22,
        },
        requirementsRow: {
          flexDirection: 'row',
          gap: Spacing.sm,
          flexWrap: 'wrap',
          justifyContent: 'center',
        },
        reqChip: {
          paddingHorizontal: Spacing.md,
          paddingVertical: 8,
          borderRadius: Radius.full,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.hairline,
          backgroundColor: colors.chipBackground,
        },
        timerContainer: {
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 200,
          width: '100%',
        },
        stateBlock: {
          alignItems: 'center',
          gap: Spacing.sm,
          paddingHorizontal: Spacing.lg,
        },
        stateCopy: {
          textAlign: 'center',
          lineHeight: 22,
        },
        doneMark: {
          marginBottom: Spacing.xs,
        },
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

  const { data: userEvent, isLoading } = useUserEvent();
  const [timeLeft, setTimeLeft] = useState(0);

  // Derive total window from the actual event data rather than hardcoding
  const windowSeconds = useMemo(() => {
    if (!userEvent?.expires_at || !userEvent?.created_at) return DEFAULT_WINDOW_SECONDS;
    const created = new Date(userEvent.created_at).getTime();
    const expires = new Date(userEvent.expires_at).getTime();
    const diff = Math.floor((expires - created) / 1000);
    return diff > 0 ? diff : DEFAULT_WINDOW_SECONDS;
  }, [userEvent?.expires_at, userEvent?.created_at]);

  const heroScale = useSharedValue(0.92);
  const heroStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heroScale.value }],
  }));

  useEffect(() => {
    heroScale.value = withSpring(1, { damping: 14, stiffness: 160 });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, []);

  useEffect(() => {
    if (!userEvent) return;
    setTimeLeft(getTimeRemaining(userEvent.expires_at));

    const interval = setInterval(() => {
      const remaining = getTimeRemaining(userEvent.expires_at);
      setTimeLeft(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [userEvent]);

  const challengeType = challenge?.type ?? 'photo';

  const handleStartChallenge = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (challengeType === 'poll') {
      router.push('/(app)/poll');
    } else {
      router.push('/camera');
    }
  };

  const handleClose = () => {
    router.back();
  };

  const challenge = userEvent?.challenge;
  const category = challenge?.category ?? 'wild';
  const letter = CategoryLetters[category] ?? '?';
  const color = catColors[category] ?? colors.text;

  const isMissed =
    userEvent?.status === 'missed' || (userEvent && isExpired(userEvent.expires_at));
  const isCompleted =
    userEvent?.status === 'completed' || userEvent?.status === 'late';

  const ReqChip = ({ label }: { label: string }) => (
    <View style={styles.reqChip}>
      <Text variant="label" color={colors.textSecondary}>
        {label}
      </Text>
    </View>
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
      >
        <Animated.View entering={FadeInDown.springify()} style={styles.categoryRow}>
          <CategoryBadge category={category} />
          {challenge?.difficulty ? (
            <View style={styles.difficultyRow}>
              {Array.from({ length: 3 }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.difficultyDot,
                    {
                      backgroundColor:
                        i < challenge.difficulty ? color : colors.hairline,
                    },
                  ]}
                />
              ))}
            </View>
          ) : null}
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
          <Text variant="body" color={colors.textSecondary} style={styles.description}>
            {challenge?.description ?? 'You have one window — show up.'}
          </Text>
        </Animated.View>

        {challenge ? (
          <Animated.View
            entering={FadeInDown.delay(220).springify()}
            style={styles.requirementsRow}
          >
            {challenge.requires_photo ? <ReqChip label="PHOTO" /> : null}
            {challenge.requires_video ? <ReqChip label="VIDEO" /> : null}
            {challenge.requires_text ? <ReqChip label="TEXT" /> : null}
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInDown.delay(320).springify()} style={styles.timerContainer}>
          {isMissed ? (
            <View style={styles.stateBlock}>
              <Text variant="headingLarge">Missed</Text>
              <Text variant="body" color={colors.textSecondary} style={styles.stateCopy}>
                Window closed. Next challenge drops soon.
              </Text>
            </View>
          ) : isCompleted ? (
            <View style={styles.stateBlock}>
              <View style={styles.doneMark}>
                <IconCheck size={28} color={colors.success} />
              </View>
              <Text variant="headingLarge">Done</Text>
              <Text variant="body" color={colors.success} style={styles.stateCopy}>
                Streak stays alive.
              </Text>
            </View>
          ) : (
            <CountdownRing
              totalSeconds={windowSeconds}
              remainingSeconds={timeLeft}
              size={184}
              strokeWidth={6}
            />
          )}
        </Animated.View>
      </ScrollView>

      <Animated.View entering={FadeInDown.delay(420).springify()} style={styles.footer}>
        {!isMissed && !isCompleted ? (
          <Button onPress={handleStartChallenge} fullWidth size="lg">
            {challengeType === 'poll' ? 'Vote Now' : challengeType === 'task' ? "Let's Do It" : 'Capture proof'}
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
