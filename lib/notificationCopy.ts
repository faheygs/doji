/** Minimal profile fields used in the notification bell. */
export type NotificationActor = {
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  equipped_border_key?: string | null;
};

export function notificationActorName(actor: NotificationActor | null | undefined): string {
  const display = actor?.display_name?.trim();
  if (display) return display;
  const handle = actor?.username?.trim();
  if (handle) return `@${handle}`;
  return 'Someone';
}

export function notificationActorHandle(actor: NotificationActor | null | undefined): string | undefined {
  return actor?.username?.trim() || undefined;
}

export function notificationActorInitials(actor: NotificationActor | null | undefined): string {
  const display = actor?.display_name?.trim();
  if (display) return display.slice(0, 2).toUpperCase();
  const handle = actor?.username?.trim();
  if (handle) return handle.slice(0, 2).toUpperCase();
  return '?';
}

export function formatNotificationTime(iso: string): string {
  // Relative time is applied in the sheet; keep hook for tests/copy consistency.
  return iso;
}

export type NotificationCopy = {
  title: string;
  body: string;
};

export function friendRequestCopy(actor: NotificationActor | null | undefined): NotificationCopy {
  const name = notificationActorName(actor);
  return {
    title: name,
    body: 'Sent you a friend request',
  };
}

export function friendAcceptedCopy(actor: NotificationActor | null | undefined): NotificationCopy {
  const name = notificationActorName(actor);
  return {
    title: name,
    body: 'Accepted your friend request',
  };
}

export function reactionActorsLine(
  actors: NotificationActor[],
): { title: string; body: string } {
  const shown = actors.slice(0, 3);
  const primary = shown[0];
  const extra = Math.max(0, actors.length - 1);
  const primaryName = notificationActorName(primary);

  if (extra === 0) {
    return { title: primaryName, body: 'Reacted to your post' };
  }
  if (extra === 1) {
    return { title: `${primaryName} and 1 other`, body: 'Reacted to your post' };
  }
  return { title: `${primaryName} and ${extra} others`, body: 'Reacted to your post' };
}

export function commentLikeActorsLine(actors: NotificationActor[], count: number): NotificationCopy {
  const primaryName = notificationActorName(actors[0]);
  const extra = Math.max(0, count - 1);
  return {
    title: extra === 0 ? primaryName : `${primaryName} and ${extra} other${extra === 1 ? '' : 's'}`,
    body: 'Liked your comment',
  };
}

export function friendActivityActorsLine(
  actors: NotificationActor[],
  count: number,
): NotificationCopy {
  const primaryName = notificationActorName(actors[0]);
  const extra = Math.max(0, count - 1);
  return {
    title: extra === 0
      ? primaryName
      : `${primaryName} and ${extra} other friend${extra === 1 ? '' : 's'}`,
    body: "Completed today's Doji",
  };
}

export function challengeCopy(challengeTitle: string | null | undefined): NotificationCopy {
  const title = challengeTitle?.trim() || "Today's Doji";
  return {
    title: "Today's Doji is live",
    body: title,
  };
}

/** Normalize Supabase embed: single object or one-element array. */
export function normalizeEmbeddedProfile<T extends Record<string, unknown>>(
  value: T | T[] | null | undefined,
): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
