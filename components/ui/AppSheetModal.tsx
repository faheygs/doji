import React, { useEffect, useRef } from 'react';
import { Modal, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { Motion } from '../../constants/motion';
import { useModalPresence } from '../../hooks/useModalPresence';

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
  const { presented, progress } = useModalPresence(visible);
  const wasPresented = useRef(presented);

  useEffect(() => {
    if (wasPresented.current && !presented) onDismiss?.();
    wasPresented.current = presented;
  }, [onDismiss, presented]);
  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value * 0.32 }));
  const surfaceStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.35, 1], [0, 1, 1]),
    transform: [{ translateY: (1 - progress.value) * Motion.sheetTravel }],
  }));

  return (
    <Modal
      visible={presented}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root} pointerEvents={visible ? 'auto' : 'none'}>
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
