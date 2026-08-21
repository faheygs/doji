import React, { useMemo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  Switch,
  useWindowDimensions,
  Dimensions,
  Keyboard,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui/Text';
import { IconClose } from '../icons/Icons';
import { PostCommentsThread } from './PostCommentsThread';
import { AppKeyboardToolbar } from '../ui/AppKeyboardToolbar';
import { AppKeyboardViewport } from '../ui/AppKeyboardViewport';
import { useToggleCommentsDisabled } from '../../hooks/useComments';
import { useAuthStore } from '../../stores/useAuthStore';
import { formatCompactCount } from '../../utils/formatCount';
import type { FeedAudience } from '../../lib/feedAudience';
import {
  getKeyboardDismissTarget,
} from '../../lib/keyboardSafeInteraction';
import { useDismissOnRouteBlur } from '../../hooks/useDismissOnRouteBlur';
import { usePostCommentsSheetStyles } from './PostCommentsSheet.styles';
import { Motion } from '../../constants/motion';

type Props = {
  visible: boolean;
  postId: string;
  postOwnerId?: string | null;
  commentsDisabled?: boolean;
  commentCount?: number;
  feedAudience?: FeedAudience;
  onClose: () => void;
};

const SPRING = { damping: 28, stiffness: 280, mass: 0.85 };

function nearestSnap(y: number, snaps: readonly number[]): number {
  'worklet';
  let best = snaps[0];
  let bestD = Math.abs(snaps[0] - y);
  for (let i = 1; i < snaps.length; i++) {
    const d = Math.abs(snaps[i] - y);
    if (d < bestD) {
      bestD = d;
      best = snaps[i];
    }
  }
  return best;
}

export function PostCommentsSheet({
  visible,
  postId,
  postOwnerId,
  commentsDisabled = false,
  commentCount = 0,
  feedAudience = 'everyone',
  onClose,
}: Props) {
  const { colors } = useTheme();
  const styles = usePostCommentsSheetStyles();
  const insets = useSafeAreaInsets();
  const me = useAuthStore((s) => s.session?.user?.id);
  const toggleCommentsDisabled = useToggleCommentsDisabled();
  // The feed post carries the complete audience-scoped total. The infinite
  // comment query only contains pages loaded so far and is not a counter.
  const displayCommentCount = commentCount;
  const [localDisabled, setLocalDisabled] = useState(commentsDisabled);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const keyboardVisibleRef = useRef(false);
  const isPostOwner = Boolean(me && postOwnerId && me === postOwnerId);
  const { height: liveWinH } = useWindowDimensions();
  useDismissOnRouteBlur(visible, onClose);

  useEffect(() => {
    setLocalDisabled(commentsDisabled);
  }, [commentsDisabled, postId]);

  useEffect(() => {
    if (!visible) {
      setKeyboardOpen(false);
      keyboardVisibleRef.current = false;
      return;
    }
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = () => {
      keyboardVisibleRef.current = true;
      setKeyboardOpen(true);
    };
    const onHide = () => {
      keyboardVisibleRef.current = false;
      setKeyboardOpen(false);
    };
    const s = Keyboard.addListener(showEvt, onShow);
    const h = Keyboard.addListener(hideEvt, onHide);
    return () => {
      s.remove();
      h.remove();
    };
  }, [visible]);

  /**
   * Lock window height while the sheet is open. On Android, keyboard resize shrinks
   * `liveWinH`, which was changing snap math and re-triggering the open animation
   * (everything jumps). iOS can also report window changes around the keyboard.
   */
  const [lockedWinH, setLockedWinH] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (visible) {
      setLockedWinH(Dimensions.get('window').height);
    } else {
      setLockedWinH(null);
    }
  }, [visible]);

  const layoutWinH = lockedWinH ?? liveWinH;
  /** Max height: sheet top stops at the top safe area (not under status bar). */
  const expandedHeight = layoutWinH - insets.top;
  /** Initial snap: ~3/4 of the window shows the sheet. */
  const halfOffset = Math.max(48, expandedHeight - layoutWinH * 0.75);
  const closedOffset = expandedHeight;

  const snapPoints = useMemo(
    () => [...new Set([0, halfOffset, closedOffset])].sort((a, b) => a - b),
    [halfOffset, closedOffset],
  );

  const translateY = useSharedValue(closedOffset);
  const startY = useSharedValue(0);

  const fireClose = useCallback(() => {
    Haptics.selectionAsync();
    onClose();
  }, [onClose]);

  const animateToClose = useCallback(() => {
    translateY.value = withTiming(closedOffset, {
      duration: Motion.duration.content,
      easing: Easing.in(Easing.cubic),
    }, (finished) => {
      if (finished) runOnJS(fireClose)();
    });
  }, [closedOffset, fireClose, translateY]);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(halfOffset, SPRING);
    } else {
      translateY.value = closedOffset;
    }
  }, [visible, halfOffset, closedOffset, translateY]);

  const dismissKeyboard = useCallback(() => Keyboard.dismiss(), []);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-12, 12])
        .failOffsetX([-28, 28])
        .onStart(() => {
          startY.value = translateY.value;
        })
        .onUpdate((e) => {
          // While keyboard is open, only track downward drags (for dismiss)
          if (keyboardOpen) return;
          const y = startY.value + e.translationY;
          translateY.value = Math.min(closedOffset, Math.max(0, y));
        })
        .onEnd((e) => {
          // Swipe down with keyboard open → just dismiss the keyboard
          if (keyboardOpen) {
            if (e.translationY > 30 || e.velocityY > 300) {
              runOnJS(dismissKeyboard)();
            }
            return;
          }

          const y = translateY.value;
          const vy = e.velocityY;

          if (vy > 900 || y > closedOffset * 0.9) {
            translateY.value = withTiming(closedOffset, {
              duration: Motion.duration.content,
              easing: Easing.in(Easing.cubic),
            }, (finished) => {
              if (finished) runOnJS(fireClose)();
            });
            return;
          }
          if (vy < -700) {
            translateY.value = withSpring(0, SPRING);
            return;
          }
          if (vy > 700 && y > halfOffset * 0.35) {
            translateY.value = withTiming(closedOffset, {
              duration: Motion.duration.content,
              easing: Easing.in(Easing.cubic),
            }, (finished) => {
              if (finished) runOnJS(fireClose)();
            });
            return;
          }

          const target = nearestSnap(y, snapPoints);
          translateY.value = target === closedOffset
            ? withTiming(target, {
                duration: Motion.duration.content,
                easing: Easing.in(Easing.cubic),
              }, (finished) => {
                if (finished) runOnJS(fireClose)();
              })
            : withSpring(target, SPRING, (finished) => {
            if (finished && Math.abs(target - closedOffset) < 4) {
              runOnJS(fireClose)();
            }
          });
        }),
    [
      closedOffset,
      dismissKeyboard,
      fireClose,
      halfOffset,
      keyboardOpen,
      snapPoints,
      startY,
      translateY,
    ],
  );

  const sheetStyle = useAnimatedStyle(() => {
    const h = expandedHeight - translateY.value;
    return {
      height: Math.max(0, h),
    };
  });

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [0, halfOffset, closedOffset],
      [0.55, 0.4, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const handleClosePress = useCallback(() => {
    if (getKeyboardDismissTarget(true, keyboardVisibleRef.current) === 'keyboard') {
      Keyboard.dismiss();
      return;
    }
    animateToClose();
  }, [animateToClose]);

  const onToggleComments = useCallback(
    (next: boolean) => {
      Haptics.selectionAsync();
      setLocalDisabled(next);
      toggleCommentsDisabled.mutate({ postId, disabled: next });
    },
    [postId, toggleCommentsDisabled],
  );

  const themedSwitchProps = useMemo(
    () => ({
      trackColor: { false: colors.surfaceMuted, true: colors.accent },
      thumbColor: colors.surface,
      ios_backgroundColor: colors.surfaceMuted,
    }),
    [colors],
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClosePress}>
      <GestureHandlerRootView style={styles.modalRoot}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]} pointerEvents="box-none">
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={handleClosePress}
            accessibilityRole="button"
            accessibilityLabel="Dismiss comments"
          />
        </Animated.View>

        <View style={[styles.modalRoot, { justifyContent: 'flex-end' }]} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.sheet,
              sheetStyle,
              {
                paddingBottom: keyboardOpen ? 0 : insets.bottom + Spacing.sm,
                /** Cap to live window so keyboard resize cannot push sheet off-screen. */
                maxHeight: Math.min(expandedHeight, liveWinH - insets.top),
              },
            ]}
          >
            <GestureDetector gesture={panGesture}>
              <View style={styles.dragStrip}>
                <View style={styles.sheetHandle} />
                <View style={styles.header}>
                  <Text variant="headingMedium" numberOfLines={1} style={styles.headerTitle}>
                    Comments
                  </Text>
                  {displayCommentCount > 0 ? (
                    <Text variant="bodySmall" color={colors.textTertiary} style={styles.headerMeta}>
                      {formatCompactCount(displayCommentCount)}
                    </Text>
                  ) : null}
                  <TouchableOpacity
                    onPress={handleClosePress}
                    hitSlop={12}
                    style={styles.closeHit}
                    accessibilityRole="button"
                    accessibilityLabel="Close comments"
                  >
                    <IconClose size={22} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            </GestureDetector>
            {isPostOwner ? (
              <View style={styles.ownerRow}>
                <Text variant="bodySmall" color={colors.textSecondary}>
                  Turn off comments
                </Text>
                <Switch
                  value={localDisabled}
                  onValueChange={onToggleComments}
                  disabled={toggleCommentsDisabled.isPending}
                  accessibilityLabel="Turn off comments on this post"
                  {...themedSwitchProps}
                />
              </View>
            ) : null}
            <AppKeyboardViewport style={styles.body}>
              <PostCommentsThread
                postId={postId}
                postOwnerId={postOwnerId}
                commentsDisabled={localDisabled}
                fetchEnabled={visible}
                feedAudience={feedAudience}
                embedInSheet
              />
            </AppKeyboardViewport>
          </Animated.View>
        </View>
        <AppKeyboardToolbar />
      </GestureHandlerRootView>
    </Modal>
  );
}
