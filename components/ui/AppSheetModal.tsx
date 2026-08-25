import React, { useEffect, useRef } from 'react';
import { Modal, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { Motion } from '../../constants/motion';
import { useModalPresence } from '../../hooks/useModalPresence';
import { useKeyboardToolbarHost } from '../../contexts/KeyboardToolbarContext';

type Props = {
  visible: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  children: React.ReactNode;
  sheetStyle?: StyleProp<ViewStyle>;
  accessory?: React.ReactNode;
  dismissLabel?: string;
};

/** Shared bottom-sheet motion and native Modal lifecycle. */
export function AppSheetModal({
  visible,
  onClose,
  onDismiss,
  children,
  sheetStyle,
  accessory,
  dismissLabel = 'Dismiss',
}: Props) {
  const wasVisible = useRef(visible);
  const { registerOverlayOwner } = useKeyboardToolbarHost();
  const { progress } = useModalPresence(visible);
  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value * 0.32 }));
  const surfaceStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.35, 1], [0, 1, 1]),
    transform: [{ translateY: (1 - progress.value) * Motion.sheetTravel }],
  }));

  useEffect(() => {
    if (wasVisible.current && !visible) onDismiss?.();
    wasVisible.current = visible;
  }, [onDismiss, visible]);

  useEffect(() => {
    if (!visible || !accessory) return undefined;
    return registerOverlayOwner();
  }, [accessory, registerOverlayOwner, visible]);

  if (!visible) return null;

  return (
    <Modal
      // Native Modal windows continue intercepting every touch while an exit
      // animation runs, even when their React children use pointerEvents=none.
      // Unmount on the same render that closes the sheet so a dismissed sheet
      // can never leave an invisible interaction blocker above the app.
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, backdropStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={dismissLabel}
          />
        </Animated.View>
        <Animated.View style={[styles.surface, sheetStyle, surfaceStyle]}>{children}</Animated.View>
        {accessory}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: '#000000' },
  surface: { width: '100%' },
});
