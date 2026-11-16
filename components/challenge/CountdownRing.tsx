import { useEffect, useId } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Brand } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui/Text';
import { formatCountdown } from '../../utils/time';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  totalSeconds: number;
  remainingSeconds: number;
  size?: number;
  strokeWidth?: number;
  appearance?: 'classic' | 'spotlight';
};

export function CountdownRing({
  totalSeconds,
  remainingSeconds,
  size = 160,
  strokeWidth = 8,
  appearance = 'classic',
}: Props) {
  const { colors } = useTheme();
  const gradientId = `doji-timer-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const spotlight = appearance === 'spotlight';
  const radius = (size - (spotlight ? strokeWidth + 16 : strokeWidth)) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeTotal = Math.max(1, totalSeconds);
  const displayRemaining = Math.max(0, remainingSeconds);
  // Bound the graphic, not a server-authorized signup-day deadline's clock text.
  const clampedRemaining = Math.min(displayRemaining, safeTotal);
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
  const markerProps = useAnimatedProps(() => ({
    cx: size / 2 + radius * Math.cos(2 * Math.PI * progress.value - Math.PI / 2),
    cy: size / 2 + radius * Math.sin(2 * Math.PI * progress.value - Math.PI / 2),
    opacity: progress.value > 0 ? 1 : 0,
  }));

  const isUrgent = displayRemaining <= 60;
  const strokeColor = isUrgent ? colors.error : spotlight ? `url(#${gradientId})` : colors.text;

  return (
    <View
      style={[styles.container, { width: size, height: size }]}
      accessible
      accessibilityRole="timer"
      accessibilityLabel={`${formatCountdown(displayRemaining)} remaining`}
      accessibilityLiveRegion={isUrgent ? 'polite' : 'none'}
    >
      <Svg width={size} height={size}>
        {spotlight ? (
          <>
            <Defs>
              <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor={Brand.orange} />
                <Stop offset="100%" stopColor={Brand.violet} />
              </LinearGradient>
            </Defs>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={isUrgent ? colors.error : Brand.violet}
              strokeOpacity={0.1}
              strokeWidth={strokeWidth + 12}
              fill="none"
            />
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius - strokeWidth - 5}
              fill={colors.surface}
              stroke={colors.hairline}
              strokeWidth={1}
            />
          </>
        ) : null}
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
        {spotlight ? (
          <AnimatedCircle
            animatedProps={markerProps}
            r={4}
            fill={isUrgent ? colors.error : Brand.orange}
            stroke={colors.background}
            strokeWidth={2}
          />
        ) : null}
      </Svg>
      <View style={styles.labelContainer}>
        <Text
          variant={displayRemaining >= 3600 ? 'headingLarge' : 'displayMedium'}
          color={isUrgent ? colors.error : colors.text}
          style={
            spotlight
              ? [styles.spotlightTime, { fontSize: displayRemaining >= 3600 ? 20 : 30 }]
              : undefined
          }
        >
          {formatCountdown(displayRemaining)}
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
  spotlightTime: { fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
});
