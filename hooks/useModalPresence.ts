import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cancelAnimation,
  Easing,
  runOnJS,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Motion } from '../constants/motion';

/** Keeps a native Modal mounted until its custom closing motion has completed. */
export function useModalPresence(visible: boolean) {
  const [presented, setPresented] = useState(visible);
  const progress = useSharedValue(visible ? 1 : 0);
  const reduceMotion = useReducedMotion();
  const visibleRef = useRef(visible);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  const finishClose = useCallback(() => {
    if (!visibleRef.current) setPresented(false);
  }, []);

  useEffect(() => {
    cancelAnimation(progress);
    if (visible) {
      if (!presented) {
        progress.value = 0;
        setPresented(true);
        return;
      }
      progress.value = withTiming(1, {
        duration: reduceMotion ? Motion.duration.instant : Motion.duration.sheet,
        easing: Easing.out(Easing.cubic),
      });
      return;
    }
    if (!presented) return;
    if (reduceMotion) {
      progress.value = 0;
      finishClose();
      return;
    }
    progress.value = withTiming(
      0,
      { duration: Motion.duration.content, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(finishClose)();
      },
    );
  }, [finishClose, presented, progress, reduceMotion, visible]);

  return { presented, progress };
}
