import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui/Text';
import { formatCountdown } from '../../utils/time';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  totalSeconds: number;
  remainingSeconds: number;
  size?: number;
  strokeWidth?: number;
};

export function CountdownRing({
  totalSeconds,
  remainingSeconds,
  size = 160,
  strokeWidth = 8,
}: Props) {
  const { colors } = useTheme();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeTotal = Math.max(1, totalSeconds);
  const clampedRemaining = Math.max(0, Math.min(remainingSeconds, safeTotal));
  const progress = useSharedValue(clampedRemaining / safeTotal);

  useEffect(() => {
    const target = clampedRemaining / safeTotal;
    progress.value = withTiming(target, {
      duration: 1000,
      easing: Easing.linear,
    });
  }, [clampedRemaining, progress, safeTotal]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  const isUrgent = clampedRemaining <= 60;
  const strokeColor = isUrgent ? colors.error : colors.text;

  return (
    <View
      style={[styles.container, { width: size, height: size }]}
      accessible
      accessibilityRole="timer"
      accessibilityLabel={`${formatCountdown(clampedRemaining)} remaining`}
      accessibilityLiveRegion={isUrgent ? 'polite' : 'none'}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.hairline}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          strokeLinecap="round"
          transform={`rotate(-90, ${size / 2}, ${size / 2})`}
        />
      </Svg>
      <View style={styles.labelContainer}>
        <Text variant="displayMedium" color={isUrgent ? colors.error : colors.text}>
          {formatCountdown(clampedRemaining)}
        </Text>
        <Text variant="label" color={colors.textSecondary}>
          remaining
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelContainer: {
    position: 'absolute',
    alignItems: 'center',
  },
});
