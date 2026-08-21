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
import { getEquippedBorder } from '@/lib/cosmetics';

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
        leading: { flexShrink: 0 },
        meta: {
          flex: 1,
          gap: 1,
          minWidth: 0,
        },
        time: {
          marginTop: 1,
        },
        footer: {
          marginTop: Spacing.xs,
        },
      }),
    [],
  );

  const border = actor ? getEquippedBorder({ equipped_border_key: actor.equipped_border_key ?? null }) : null;
  const avatar =
    leading ??
    (actor ? (
      <Avatar
        uri={actor.avatar_url}
        username={handle ?? initials}
        size={40}
        borderColor={border?.color}
        borderWidth={border?.width}
      />
    ) : null);

  const content = (
    <View style={[styles.row, style]}>
      {avatar ? <View style={styles.leading}>{avatar}</View> : null}
      <View style={styles.meta}>
        <Text variant="body" numberOfLines={2} style={{ fontWeight: '700' }}>
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
