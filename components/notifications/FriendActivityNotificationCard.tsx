import { Card } from '../ui/Card';
import { Text } from '../ui/Text';
import { AvatarStack } from '../ui/AvatarStack';
import { NotificationActorRow } from './NotificationActorRow';
import { useTheme } from '../../contexts/ThemeContext';
import { friendActivityActorsLine } from '../../lib/notificationCopy';
import type { NotificationCenterItem } from '../../lib/notificationCenterTypes';
import { Radius, Spacing } from '../../constants/theme';

type FriendActivityItem = Extract<
  NotificationCenterItem,
  { kind: 'friend_activity_group' }
>;

type Props = {
  item: FriendActivityItem;
  onPress: () => void;
};

export function FriendActivityNotificationCard({ item, onPress }: Props) {
  const { colors } = useTheme();
  const shown = item.actors.slice(0, 3);
  const copy = friendActivityActorsLine(item.actors, item.count);

  return (
    <Card style={{ padding: Spacing.md }} elevated padded={false}>
      <NotificationActorRow
        title={copy.title}
        body={copy.body}
        sortAt={item.sortAt}
        onPress={onPress}
        leading={
          <AvatarStack
            users={shown.map((actor) => ({
              avatar_url: actor.avatar_url,
              username: actor.username ?? undefined,
              equipped_border_key: actor.equipped_border_key,
            }))}
            size={36}
            max={3}
            borderColor={colors.surface}
          />
        }
        footer={
          <Text
            variant="micro"
            color={colors.primary}
            style={{ alignSelf: 'flex-start', backgroundColor: colors.primaryLight, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs }}
          >
            {item.count} participated
          </Text>
        }
      />
    </Card>
  );
}
