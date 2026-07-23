import React, { useMemo } from 'react';
import { View, StyleSheet, SafeAreaView, Text as RNText, TouchableOpacity } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { Spacing, BrandWordmark } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';

const FEATURES = [
  'Daily challenges on your schedule',
  'Photo proof — no ghosting',
  'Streaks with people you trust',
  'Short window · stay honest',
];

export default function WelcomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        content: {
          flex: 1,
          paddingHorizontal: Spacing.lg,
          justifyContent: 'center',
          gap: Spacing.xxl,
        },
        brandBlock: {
          gap: Spacing.md,
        },
        rule: {
          width: 40,
          height: 3,
          borderRadius: 2,
          backgroundColor: colors.text,
          opacity: 0.35,
          marginTop: Spacing.xs,
        },
        tag: {
          letterSpacing: -0.4,
          marginTop: Spacing.sm,
        },
        sub: {
          marginTop: Spacing.xs,
          lineHeight: 22,
        },
        featureCol: {
          gap: Spacing.md,
        },
        featureRow: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: Spacing.md,
        },
        tick: {
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: colors.text,
          opacity: 0.6,
          marginTop: 6,
        },
        featureText: {
          flex: 1,
          lineHeight: 22,
        },
        footer: {
          paddingHorizontal: Spacing.lg,
          paddingBottom: Spacing.xl,
          gap: Spacing.md,
          alignItems: 'center',
        },
        terms: {
          textAlign: 'center',
          lineHeight: 18,
          paddingHorizontal: Spacing.md,
        },
      }),
    [colors],
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Animated.View entering={FadeInDown.delay(80).springify()} style={styles.brandBlock}>
          <RNText style={[BrandWordmark.hero, { color: colors.text }]}>Doji</RNText>
          <View style={styles.rule} />
          <Text variant="headingLarge" style={styles.tag}>
            Proof beats excuses.
          </Text>
          <Text variant="body" color={colors.textSecondary} style={styles.sub}>
            Private circle. Real receipts.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(260).springify()} style={styles.featureCol}>
          {FEATURES.map((line) => (
            <View key={line} style={styles.featureRow}>
              <View style={styles.tick} />
              <Text variant="body" color={colors.textSecondary} style={styles.featureText}>
                {line}
              </Text>
            </View>
          ))}
        </Animated.View>
      </View>

      <Animated.View entering={FadeInUp.delay(420).springify()} style={styles.footer}>
        <Button onPress={() => router.push('/(auth)/login')} fullWidth size="lg">
          Continue
        </Button>
        <TouchableOpacity onPress={() => router.push('/(auth)/terms')} activeOpacity={0.7}>
          <Text variant="bodySmall" color={colors.textTertiary} style={styles.terms}>
            By continuing you agree to our{' '}
            <Text variant="bodySmall" color={colors.link}>
              Terms of Use
            </Text>
            {' '}and Privacy Policy.
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
}
