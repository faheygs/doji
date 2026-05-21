import React, { useMemo, useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  useWindowDimensions,
  Dimensions,
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
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Spacing, Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui/Text';
import { IconClose } from '../icons/Icons';
import { PostCommentsThread } from './PostCommentsThread';

type Props = {
  visible: boolean;
  postId: string;
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

export function PostCommentsSheet({ visible, postId, onClose }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: liveWinH } = useWindowDimensions();
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
    translateY.value = withSpring(closedOffset, SPRING, (finished) => {
      if (finished) runOnJS(fireClose)();
    });
  }, [closedOffset, fireClose]);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(halfOffset, SPRING);
    } else {
      translateY.value = closedOffset;
    }
  }, [visible, halfOffset, closedOffset, translateY]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-12, 12])
        .failOffsetX([-28, 28])
        .onStart(() => {
          startY.value = translateY.value;
        })
        .onUpdate((e) => {
          const y = startY.value + e.translationY;
          translateY.value = Math.min(closedOffset, Math.max(0, y));
        })
        .onEnd((e) => {
          const y = translateY.value;
          const vy = e.velocityY;

          if (vy > 900 || y > closedOffset * 0.9) {
            translateY.value = withSpring(closedOffset, SPRING, (finished) => {
              if (finished) runOnJS(fireClose)();
            });
            return;
          }
          if (vy < -700) {
            translateY.value = withSpring(0, SPRING);
            return;
          }
          if (vy > 700 && y > halfOffset * 0.35) {
            translateY.value = withSpring(closedOffset, SPRING, (finished) => {
              if (finished) runOnJS(fireClose)();
            });
            return;
          }

          const target = nearestSnap(y, snapPoints);
          translateY.value = withSpring(target, SPRING, (finished) => {
            if (finished && Math.abs(target - closedOffset) < 4) {
              runOnJS(fireClose)();
            }
          });
        }),
    [closedOffset, fireClose, halfOffset, snapPoints],
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
    animateToClose();
  }, [animateToClose]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        modalRoot: {
          flex: 1,
        },
        backdrop: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: '#000',
        },
        sheet: {
          width: '100%',
          backgroundColor: colors.surface,
          borderTopLeftRadius: Radius.lg,
          borderTopRightRadius: Radius.lg,
          borderWidth: 1,
          borderBottomWidth: 0,
          borderColor: colors.border,
          overflow: 'hidden',
          flexDirection: 'column',
          alignSelf: 'stretch',
        },
        dragStrip: {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.hairline,
        },
        sheetHandle: {
          alignSelf: 'center',
          width: 40,
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.textTertiary,
          opacity: 0.45,
          marginTop: Spacing.sm,
          marginBottom: Spacing.xs,
        },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: Spacing.md,
          paddingBottom: Spacing.sm,
        },
        headerTitle: { flex: 1 },
        closeHit: { padding: Spacing.xs },
        body: { flex: 1, minHeight: 0, minWidth: 0 },
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
                paddingBottom: insets.bottom + Spacing.sm,
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
            <View style={styles.body}>
              <PostCommentsThread postId={postId} fetchEnabled={visible} embedInSheet />
            </View>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
