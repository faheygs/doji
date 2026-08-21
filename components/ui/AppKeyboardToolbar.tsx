import React, { useMemo } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  KeyboardToolbar,
  useKeyboardState,
  type KeyboardToolbarProps,
} from 'react-native-keyboard-controller';
import { useTheme } from '../../contexts/ThemeContext';
import {
  getKeyboardToolbarClosedOffset,
  getKeyboardToolbarOpenedOffset,
} from '../../lib/keyboardSafeInteraction';

export function AppKeyboardToolbar() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);

  const toolbarTheme = useMemo<NonNullable<KeyboardToolbarProps['theme']>>(() => {
    const current = {
      primary: colors.primary,
      disabled: colors.textTertiary,
      background: colors.surfaceElevated,
      ripple: colors.primaryLight,
    };
    return { light: current, dark: current };
  }, [colors]);

  if (Platform.OS === 'web') return null;

  return (
    <KeyboardToolbar
      doneText="Done"
      enabled={keyboardVisible}
      pointerEvents={keyboardVisible ? 'auto' : 'none'}
      accessibilityElementsHidden={!keyboardVisible}
      importantForAccessibility={keyboardVisible ? 'auto' : 'no-hide-descendants'}
      insets={{ left: insets.left, right: insets.right }}
      offset={{
        closed: getKeyboardToolbarClosedOffset(insets.bottom),
        opened: getKeyboardToolbarOpenedOffset(),
      }}
      theme={toolbarTheme}
    />
  );
}
