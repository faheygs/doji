import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  Keyboard,
  Platform,
  ScrollView,
  Dimensions,
  type KeyboardEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Spacing, Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from './Text';
import { IconClose } from '../icons/Icons';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** When true, scrim/back dismisses keyboard first instead of closing immediately */
  keyboardAwareDismiss?: boolean;
};

export function KeyboardSafeSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  keyboardAwareDismiss = true,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const keyboardVisibleRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      setKeyboardHeight(0);
      keyboardVisibleRef.current = false;
      return;
    }
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e: KeyboardEvent) => {
      keyboardVisibleRef.current = true;
      setKeyboardHeight(e.endCoordinates.height);
    };
    const onHide = () => {
      keyboardVisibleRef.current = false;
      setKeyboardHeight(0);
    };
    const s = Keyboard.addListener(showEvt, onShow);
    const h = Keyboard.addListener(hideEvt, onHide);
    return () => {
      s.remove();
      h.remove();
    };
  }, [visible]);

  const tryDismiss = useCallback(() => {
    if (keyboardAwareDismiss && keyboardVisibleRef.current) {
      Keyboard.dismiss();
      return;
    }
    Keyboard.dismiss();
    onClose();
  }, [keyboardAwareDismiss, onClose]);

  const handleExplicitClose = useCallback(() => {
    Haptics.selectionAsync();
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          justifyContent: 'flex-end',
          backgroundColor: 'rgba(0,0,0,0.25)',
        },
        sheet: {
          height: Dimensions.get('window').height * 0.5,
          backgroundColor: colors.surfaceElevated,
          borderTopLeftRadius: Radius.xl,
          borderTopRightRadius: Radius.xl,
          borderWidth: StyleSheet.hairlineWidth,
          borderBottomWidth: 0,
          borderColor: colors.border,
        },
        grab: {
          alignSelf: 'center',
          width: 42,
          height: 5,
          borderRadius: 3,
          backgroundColor: colors.textTertiary,
          opacity: 0.4,
          marginTop: Spacing.sm,
          marginBottom: Spacing.xs,
        },
        headRow: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          paddingHorizontal: Spacing.lg,
          paddingBottom: Spacing.sm,
          gap: Spacing.sm,
        },
        scroll: {
          paddingHorizontal: Spacing.lg,
        },
        scrollContent: {
          gap: Spacing.md,
          paddingBottom: Spacing.sm,
        },
        footer: {
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.sm,
          gap: Spacing.sm,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
      }),
    [colors],
  );

  const bottomPad = Math.max(insets.bottom, Spacing.md) + (keyboardHeight > 0 ? keyboardHeight - insets.bottom : 0);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={tryDismiss}>
      <Pressable style={styles.backdrop} onPress={tryDismiss} accessibilityLabel="Dismiss">
        <Pressable
          style={[styles.sheet, { paddingBottom: bottomPad }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.grab} />
          {title ? (
            <View style={styles.headRow}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="headingMedium">{title}</Text>
                {subtitle ? (
                  <Text variant="bodySmall" color={colors.textSecondary} style={{ lineHeight: 20 }}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
              <Pressable onPress={handleExplicitClose} hitSlop={14} accessibilityLabel="Close">
                <IconClose size={26} color={colors.textSecondary} />
              </Pressable>
            </View>
          ) : null}
          <ScrollView
            style={[styles.scroll, { flex: 1 }]}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="none"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
