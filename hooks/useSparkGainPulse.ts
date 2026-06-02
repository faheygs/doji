import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const GAIN_LABEL_MS = 760;

/** Subtle pulse + floating "+N" when a live Sparks balance increases. */
export function useSparkGainPulse(amount: number, enabled = true) {
  const prevAmountRef = useRef(amount);
  const skipInitialRef = useRef(true);
  const [gainLabel, setGainLabel] = useState<number | null>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const containerScale = useSharedValue(1);
  const iconScale = useSharedValue(1);
  const highlight = useSharedValue(0);
  const labelOpacity = useSharedValue(0);
  const labelTranslateY = useSharedValue(0);

  const clearGainLabel = useCallback(() => {
    setGainLabel(null);
  }, []);

  const triggerGain = useCallback(
    (delta: number) => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);

      setGainLabel(delta);
      containerScale.value = withSequence(
        withSpring(1.04, { damping: 16, stiffness: 420 }),
        withSpring(1, { damping: 18, stiffness: 280 }),
      );
      iconScale.value = withSequence(
        withSpring(1.14, { damping: 12, stiffness: 360 }),
        withSpring(1, { damping: 16, stiffness: 300 }),
      );
      highlight.value = withSequence(
        withTiming(1, { duration: 90 }),
        withTiming(0, { duration: 420 }),
      );
      labelOpacity.value = 0;
      labelTranslateY.value = 2;
      labelOpacity.value = withSequence(
        withTiming(1, { duration: 120 }),
        withDelay(280, withTiming(0, { duration: 360, easing: Easing.out(Easing.quad) })),
      );
      labelTranslateY.value = withTiming(-8, {
        duration: GAIN_LABEL_MS,
        easing: Easing.out(Easing.cubic),
      });

      clearTimerRef.current = setTimeout(clearGainLabel, GAIN_LABEL_MS);
    },
    [clearGainLabel, containerScale, highlight, iconScale, labelOpacity, labelTranslateY],
  );

  useEffect(() => {
    if (!enabled) {
      prevAmountRef.current = amount;
      return;
    }
    if (skipInitialRef.current) {
      skipInitialRef.current = false;
      prevAmountRef.current = amount;
      return;
    }
    const prev = prevAmountRef.current;
    if (amount > prev) {
      triggerGain(amount - prev);
    }
    prevAmountRef.current = amount;
  }, [amount, enabled, triggerGain]);

  useEffect(
    () => () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    },
    [],
  );

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: containerScale.value }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  const highlightStyle = useAnimatedStyle(() => ({
    opacity: highlight.value * 0.28,
  }));

  const gainLabelStyle = useAnimatedStyle(() => ({
    opacity: labelOpacity.value,
    transform: [{ translateY: labelTranslateY.value }],
  }));

  return {
    gainLabel,
    containerStyle,
    iconStyle,
    highlightStyle,
    gainLabelStyle,
    /** One-shot pulse (e.g. overlay earn moment) without balance change. */
    pulseOnce: triggerGain,
  };
}
