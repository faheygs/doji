import React, { useMemo } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardToolbar, type KeyboardToolbarProps } from 'react-native-keyboard-controller';
import { useTheme } from '../../contexts/ThemeContext';
import { getKeyboardToolbarOpenedOffset } from '../../lib/keyboardSafeInteraction';

type Props = {
  insidePageSheet?: boolean;
};

export function AppKeyboardToolbar({ insidePageSheet = false }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

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
      insets={{ left: insets.left, right: insets.right }}
      offset={{ opened: getKeyboardToolbarOpenedOffset(insidePageSheet) }}
      theme={toolbarTheme}
    />
  );
}
