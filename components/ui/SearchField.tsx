import React, { forwardRef, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Radius, Spacing, Typography } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { IconClose, IconSearch } from '../icons/Icons';
import { AppTextInput } from './AppTextInput';

type Props = TextInputProps & {
  containerStyle?: StyleProp<ViewStyle>;
};

export const SearchField = forwardRef<TextInput, Props>(
  (
    {
      value,
      onChangeText,
      onFocus,
      onBlur,
      autoFocus,
      accessibilityLabel,
      containerStyle,
      style,
      ...rest
    },
    ref,
  ) => {
    const { colors } = useTheme();
    const [focused, setFocused] = useState(false);

    const styles = useMemo(
      () =>
        StyleSheet.create({
          container: {
            minHeight: 50,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: Spacing.md,
            backgroundColor: colors.surface,
            borderRadius: Radius.sm,
            borderWidth: 1.5,
            borderColor: focused ? colors.primary : colors.border,
          },
          input: {
            flex: 1,
            minWidth: 0,
            paddingVertical: Spacing.sm,
            color: colors.text,
            ...Typography.body,
          },
          clear: {
            width: 32,
            height: 32,
            marginRight: -Spacing.xs,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: Radius.full,
          },
        }),
      [colors, focused],
    );

    return (
      <View style={[styles.container, containerStyle]}>
        <IconSearch size={18} color={focused ? colors.primary : colors.textTertiary} />
        <AppTextInput
          ref={ref}
          accessibilityLabel={accessibilityLabel ?? 'Search'}
          autoFocus={autoFocus ?? false}
          value={value}
          onChangeText={onChangeText}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[styles.input, style]}
          {...rest}
        />
        {value ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={6}
            onPress={() => onChangeText?.('')}
            style={({ pressed }) => [styles.clear, pressed && { opacity: 0.6 }]}
          >
            <IconClose size={16} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
    );
  },
);

SearchField.displayName = 'SearchField';
