import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, type DimensionValue, StyleSheet, type ViewStyle } from 'react-native';
import { Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

type Props = {
  width?: DimensionValue;
  height: number;
  radius?: number;
  style?: ViewStyle;
};

export function Skeleton({ width = '100%', height, radius = Radius.sm, style }: Props) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.48)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(0.7);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.48, duration: 650, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity, reduceMotion]);

  const base = useMemo<ViewStyle>(
    () => ({ width, height, borderRadius: radius, backgroundColor: colors.surfaceMuted }),
    [colors.surfaceMuted, height, radius, width],
  );

  return <Animated.View style={[styles.block, base, { opacity }, style]} />;
}

const styles = StyleSheet.create({ block: { overflow: 'hidden' } });
