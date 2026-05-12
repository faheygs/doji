import React, { forwardRef, useMemo } from 'react';
import {
  TextInput,
  TextInputProps,
  StyleSheet,
  View,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { Radius, Spacing, Typography } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from './Text';

type Props = TextInputProps & {
  label?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

export const Input = forwardRef<TextInput, Props>(
  ({ label, error, containerStyle, style, ...props }, ref) => {
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
        }),
      [colors],
    );

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
            {...props}
          />,
          error ? (
            <Text key="error" variant="bodySmall" color={colors.error} style={styles.errorText}>
              {error}
            </Text>
          ) : null,
        ]}
      </View>
    );
  },
);

Input.displayName = 'Input';
