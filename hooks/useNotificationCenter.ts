import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import type { Profile, UserEvent, Friendship, FriendshipWithRequester } from '../types/database';
import { useFriendRequests } from './useProfile';
import { isChallengeLive } from '../lib/challengeDay';
import { parseDate } from '../utils/time';
import { mergeNotificationPreferences } from '../lib/notificationPreferences';
import { normalizeEmbeddedProfile } from '../lib/notificationCopy';

const BELL_CLEARED_AT_KEY = '@doit/bell-cleared-at';
const BELL_LAST_OPENED_KEY = '@doit/bell-last-opened';
const DISMISSED_KEYS_KEY = '@doit/dismissed-notif-keys';
const HISTORY_DAYS = 30;

function bellClearedKey(uid: string | undefined) {
  return uid ? `${BELL_CLEARED_AT_KEY}:${uid}` : BELL_CLEARED_AT_KEY;
}

function bellOpenedKey(uid: string | undefined) {
  return uid ? `${BELL_LAST_OPENED_KEY}:${uid}` : BELL_LAST_OPENED_KEY;
}

function dismissedKey(uid: string | undefined) {
  return uid ? `${DISMISSED_KEYS_KEY}:${uid}` : DISMISSED_KEYS_KEY;
}

export const NOTIFICATION_CENTER_PREFIX = 'notificationCenter' as const;

export type NotificationCenterItem =
  | {
      key: string;
      kind: 'friend_request';
      friendship: FriendshipWithRequester;
      sortAt: string;
    }
  | {
      key: string;
      kind: 'friend_accepted';
      friendship: Friendship & { addressee?: Profile | null };
      sortAt: string;
    }
  | {
      key: string;
      kind: 'reactions_group';
      post_id: string;
      count: number;
      emojis: string[];
      actors: Pick<Profile, 'username' | 'display_name' | 'avatar_url'>[];
      sortAt: string;
    }
  | {
      key: string;
      kind: 'comment';
      post_id: string;
      comment_id: string;
      actor: Pick<Profile, 'username' | 'display_name' | 'avatar_url'> | null;
      sortAt: string;
    }
  | {
      key: string;
      kind: 'mention';
      post_id: string;
      comment_id: string;
      actor: Pick<Profile, 'username' | 'display_name' | 'avatar_url'> | null;
      sortAt: string;
    }
  | { key: string; kind: 'challenge'; userEvent: UserEvent; sortAt: string }
  | {
      key: string;
      kind: 'badge_earned';
      categoryId: string;
      categoryName: string;
      categoryEmoji: string | null;
      tier: string;
      sortAt: string;
    }
  | {
      key: string;
      kind: 'suggestion_result';
      suggestionId: string;
      body: string;
      status: 'approved' | 'rejected';
      sortAt: string;
    };

function mapUserEventRow(row: unknown): UserEvent {
  const r = row as UserEvent & {
    daily_event?: { challenge?: unknown };
  };
  const ch = r.daily_event?.challenge;
  return { ...r, challenge: ch as UserEvent['challenge'] } as UserEvent;
}

function challengeSortAt(ev: UserEvent): string {
  // fires_at is when the challenge went live — use it as the display timestamp
  // so the notification shows "X minutes ago" relative to when users got the
  // challenge, not "10 hours ago" from when the cron created the user_event.
  return ev.daily_event?.fires_at ?? ev.notified_at ?? ev.created_at;
}

function lowerSinceIso(clearedAt: string | null): string {
  const clearedMs = clearedAt ? new Date(clearedAt).getTime() : 0;
  const horizon = Date.now() - HISTORY_DAYS * 86_400_000;
  return new Date(Math.max(clearedMs, horizon)).toISOString();
}

type ReactionRow = {
  id: string;
  emoji: string;
  created_at: string;
  post_id: string;
  user_id: string;
  actor: Pick<Profile, 'username' | 'display_name' | 'avatar_url'> | Pick<Profile, 'username' | 'display_name' | 'avatar_url'>[] | null;
};

export function useNotificationCenter() {
  const userId = useAuthStore((s) => s.session?.user?.id);
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();
  const [clearedAt, setClearedAt] = useState<string | null>(null);
  const [lastOpenedAt, setLastOpenedAt] = useState<string | null>(null);
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());
  const [prefsHydrated, setPrefsHydrated] = useState(false);

  useEffect(() => {
    if (!userId) {
      setClearedAt(null);
      setLastOpenedAt(null);
      setPrefsHydrated(false);
      return;
    }
    let cancelled = false;
    setPrefsHydrated(false);
    void AsyncStorage.multiGet([
      bellClearedKey(userId),
      bellOpenedKey(userId),
      dismissedKey(userId),
    ])
      .then((entries) => {
        if (cancelled) return;
        const [, cleared] = entries[0];
        const [, opened] = entries[1];
        const [, dismissedRaw] = entries[2];
        setClearedAt(cleared ?? null);
        setLastOpenedAt(opened ?? null);
        try {
          const parsed: string[] = dismissedRaw ? JSON.parse(dismissedRaw) : [];
          setDismissedKeys(new Set(parsed));
        } catch {
          setDismissedKeys(new Set());
        }
        setPrefsHydrated(true);
      })
      .catch(() => {
        if (!cancelled) setPrefsHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const sinceIso = useMemo(() => lowerSinceIso(clearedAt), [clearedAt]);

  const { data: friendRequests = [], isLoading: requestsLoading } = useFriendRequests();

  const acceptQuery = useQuery({
    queryKey: [NOTIFICATION_CENTER_PREFIX, 'friend_accepts', userId, sinceIso],
    enabled: !!userId && prefsHydrated,
    staleTime: 15_000,
    queryFn: async (): Promise<(Friendship & { addressee?: Profile | null })[]> => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('friendships')
        .select('*, addressee:profiles!friendships_addressee_id_fkey(*)')
        .eq('requester_id', userId)
        .eq('status', 'accepted')
        .not('accepted_at', 'is', null)
        .gt('accepted_at', sinceIso)
        .order('accepted_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return ((data ?? []) as (Friendship & { addressee?: Profile | Profile[] | null })[]).map(
        (row) => ({
          ...row,
          addressee: normalizeEmbeddedProfile(row.addressee),
        }),
      );
    },
  });

  const reactionsQuery = useQuery({
    queryKey: [NOTIFICATION_CENTER_PREFIX, 'reactions', userId, sinceIso],
    enabled: !!userId && prefsHydrated,
    staleTime: 15_000,
    queryFn: async () => {
      if (!userId) return [];

      const { data: myPosts, error: pe } = await supabase.from('posts').select('id').eq('user_id', userId);
      if (pe) throw pe;
      const ids = (myPosts ?? []).map((p) => p.id);
      if (ids.length === 0) return [];

      const { data, error } = await supabase
        .from('reactions')
        .select(
          'id, emoji, created_at, post_id, user_id, actor:profiles!reactions_user_id_fkey(username, display_name, avatar_url)',
        )
        .in('post_id', ids)
        .neq('user_id', userId)
        .gt('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      return data ?? [];
    },
  });

  const commentsQuery = useQuery({
    queryKey: [NOTIFICATION_CENTER_PREFIX, 'comments', userId, sinceIso],
    enabled: !!userId && prefsHydrated,
    staleTime: 15_000,
    queryFn: async () => {
      if (!userId) return [];

      const { data: myPosts, error: pe } = await supabase.from('posts').select('id').eq('user_id', userId);
      if (pe) throw pe;
      const ids = (myPosts ?? []).map((p) => p.id);
      if (ids.length === 0) return [];

      const { data, error } = await supabase
        .from('comments')
        .select(
          'id, post_id, created_at, actor:profiles!comments_user_id_fkey(username, display_name, avatar_url)',
        )
        .in('post_id', ids)
        .neq('user_id', userId)
        .gt('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data ?? [];
    },
  });

  const mentionsQuery = useQuery({
    queryKey: [NOTIFICATION_CENTER_PREFIX, 'mentions', userId, sinceIso],
    enabled: !!userId && prefsHydrated,
    staleTime: 15_000,
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('comment_mentions')
        .select(
          'id, comment_id, created_at, comment:comments(post_id, user_id, actor:profiles!comments_user_id_fkey(username, display_name, avatar_url))',
        )
        .eq('mentioned_user_id', userId)
        .gt('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data ?? [];
    },
  });

  const challengesQuery = useQuery({
    queryKey: [NOTIFICATION_CENTER_PREFIX, 'challenges', userId, sinceIso],
    enabled: !!userId && prefsHydrated,
    staleTime: 15_000,
    queryFn: async (): Promise<UserEvent[]> => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('user_events')
        .select('*, daily_event:daily_events(*, challenge:challenges(*))')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('expires_at', { ascending: false })
        .limit(25);

      if (error) throw error;
      const sinceMs = new Date(sinceIso).getTime();
      return (data ?? [])
        .map(mapUserEventRow)
        .filter((ev) => new Date(challengeSortAt(ev)).getTime() > sinceMs);
    },
  });

  const badgesQuery = useQuery({
    queryKey: [NOTIFICATION_CENTER_PREFIX, 'badges', userId, sinceIso],
    enabled: !!userId && prefsHydrated,
    staleTime: 15_000,
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('user_badge_progress')
        .select('category_id, current_tier, unlocked_at, category:badge_categories(name, emoji)')
        .eq('user_id', userId)
        .not('unlocked_at', 'is', null)
        .gt('unlocked_at', sinceIso)
        .order('unlocked_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const suggestionsQuery = useQuery({
    queryKey: [NOTIFICATION_CENTER_PREFIX, 'suggestions', userId, sinceIso],
    enabled: !!userId && prefsHydrated,
    staleTime: 15_000,
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('challenge_suggestions')
        .select('id, body, status, reviewed_at')
        .eq('user_id', userId)
        .in('status', ['approved', 'rejected'])
        .not('reviewed_at', 'is', null)
        .gt('reviewed_at', sinceIso)
        .order('reviewed_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const markBellOpened = useCallback(async () => {
    if (!userId) return;
    const iso = new Date().toISOString();
    await AsyncStorage.setItem(bellOpenedKey(userId), iso);
    setLastOpenedAt(iso);
    // Clear the OS app icon badge immediately when the user opens the bell.
    if (Platform.OS !== 'web') {
      try {
        const Notifications = await import('expo-notifications');
        await Notifications.setBadgeCountAsync(0);
      } catch { /* not supported on this device */ }
    }
  }, [userId]);

  const dismissItem = useCallback(async (key: string) => {
    if (!userId) return;
    setDismissedKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      void AsyncStorage.setItem(dismissedKey(userId), JSON.stringify([...next]));
      return next;
    });
  }, [userId]);

  const clearNotificationHistory = useCallback(async () => {
    if (!userId) return;
    const iso = new Date().toISOString();
    await AsyncStorage.multiSet([
      [bellClearedKey(userId), iso],
      [dismissedKey(userId), JSON.stringify([])],
    ]);
    setClearedAt(iso);
    setDismissedKeys(new Set());
    await queryClient.invalidateQueries({
      predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === NOTIFICATION_CENTER_PREFIX,
    });
  }, [queryClient, userId]);

  const items = useMemo((): NotificationCenterItem[] => {
    const reqItems: NotificationCenterItem[] = [...friendRequests]
      .sort((a, b) => parseDate(b.created_at).getTime() - parseDate(a.created_at).getTime())
      .map((f) => ({
        key: `friend_request:${f.id}`,
        kind: 'friend_request' as const,
        friendship: f,
        sortAt: f.created_at,
      }));

    const accItems: NotificationCenterItem[] =
      acceptQuery.data?.map((f) => ({
        key: `friend_accepted:${f.id}`,
        kind: 'friend_accepted' as const,
        friendship: f,
        sortAt: f.accepted_at ?? f.created_at,
      })) ?? [];

    const rawReactions = (reactionsQuery.data ?? []) as unknown as ReactionRow[];
    const byPost = new Map<string, ReactionRow[]>();
    for (const r of rawReactions) {
      const list = byPost.get(r.post_id) ?? [];
      list.push(r);
      byPost.set(r.post_id, list);
    }

    const reactionGroups: NotificationCenterItem[] = [];
    for (const [postId, rows] of byPost) {
      rows.sort((a, b) => parseDate(b.created_at).getTime() - parseDate(a.created_at).getTime());
      const seenUser = new Set<string>();
      const actors: Pick<Profile, 'username' | 'display_name' | 'avatar_url'>[] = [];
      const emojis: string[] = [];
      for (const r of rows) {
        if (!seenUser.has(r.user_id)) {
          seenUser.add(r.user_id);
          actors.push(
            normalizeEmbeddedProfile(r.actor) ?? {
              username: 'someone',
              display_name: 'Someone',
              avatar_url: null,
            },
          );
        }
        if (!emojis.includes(r.emoji)) emojis.push(r.emoji);
      }
      reactionGroups.push({
        key: `reactions_post:${postId}`,
        kind: 'reactions_group',
        post_id: postId,
        count: rows.length,
        emojis,
        actors: actors.slice(0, 8),
        sortAt: rows[0].created_at,
      });
    }

    const commentItems: NotificationCenterItem[] = (commentsQuery.data ?? []).map((row) => {
      const r = row as {
        id: string;
        post_id: string;
        created_at: string;
        actor?: Profile | Profile[] | null;
      };
      return {
        key: `comment:${r.id}`,
        kind: 'comment' as const,
        post_id: r.post_id,
        comment_id: r.id,
        actor: normalizeEmbeddedProfile(r.actor),
        sortAt: r.created_at,
      };
    });

    const mentionItems: NotificationCenterItem[] = (mentionsQuery.data ?? [])
      .map((row) => {
        const r = row as {
          id: string;
          comment_id: string;
          created_at: string;
          comment?: {
            post_id?: string;
            user_id?: string;
            actor?: Profile | Profile[] | null;
          } | null;
        };
        const postId = r.comment?.post_id;
        if (!postId) return null;
        return {
          key: `mention:${r.id}`,
          kind: 'mention' as const,
          post_id: postId,
          comment_id: r.comment_id,
          actor: normalizeEmbeddedProfile(r.comment?.actor ?? null),
          sortAt: r.created_at,
        };
      })
      .filter((item): item is NotificationCenterItem => item != null);

    const chItems: NotificationCenterItem[] =
      challengesQuery.data
        ?.filter((ev) => isChallengeLive(ev.daily_event?.fires_at))
        .map((ev) => ({
          key: `challenge:${ev.id}`,
          kind: 'challenge' as const,
          userEvent: ev,
          sortAt: challengeSortAt(ev),
        })) ?? [];

    const badgeItems: NotificationCenterItem[] = (badgesQuery.data ?? []).map((row) => {
      const r = row as {
        category_id: string;
        current_tier: string;
        unlocked_at: string;
        category?: { name?: string; emoji?: string } | { name?: string; emoji?: string }[] | null;
      };
      const cat = Array.isArray(r.category) ? r.category[0] : r.category;
      return {
        key: `badge_earned:${r.category_id}:${r.current_tier}`,
        kind: 'badge_earned' as const,
        categoryId: r.category_id,
        categoryName: cat?.name ?? r.category_id,
        categoryEmoji: cat?.emoji ?? null,
        tier: r.current_tier,
        sortAt: r.unlocked_at,
      };
    });

    const suggestionItems: NotificationCenterItem[] = (suggestionsQuery.data ?? []).map((row) => {
      const r = row as {
        id: string;
        body: string;
        status: 'approved' | 'rejected';
        reviewed_at: string;
      };
      return {
        key: `suggestion_result:${r.id}`,
        kind: 'suggestion_result' as const,
        suggestionId: r.id,
        body: r.body,
        status: r.status,
        sortAt: r.reviewed_at,
      };
    });

    const merged = [
      ...reqItems,
      ...accItems,
      ...commentItems,
      ...mentionItems,
      ...reactionGroups,
      ...chItems,
      ...badgeItems,
      ...suggestionItems,
    ].filter((item) => !dismissedKeys.has(item.key));

    merged.sort((a, b) => {
      const priority = (k: NotificationCenterItem['kind']) =>
        k === 'friend_request' ? 0 : 1;
      const p = priority(a.kind) - priority(b.kind);
      if (p !== 0) return p;
      return parseDate(b.sortAt).getTime() - parseDate(a.sortAt).getTime();
    });

    return merged;
  }, [
    friendRequests,
    acceptQuery.data,
    commentsQuery.data,
    mentionsQuery.data,
    reactionsQuery.data,
    challengesQuery.data,
    badgesQuery.data,
    suggestionsQuery.data,
    dismissedKeys,
  ]);

  // unreadCount: items the user hasn't seen yet (newer than when the bell was last opened).
  // Always computed — drives the in-app bell dot regardless of settings.
  const unreadCount = useMemo(() => {
    const openedMs = lastOpenedAt ? new Date(lastOpenedAt).getTime() : 0;
    return items.filter((i) => parseDate(i.sortAt).getTime() > openedMs).length;
  }, [items, lastOpenedAt]);

  // badgeCount: same as unreadCount but gated by the show_bell_badge preference.
  // This is what drives the OS app icon badge — users can turn it off in settings
  // without affecting the in-app bell dot.
  const badgeCount = useMemo(() => {
    const prefs = mergeNotificationPreferences(profile?.notification_preferences);
    if (prefs.show_bell_badge === false) return 0;
    return unreadCount;
  }, [unreadCount, profile?.notification_preferences]);

  const isLoading =
    !prefsHydrated ||
    requestsLoading ||
    acceptQuery.isLoading ||
    commentsQuery.isLoading ||
    mentionsQuery.isLoading ||
    reactionsQuery.isLoading ||
    challengesQuery.isLoading ||
    badgesQuery.isLoading ||
    suggestionsQuery.isLoading;

  return {
    items,
    unreadCount,
    badgeCount,
    isLoading,
    markBellOpened,
    dismissItem,
    clearNotificationHistory,
    prefsHydrated,
  };
}
