import React, { forwardRef } from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

/** Unstyled TextInput with Doji's shared keyboard, cursor, and placeholder behavior. */
export const AppTextInput = forwardRef<TextInput, TextInputProps>(
  ({ placeholderTextColor, selectionColor, ...props }, ref) => {
    const { colors, isDark } = useTheme();
    return (
      <TextInput
        ref={ref}
        keyboardAppearance={isDark ? 'dark' : 'light'}
        placeholderTextColor={placeholderTextColor ?? colors.textTertiary}
        selectionColor={selectionColor ?? colors.link}
        {...props}
      />
    );
  },
);

AppTextInput.displayName = 'AppTextInput';
