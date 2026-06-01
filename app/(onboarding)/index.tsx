import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, SafeAreaView } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Spacing, Radius } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { IconDojiMark } from '@/components/icons/Icons';

export default function OnboardingSplashScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  useEffect(() => {
    const t = setTimeout(() => {
      router.replace('/(onboarding)/how-it-works' as Href);
    }, 1800);
    return () => clearTimeout(t);
  }, [router]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: Spacing.xl,
        },
        logoWrap: {
          width: 96,
          height: 96,
          borderRadius: 28,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: Spacing.lg,
        },
        tagline: { textAlign: 'center', marginTop: Spacing.sm },
        dots: {
          position: 'absolute',
          bottom: 60,
          flexDirection: 'row',
          gap: 6,
        },
        dot: { height: 6, borderRadius: Radius.full, backgroundColor: colors.border },
      }),
    [colors],
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.logoWrap}>
        <IconDojiMark size={52} color="#FFFFFF" />
      </View>
      <Text variant="displayMedium" style={{ letterSpacing: -1, fontSize: 42, fontWeight: '900' }}>
        doji
      </Text>
      <Text variant="body" color={colors.textSecondary} style={styles.tagline}>
        One challenge. Ten minutes. Every day.
      </Text>
      <View style={styles.dots}>
        <View style={[styles.dot, { width: 20, backgroundColor: colors.primary }]} />
        <View style={[styles.dot, { width: 6 }]} />
        <View style={[styles.dot, { width: 6 }]} />
      </View>
    </SafeAreaView>
  );
}
