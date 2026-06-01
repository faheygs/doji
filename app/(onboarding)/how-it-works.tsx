import React, { useMemo, useState } from 'react';
import { View, StyleSheet, SafeAreaView } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Spacing, Radius } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { IconBell, IconTimer, IconTrophy } from '@/components/icons/Icons';

const SLIDES = [
  {
    Icon: IconBell,
    title: 'You get notified',
    desc: 'Once a day, at the same moment worldwide, everyone gets the Doji challenge.',
  },
  {
    Icon: IconTimer,
    title: 'You have 10 minutes',
    desc: 'A 10-minute window opens. Miss it and your feed locks — you can buy back in with Sparks to save your streak.',
  },
  {
    Icon: IconTrophy,
    title: 'Earn XP and level up',
    desc: 'Every response earns XP and Sparks. Build streaks, unlock badges, and spend Sparks in the Shop.',
  },
] as const;

export default function HowItWorksScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];
  const SlideIcon = slide.Icon;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        dots: {
          flexDirection: 'row',
          justifyContent: 'center',
          gap: Spacing.sm,
          paddingTop: Spacing.xxl,
        },
        dot: { height: 8, borderRadius: Radius.full, backgroundColor: colors.border },
        body: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: Spacing.xl,
          gap: Spacing.lg,
        },
        iconWrap: {
          width: 100,
          height: 100,
          borderRadius: 30,
          backgroundColor: `${colors.primary}15`,
          alignItems: 'center',
          justifyContent: 'center',
        },
        footer: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
      }),
    [colors],
  );

  const onNext = () => {
    if (index < SLIDES.length - 1) {
      setIndex((i) => i + 1);
      return;
    }
    router.replace('/(onboarding)/notifications' as Href);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { width: i === index ? 24 : 8, backgroundColor: i === index ? colors.primary : colors.border },
            ]}
          />
        ))}
      </View>
      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <SlideIcon size={48} color={colors.primary} />
        </View>
        <Text variant="displayMedium" style={{ textAlign: 'center' }}>
          {slide.title}
        </Text>
        <Text variant="body" color={colors.textSecondary} style={{ textAlign: 'center', lineHeight: 24 }}>
          {slide.desc}
        </Text>
      </View>
      <View style={styles.footer}>
        <Button onPress={onNext} fullWidth size="lg">
          {index < SLIDES.length - 1 ? 'Next' : 'Continue'}
        </Button>
      </View>
    </SafeAreaView>
  );
}
