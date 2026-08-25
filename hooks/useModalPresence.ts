import { useEffect } from 'react';
import {
  cancelAnimation,
  Easing,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Motion } from '../constants/motion';

/** Drives opening motion only. Native modals unmount synchronously on close. */
export function useModalPresence(visible: boolean) {
  const progress = useSharedValue(visible ? 1 : 0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    cancelAnimation(progress);
    if (visible) {
      progress.value = 0;
      progress.value = withTiming(1, {
        duration: reduceMotion ? Motion.duration.instant : Motion.duration.sheet,
        easing: Easing.out(Easing.cubic),
      });
      return;
    }
    progress.value = 0;
  }, [progress, reduceMotion, visible]);

  return { progress };
}
