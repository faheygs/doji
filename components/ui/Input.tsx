import React, { forwardRef, useMemo } from 'react';
import {
  TextInput,
  TextInputProps,
  StyleSheet,
  View,
  ViewStyle,
  StyleProp,
  Keyboard,
} from 'react-native';
import { Radius, Spacing, Typography } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from './Text';

type Props = TextInputProps & {
  label?: string;
  error?: string;
  hint?: string;
  success?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

export const Input = forwardRef<TextInput, Props>(
  (
    {
      label,
      error,
      hint,
      success,
      containerStyle,
      style,
      multiline,
      returnKeyType,
      blurOnSubmit,
      onSubmitEditing,
      ...rest
    },
    ref,
  ) => {
    const { colors, isDark } = useTheme();

    const styles = useMemo(
      () =>
        StyleSheet.create({
          container: {
            gap: Spacing.xs,
          },
          label: {
            marginBottom: 2,
          },
          input: {
            backgroundColor: colors.fillMuted,
            borderWidth: 0,
            borderRadius: Radius.sm,
            paddingHorizontal: Spacing.md,
            paddingVertical: Spacing.sm + 2,
            color: colors.text,
            ...Typography.body,
            minHeight: 48,
          },
          inputError: {
            borderWidth: 1,
            borderColor: colors.error,
          },
          errorText: {
            marginTop: 2,
          },
          hintText: {
            marginTop: 2,
          },
        }),
      [colors],
    );

    const helperText = error ?? success ?? hint;
    const helperColor = error
      ? colors.error
      : success
        ? colors.success
        : colors.textTertiary;

    return (
      <View style={[styles.container, containerStyle]}>
        {[
          label ? (
            <Text key="label" variant="label" color={colors.textSecondary} style={styles.label}>
              {label}
            </Text>
          ) : null,
          <TextInput
            key="field"
            ref={ref}
            style={[styles.input, error ? styles.inputError : undefined, style]}
            placeholderTextColor={colors.textTertiary}
            selectionColor={colors.link}
            keyboardAppearance={isDark ? 'dark' : 'light'}
            multiline={multiline}
            returnKeyType={multiline ? returnKeyType : (returnKeyType ?? 'done')}
            blurOnSubmit={multiline ? blurOnSubmit : (blurOnSubmit ?? true)}
            onSubmitEditing={(e) => {
              if (!multiline) Keyboard.dismiss();
              onSubmitEditing?.(e);
            }}
            {...rest}
          />,
          helperText ? (
            <Text key="helper" variant="bodySmall" color={helperColor} style={styles.hintText}>
              {helperText}
            </Text>
          ) : null,
        ]}
      </View>
    );
  },
);

Input.displayName = 'Input';
