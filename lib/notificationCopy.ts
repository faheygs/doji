/** Minimal profile fields used in the notification bell. */
export type NotificationActor = {
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
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

export type FollowRequestCopy = {
  title: string;
  body: string;
};

export function followRequestCopy(actor: NotificationActor | null | undefined): FollowRequestCopy {
  const name = notificationActorName(actor);
  return {
    title: name,
    body: 'Wants to follow you',
  };
}

export function followAcceptedCopy(actor: NotificationActor | null | undefined): FollowRequestCopy {
  const name = notificationActorName(actor);
  return {
    title: name,
    body: 'Accepted your follow request',
  };
}

export function newFollowerCopy(actor: NotificationActor | null | undefined): FollowRequestCopy {
  const name = notificationActorName(actor);
  return {
    title: name,
    body: 'Started following you',
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

export function challengeCopy(challengeTitle: string | null | undefined): FollowRequestCopy {
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
