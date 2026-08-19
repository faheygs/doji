import type { NotificationCenterItem } from './notificationCenterTypes';

type Like = Extract<NotificationCenterItem, { kind: 'comment_like' }>;
type LikeGroup = Extract<NotificationCenterItem, { kind: 'comment_likes_group' }>;

export function groupNotificationItems(items: NotificationCenterItem[]): NotificationCenterItem[] {
  const groups = new Map<string, LikeGroup>();
  const output: NotificationCenterItem[] = [];
  for (const item of items) {
    if (item.kind !== 'comment_like') {
      output.push(item);
      continue;
    }
    const like = item as Like;
    const key = `comment_likes:${like.comment_id}`;
    const group = groups.get(key);
    if (group) {
      group.count += 1;
      if (like.actor) group.actors.push(like.actor);
      if (Date.parse(like.sortAt) > Date.parse(group.sortAt)) group.sortAt = like.sortAt;
    } else {
      const created: LikeGroup = {
        key, kind: 'comment_likes_group', post_id: like.post_id,
        comment_id: like.comment_id, count: 1,
        actors: like.actor ? [like.actor] : [], sortAt: like.sortAt,
      };
      groups.set(key, created);
      output.push(created);
    }
  }
  return output.sort((a, b) => {
    if (a.kind === 'friend_request' && b.kind !== 'friend_request') return -1;
    if (b.kind === 'friend_request' && a.kind !== 'friend_request') return 1;
    return Date.parse(b.sortAt) - Date.parse(a.sortAt);
  });
}
