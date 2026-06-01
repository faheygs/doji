import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, ViewStyle, StyleProp } from 'react-native';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { formatRelativeTime } from '@/utils/time';
import {
  notificationActorHandle,
  notificationActorInitials,
  type NotificationActor,
} from '@/lib/notificationCopy';

type Props = {
  actor?: NotificationActor | null;
  leading?: React.ReactNode;
  title: string;
  body: string;
  sortAt: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  footer?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function NotificationActorRow({
  actor,
  leading,
  title,
  body,
  sortAt,
  onPress,
  accessibilityLabel,
  footer,
  style,
}: Props) {
  const { colors } = useTheme();
  const handle = notificationActorHandle(actor);
  const initials = notificationActorInitials(actor);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: Spacing.sm,
        },
        meta: {
          flex: 1,
          gap: 2,
          paddingTop: 2,
        },
        time: {
          marginTop: 2,
        },
        footer: {
          marginTop: Spacing.sm,
        },
      }),
    [],
  );

  const avatar =
    leading ??
    (actor ? (
      <Avatar uri={actor.avatar_url} username={handle ?? initials} size={44} />
    ) : null);

  const content = (
    <View style={[styles.row, style]}>
      {avatar}
      <View style={styles.meta}>
        <Text variant="headingMedium" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="bodySmall" color={colors.textSecondary} numberOfLines={2}>
          {body}
        </Text>
        <Text variant="micro" color={colors.textTertiary} style={styles.time}>
          {formatRelativeTime(sortAt)}
        </Text>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </View>
  );

  if (!onPress) return content;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${title}. ${body}`}
    >
      {content}
    </TouchableOpacity>
  );
}
