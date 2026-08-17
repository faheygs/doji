import React, { useEffect, useMemo, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet, Animated, Modal } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui/Text';
import { Spacing, Radius } from '../../constants/theme';
import { IconCheck } from '../icons/Icons';
import { useDismissOnRouteBlur } from '../../hooks/useDismissOnRouteBlur';

type Props = {
  visible: boolean;
  xpEarned: number;
  onDone: () => void;
};

export function SubmittedOverlay({ visible, xpEarned, onDone }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          backgroundColor: colors.overlayBackdrop,
          justifyContent: 'center',
          alignItems: 'center',
          padding: Spacing.lg,
        },
        card: {
          width: '100%',
          borderRadius: Radius.xl,
          padding: Spacing.xl,
          alignItems: 'center',
          gap: Spacing.md,
        },
        iconCircle: {
          width: 80,
          height: 80,
          borderRadius: 40,
          alignItems: 'center',
          justifyContent: 'center',
        },
        xpBadge: {
          paddingHorizontal: Spacing.lg,
          paddingVertical: Spacing.sm,
          borderRadius: Radius.full,
        },
        doneBtn: {
          width: '100%',
          height: 52,
          borderRadius: Radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: Spacing.sm,
        },
      }),
    [colors],
  );
  const scale = useRef(new Animated.Value(0.5)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  useDismissOnRouteBlur(visible, onDone);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 60, friction: 6 }),
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      scale.setValue(0.5);
      opacity.setValue(0);
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="none">
      <View style={styles.backdrop}>
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              transform: [{ scale }],
              opacity,
            },
          ]}
        >
          <View style={[styles.iconCircle, { backgroundColor: colors.primaryPale }]}>
            <IconCheck size={44} color={colors.primary} />
          </View>
          <Text variant="display" style={{ textAlign: 'center' }}>
            You're in!
          </Text>
          <View style={[styles.xpBadge, { backgroundColor: colors.primaryPale }]}>
            <Text variant="subhead" color={colors.primary}>
              +{xpEarned} XP
            </Text>
          </View>
          <TouchableOpacity
            onPress={onDone}
            style={[styles.doneBtn, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}
          >
            <Text variant="subhead" color={colors.onPrimary}>Back to Feed</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}
