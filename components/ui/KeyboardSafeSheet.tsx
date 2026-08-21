import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Keyboard,
  Platform,
  Dimensions,
} from 'react-native';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Spacing, Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from './Text';
import { IconClose } from '../icons/Icons';
import { AppKeyboardToolbar } from './AppKeyboardToolbar';
import { getKeyboardDismissTarget } from '../../lib/keyboardSafeInteraction';
import { useDismissOnRouteBlur } from '../../hooks/useDismissOnRouteBlur';
import { AppSheetModal } from './AppSheetModal';
import { AppKeyboardViewport } from './AppKeyboardViewport';
import { AppKeyboardAwareScrollView } from './AppKeyboardAwareScrollView';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** When true, scrim/back dismisses keyboard first instead of closing immediately */
  keyboardAwareDismiss?: boolean;
  /** Portion of the visible window used by the sheet. */
  heightFraction?: number;
};

export function KeyboardSafeSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  keyboardAwareDismiss = true,
  heightFraction = 0.5,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [initialWindowHeight, setInitialWindowHeight] = useState(Dimensions.get('window').height);
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const keyboardVisibleRef = useRef(false);
  useDismissOnRouteBlur(visible, onClose);

  useEffect(() => {
    if (!visible) {
      keyboardVisibleRef.current = false;
      return;
    }
    setInitialWindowHeight(Dimensions.get('window').height);
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = () => {
      keyboardVisibleRef.current = true;
    };
    const onHide = () => {
      keyboardVisibleRef.current = false;
    };
    const s = Keyboard.addListener(showEvt, onShow);
    const h = Keyboard.addListener(hideEvt, onHide);
    return () => {
      s.remove();
      h.remove();
    };
  }, [visible]);

  const tryDismiss = useCallback(() => {
    if (getKeyboardDismissTarget(keyboardAwareDismiss, keyboardVisibleRef.current) === 'keyboard') {
      Keyboard.dismiss();
      return;
    }
    Keyboard.dismiss();
    onClose();
  }, [keyboardAwareDismiss, onClose]);

  const handleExplicitClose = useCallback(() => {
    Haptics.selectionAsync();
    tryDismiss();
  }, [tryDismiss]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        sheet: {
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

  const bottomPad = keyboardVisible ? 0 : Math.max(insets.bottom, Spacing.md);
  const sheetHeight = initialWindowHeight * Math.min(0.9, Math.max(0.4, heightFraction));

  return (
    <AppSheetModal
      visible={visible}
      onClose={tryDismiss}
      sheetStyle={[styles.sheet, { height: sheetHeight, paddingBottom: bottomPad }]}
      accessory={<AppKeyboardToolbar />}
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
      <AppKeyboardViewport style={{ flex: 1, minHeight: 0 }}>
        <AppKeyboardAwareScrollView
          style={[styles.scroll, { flex: 1 }]}
          contentContainerStyle={styles.scrollContent}
          bottomOffset={Spacing.sm}
          extraKeyboardSpace={Spacing.sm}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </AppKeyboardAwareScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </AppKeyboardViewport>
    </AppSheetModal>
  );
}
