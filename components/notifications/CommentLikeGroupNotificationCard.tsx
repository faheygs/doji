import React from 'react';
import { Card } from '../ui/Card';
import { AvatarStack } from '../ui/AvatarStack';
import { NotificationActorRow } from './NotificationActorRow';
import { useTheme } from '../../contexts/ThemeContext';
import { commentLikeActorsLine } from '../../lib/notificationCopy';
import type { NotificationCenterItem } from '../../lib/notificationCenterTypes';

type Item = Extract<NotificationCenterItem, { kind: 'comment_likes_group' }>;

export function CommentLikeGroupNotificationCard({
  item,
  onPress,
  style,
}: {
  item: Item;
  onPress: () => void;
  style: object;
}) {
  const { colors } = useTheme();
  const copy = commentLikeActorsLine(item.actors, item.count);
  return (
    <Card style={style} elevated padded={false}>
      <NotificationActorRow
        title={copy.title}
        body={copy.body}
        sortAt={item.sortAt}
        onPress={onPress}
        leading={
          <AvatarStack
            users={item.actors.slice(0, 3).map((actor) => ({
              avatar_url: actor.avatar_url,
              username: actor.username ?? undefined,
              equipped_border_key: actor.equipped_border_key,
            }))}
            size={36}
            max={3}
            borderColor={colors.surface}
          />
        }
      />
    </Card>
  );
}
