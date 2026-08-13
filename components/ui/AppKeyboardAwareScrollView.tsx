import React, { forwardRef } from 'react';
import { Platform } from 'react-native';
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewProps,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';

export const KEYBOARD_TOOLBAR_CLEARANCE = 62;
export const KEYBOARD_FOCUSED_FIELD_CLEARANCE = KEYBOARD_TOOLBAR_CLEARANCE + 32;

export const AppKeyboardAwareScrollView = forwardRef<
  KeyboardAwareScrollViewRef,
  KeyboardAwareScrollViewProps
>(
  (
    {
      bottomOffset = KEYBOARD_FOCUSED_FIELD_CLEARANCE,
      extraKeyboardSpace = KEYBOARD_FOCUSED_FIELD_CLEARANCE,
      keyboardDismissMode = Platform.OS === 'ios' ? 'interactive' : 'on-drag',
      keyboardShouldPersistTaps = 'handled',
      ...props
    },
    ref,
  ) => (
    <KeyboardAwareScrollView
      ref={ref}
      bottomOffset={bottomOffset}
      extraKeyboardSpace={extraKeyboardSpace}
      keyboardDismissMode={keyboardDismissMode}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      {...props}
    />
  ),
);

AppKeyboardAwareScrollView.displayName = 'AppKeyboardAwareScrollView';
