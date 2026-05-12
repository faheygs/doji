import React, { useMemo } from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  elevated?: boolean;
  padded?: boolean;
};

export function Card({ children, style, elevated = false, padded = true }: Props) {
  const { colors } = useTheme();

  const sheet = useMemo(
    () =>
      StyleSheet.create({
        base: {
          backgroundColor: colors.surface,
          borderRadius: Radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        elevated: {
          backgroundColor: colors.surfaceMuted,
          borderColor: colors.hairline,
        },
        padded: {
          padding: Spacing.md,
        },
      }),
    [colors],
  );

  return (
    <View style={[sheet.base, elevated && sheet.elevated, padded && sheet.padded, style]}>{children}</View>
  );
}
