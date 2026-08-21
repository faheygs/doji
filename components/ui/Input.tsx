import React, { forwardRef, useMemo } from 'react';
import {
  type TextInput,
  type TextInputProps,
  StyleSheet,
  View,
  ViewStyle,
  StyleProp,
  Keyboard,
} from 'react-native';
import { Radius, Spacing, Typography } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from './Text';
import { AppTextInput } from './AppTextInput';

type Props = TextInputProps & {
  label?: string;
  error?: string;
  hint?: string;
  success?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

const NUMERIC_PAD_KEYBOARDS = new Set<TextInputProps['keyboardType']>([
  'number-pad',
  'numeric',
  'decimal-pad',
  'phone-pad',
]);

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
    const { colors } = useTheme();

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
    const usesNumericPad = NUMERIC_PAD_KEYBOARDS.has(rest.keyboardType);
    const resolvedReturnKeyType = multiline
      ? returnKeyType
      : returnKeyType ?? (usesNumericPad ? undefined : 'done');

    return (
      <View style={[styles.container, containerStyle]}>
        {[
          label ? (
            <Text key="label" variant="label" color={colors.textSecondary} style={styles.label}>
              {label}
            </Text>
          ) : null,
          <AppTextInput
            key="field"
            ref={ref}
            style={[styles.input, error ? styles.inputError : undefined, style]}
            multiline={multiline}
            // iOS can add a second floating Done control when a numeric pad is
            // given returnKeyType="done". Numeric pads use the one shared app
            // toolbar; text keyboards keep their normal return key.
            returnKeyType={resolvedReturnKeyType}
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
