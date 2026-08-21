import React, { useMemo } from 'react';
import { AccessibilityInfo, StyleSheet, View, type ViewStyle, type StyleProp } from 'react-native';
import { Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from './Text';

export type InlineFeedbackTone = 'error' | 'info' | 'success';
export type InlineFeedbackData = { tone?: InlineFeedbackTone; title?: string; message: string };

type Props = {
  tone?: InlineFeedbackTone;
  title?: string;
  message: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Persistent, contextual feedback for a form or local action. Unlike a toast,
 * this stays beside the control that needs attention and remains available to
 * screen readers until the user resolves it.
 */
export function InlineFeedback({
  tone = 'error',
  title,
  message,
  style,
  testID,
}: Props) {
  const { colors } = useTheme();
  const color = tone === 'error' ? colors.error : tone === 'success' ? colors.success : colors.link;
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          borderRadius: Radius.sm,
          borderWidth: 1,
          borderColor: `${color}40`,
          backgroundColor: `${color}12`,
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.sm,
          gap: 2,
        },
      }),
    [color],
  );

  React.useEffect(() => {
    if (tone === 'error') void AccessibilityInfo.announceForAccessibility(title ? `${title}. ${message}` : message);
  }, [message, title, tone]);

  return (
    <View
      testID={testID}
      style={[styles.container, style]}
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion={tone === 'error' ? 'assertive' : 'polite'}
    >
      {title ? (
        <Text variant="label" color={color}>
          {title}
        </Text>
      ) : null}
      <Text variant="bodySmall" color={color}>
        {message}
      </Text>
    </View>
  );
}
