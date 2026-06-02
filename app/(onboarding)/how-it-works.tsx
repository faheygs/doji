import React, { useMemo, useState } from 'react';
import { View, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Spacing, Radius } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { IconBell, IconTimer, IconTrophy, IconChevronLeft } from '@/components/icons/Icons';
import { IconSpark } from '@/components/icons/IconSpark';

const SLIDES = [
  {
    Icon: IconTrophy,
    title: 'Earn XP and Sparks',
    desc:
      'Every challenge you complete earns XP (which builds your level and streak) and Sparks — Doji's currency you can spend in the Shop.',
    showSparkHint: true,
  },
  {
    Icon: IconBell,
    title: 'Your daily challenge',
    desc:
      'Once a day, everyone gets the same Doji — a quick challenge like a photo, poll, or question. Your notification is your cue to jump in.',
    showSparkHint: false,
  },
  {
    Icon: IconTimer,
    title: 'A quick window to respond',
    desc:
      'You'll have a short window to complete each challenge. Miss it? No worries — you can spend Sparks to buy back in and keep your streak alive.',
    showSparkHint: true,
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
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: Spacing.md,
          paddingTop: Spacing.md,
          minHeight: 44,
        },
        backBtn: {
          padding: Spacing.sm,
        },
        dots: {
          flexDirection: 'row',
          justifyContent: 'center',
          gap: Spacing.sm,
          paddingTop: Spacing.lg,
        },
        dot: { height: 8, borderRadius: Radius.full, backgroundColor: colors.border },
        dotHit: { padding: 6 },
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
        sparkHint: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.sm,
          borderRadius: Radius.full,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        },
        sparkHintText: {
          fontWeight: '600',
          fontSize: 13,
        },
        footer: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
      }),
    [colors],
  );

  const goBack = () => {
    if (index > 0) {
      setIndex((i) => i - 1);
    } else {
      router.back();
    }
  };

  const onNext = () => {
    if (index < SLIDES.length - 1) {
      setIndex((i) => i + 1);
      return;
    }
    router.replace('/(onboarding)/notifications' as Href);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} hitSlop={16} style={styles.backBtn}>
          <IconChevronLeft size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <TouchableOpacity
            key={i}
            style={styles.dotHit}
            onPress={() => setIndex(i)}
            accessibilityRole="button"
            accessibilityLabel={`Go to slide ${i + 1}`}
          >
            <View
              style={[
                styles.dot,
                {
                  width: i === index ? 24 : 8,
                  backgroundColor: i === index ? colors.primary : colors.border,
                },
              ]}
            />
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <SlideIcon size={48} color={colors.primary} />
        </View>
        <Text variant="displayMedium" style={{ textAlign: 'center' }}>
          {slide.title}
        </Text>
        <Text
          variant="body"
          color={colors.textSecondary}
          style={{ textAlign: 'center', lineHeight: 24 }}
        >
          {slide.desc}
        </Text>
        {slide.showSparkHint ? (
          <View style={styles.sparkHint}>
            <IconSpark size={14} />
            <Text variant="label" color={colors.textSecondary} style={styles.sparkHintText}>
              Profile → Sparks · Shop
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Button onPress={onNext} fullWidth size="lg">
          {index < SLIDES.length - 1 ? 'Next' : 'Continue'}
        </Button>
      </View>
    </SafeAreaView>
  );
}
