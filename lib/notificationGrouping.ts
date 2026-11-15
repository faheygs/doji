import type { NotificationCenterItem } from './notificationCenterTypes';
import { compareNotificationTimes, isNotificationVisible } from './notificationVisibility';

type Like = Extract<NotificationCenterItem, { kind: 'comment_like' }>;
type LikeGroup = Extract<NotificationCenterItem, { kind: 'comment_likes_group' }>;

export function groupNotificationItems(items: NotificationCenterItem[], clearedAt: string | null = null,
  dismissed: ReadonlyMap<string, string> = new Map()): NotificationCenterItem[] {
  const groups = new Map<string, LikeGroup>();
  const output: NotificationCenterItem[] = [];
  for (const item of items) {
    const key = item.kind === 'comment_like' ? `comment_likes:${item.comment_id}` : item.key;
    if (!isNotificationVisible({ ...item, key }, clearedAt, dismissed)) continue;
    if (item.kind === 'friend_activity_group' || item.kind === 'reactions_group') {
      const cutoff = [clearedAt, dismissed.get(key)].filter((at): at is string => Boolean(at));
      // Counts cannot be subtracted from an older aggregate. Wait for the
      // authorized read using this dismissal boundary instead of reviving it.
      if (cutoff.some(at => !item.historyThrough || !Number.isFinite(Date.parse(item.historyThrough)) ||
        compareNotificationTimes(at, item.historyThrough) > 0)) continue;
    }
    if (item.kind !== 'comment_like') {
      output.push(item);
      continue;
    }
    const like = item as Like;
    const group = groups.get(key);
    if (group) {
      group.count += 1;
      if (like.actor) group.actors.push(like.actor);
      if (compareNotificationTimes(like.sortAt, group.sortAt) > 0) group.sortAt = like.sortAt;
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
    return compareNotificationTimes(b.sortAt, a.sortAt);
  });
}
