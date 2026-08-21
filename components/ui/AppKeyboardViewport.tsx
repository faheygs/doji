import React from 'react';
import {
  KeyboardAvoidingView,
  type KeyboardAvoidingViewProps,
} from 'react-native-keyboard-controller';
import { KEYBOARD_TOOLBAR_CLEARANCE } from './AppKeyboardAwareScrollView';

type Props = Omit<
  KeyboardAvoidingViewProps,
  'automaticOffset' | 'behavior' | 'keyboardVerticalOffset'
>;

/** Shared synchronized viewport for text entry inside native modals and sheets. */
export function AppKeyboardViewport(props: Props) {
  return (
    <KeyboardAvoidingView
      {...props}
      automaticOffset
      behavior="height"
      keyboardVerticalOffset={KEYBOARD_TOOLBAR_CLEARANCE}
    />
  );
}
