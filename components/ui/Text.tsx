import React from 'react';
import { Text as RNText, TextStyle, StyleProp, type TextProps as RNTextProps } from 'react-native';
import { Typography } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

type Variant = keyof typeof Typography;

type Props = {
  variant?: Variant;
  color?: string;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
  numberOfLines?: number;
  ellipsizeMode?: RNTextProps['ellipsizeMode'];
  onPress?: () => void;
};

export function Text({
  variant = 'body',
  color,
  style,
  children,
  numberOfLines,
  ellipsizeMode,
  onPress,
}: Props) {
  const { colors } = useTheme();
  return (
    <RNText
      style={[Typography[variant], { color: color ?? colors.text }, style]}
      numberOfLines={numberOfLines}
      ellipsizeMode={ellipsizeMode}
      onPress={onPress}
    >
      {children}
    </RNText>
  );
}
