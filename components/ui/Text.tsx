import React from 'react';
import { Text as RNText, TextStyle, StyleProp } from 'react-native';
import { Typography } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

type Variant = keyof typeof Typography;

type Props = {
  variant?: Variant;
  color?: string;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
  numberOfLines?: number;
  onPress?: () => void;
};

export function Text({ variant = 'body', color, style, children, numberOfLines, onPress }: Props) {
  const { colors } = useTheme();
  return (
    <RNText
      style={[Typography[variant], { color: color ?? colors.text }, style]}
      numberOfLines={numberOfLines}
      onPress={onPress}
    >
      {children}
    </RNText>
  );
}
