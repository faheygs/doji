import React, { useMemo, useEffect } from 'react';
import { Modal, View, StyleSheet, useWindowDimensions, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Spacing } from '../../constants/theme';
import { BADGE_TIER_COLORS } from '../../constants/theme';

const PARTICLE_COLORS = [
  BADGE_TIER_COLORS.bronze,
  BADGE_TIER_COLORS.gold,
  BADGE_TIER_COLORS.diamond,
  '#4CAF50',
  '#FFFFFF',
];

const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  topPct: (i * 17) % 82,
  leftPct: (i * 23) % 94,
  size: i % 3 === 0 ? 10 : 6,
  round: i % 2 === 0,
  color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
  opacity: 0.55 + (i % 4) * 0.1,
}));

type Props = {
  visible: boolean;
  onRequestClose?: () => void;
  backgroundColor?: string;
  showParticles?: boolean;
  children: React.ReactNode;
  contentStyle?: ViewStyle;
};

export function FullScreenCelebrationShell({
  visible,
  onRequestClose,
  backgroundColor = '#000000',
  showParticles = true,
  children,
  contentStyle,
}: Props) {
  const { width, height } = useWindowDimensions();
  const backdropOpacity = useSharedValue(0);
  const contentScale = useSharedValue(0.88);
  const contentOpacity = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      backdropOpacity.value = 0;
      contentScale.value = 0.88;
      contentOpacity.value = 0;
      return;
    }
    backdropOpacity.value = withTiming(1, { duration: 280 });
    contentOpacity.value = withTiming(1, { duration: 320 });
    contentScale.value = withDelay(80, withSpring(1, { damping: 14, stiffness: 140 }));
  }, [visible, backdropOpacity, contentScale, contentOpacity]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ scale: contentScale.value }],
  }));

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor,
        },
        particles: {
          ...StyleSheet.absoluteFillObject,
          overflow: 'hidden',
        },
        particle: {
          position: 'absolute',
        },
        safe: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: Spacing.xl,
        },
        content: {
          width: '100%',
          maxWidth: 400,
          alignItems: 'center',
          gap: Spacing.md,
          paddingVertical: Spacing.lg,
        },
      }),
    [backgroundColor],
  );

  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="none"
      presentationStyle="overFullScreen"
      onRequestClose={onRequestClose}
    >
      <Animated.View style={[styles.root, backdropStyle]}>
        <View style={styles.particles} pointerEvents="none">
          {showParticles
            ? PARTICLES.map((p) => (
                <View
                  key={p.id}
                  style={[
                    styles.particle,
                    {
                      top: (height * p.topPct) / 100,
                      left: (width * p.leftPct) / 100,
                      width: p.size,
                      height: p.size,
                      borderRadius: p.round ? p.size / 2 : 2,
                      backgroundColor: p.color,
                      opacity: p.opacity,
                    },
                  ]}
                />
              ))
            : null}
        </View>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
          <Animated.View style={[styles.content, contentAnimStyle, contentStyle]}>{children}</Animated.View>
        </SafeAreaView>
      </Animated.View>
    </Modal>
  );
}
