import React, { useCallback, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Radius, Spacing } from '../../constants/theme';
import { Motion } from '../../constants/motion';
import { useTheme } from '../../contexts/ThemeContext';
import { IconMoreVertical } from '../icons/Icons';
import { Text } from '../ui/Text';
import { useDismissOnRouteBlur } from '../../hooks/useDismissOnRouteBlur';

type Props = {
  isBlocked: boolean;
  busy?: boolean;
  onBlock: () => void;
  onUnblock: () => void;
  onReport: () => void;
};

type MenuActionProps = {
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  isLast?: boolean;
  onPress: () => void;
};

function MenuAction({ label, destructive, disabled, isLast, onPress }: MenuActionProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        !isLast && {
          borderBottomColor: colors.hairline,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
        pressed && { backgroundColor: colors.surfaceElevated },
        disabled && styles.disabled,
      ]}
    >
      <Text variant="body" color={destructive ? colors.error : colors.text}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ProfileManageMenu({ isBlocked, busy, onBlock, onUnblock, onReport }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const pendingActionRef = useRef<null | (() => void)>(null);
  const progress = useSharedValue(0);
  const closeMenu = useCallback(() => setOpen(false), []);
  useDismissOnRouteBlur(open, closeMenu);

  const menuMotionStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [-6, 0]) },
      { scale: interpolate(progress.value, [0, 1], [0.98, 1]) },
    ],
  }));

  React.useEffect(() => {
    progress.value = open ? withTiming(1, { duration: Motion.duration.sheet }) : 0;
  }, [open, progress]);

  const run = (action: () => void) => {
    pendingActionRef.current = action;
    setOpen(false);
    requestAnimationFrame(() => {
      const pending = pendingActionRef.current;
      pendingActionRef.current = null;
      pending?.();
    });
  };

  return (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Manage profile connection"
        accessibilityState={{ expanded: open }}
        activeOpacity={0.8}
        onPress={() => setOpen(true)}
        style={[styles.trigger, { backgroundColor: 'transparent', borderColor: colors.border }]}
      >
        <IconMoreVertical size={20} color={colors.text} />
      </TouchableOpacity>

      {open ? <Modal
        visible={open}
        transparent
        animationType="none"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.overlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close manage menu"
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
          />
          <Animated.View
            accessibilityRole="menu"
            style={[
              styles.menu,
              menuMotionStyle,
              {
                top: insets.top + 56,
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <View
              style={[
                styles.pointer,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            />
            <MenuAction
              label={isBlocked ? 'Unblock user' : 'Block user'}
              disabled={busy}
              onPress={() => run(isBlocked ? onUnblock : onBlock)}
              isLast={isBlocked}
            />
            {!isBlocked ? (
              <MenuAction
                label="Report user"
                destructive
                disabled={busy}
                isLast
                onPress={() => run(onReport)}
              />
            ) : null}
          </Animated.View>
        </View>
      </Modal> : null}
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: { flex: 1 },
  menu: {
    position: 'absolute',
    right: Spacing.lg,
    width: 220,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'visible',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  pointer: {
    position: 'absolute',
    top: -5,
    right: 17,
    width: 10,
    height: 10,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
    transform: [{ rotate: '45deg' }],
  },
  action: {
    minHeight: 52,
    paddingHorizontal: Spacing.md,
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
});
