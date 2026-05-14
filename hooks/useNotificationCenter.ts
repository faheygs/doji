import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import type { Friendship, FriendshipWithRequester, Profile, UserEvent } from '../types/database';
import { useFriendRequests } from './useProfile';

const BELL_CLEARED_AT_KEY = '@doit/bell-cleared-at';
const BELL_LAST_OPENED_KEY = '@doit/bell-last-opened';
const HISTORY_DAYS = 30;

function bellClearedKey(uid: string | undefined) {
  return uid ? `${BELL_CLEARED_AT_KEY}:${uid}` : BELL_CLEARED_AT_KEY;
}

function bellOpenedKey(uid: string | undefined) {
  return uid ? `${BELL_LAST_OPENED_KEY}:${uid}` : BELL_LAST_OPENED_KEY;
}

export const NOTIFICATION_CENTER_PREFIX = 'notificationCenter' as const;

export type NotificationCenterItem =
  | { key: string; kind: 'friend_request'; friendship: FriendshipWithRequester; sortAt: string }
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
  | { key: string; kind: 'challenge'; userEvent: UserEvent; sortAt: string };

function mapUserEventRow(row: unknown): UserEvent {
  const r = row as UserEvent & {
    daily_event?: { challenge?: unknown };
  };
  const ch = r.daily_event?.challenge;
  return { ...r, challenge: ch as UserEvent['challenge'] } as UserEvent;
}

function challengeSortAt(ev: UserEvent): string {
  const n = ev.notified_at;
  if (!n) return ev.created_at;
  return new Date(n) > new Date(ev.created_at) ? n : ev.created_at;
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
  actor: Pick<Profile, 'username' | 'display_name' | 'avatar_url'> | null;
};

export function useNotificationCenter() {
  const userId = useAuthStore((s) => s.session?.user?.id);
  const queryClient = useQueryClient();
  const [clearedAt, setClearedAt] = useState<string | null>(null);
  const [lastOpenedAt, setLastOpenedAt] = useState<string | null>(null);
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
    void AsyncStorage.multiGet([bellClearedKey(userId), bellOpenedKey(userId)]).then((entries) => {
      if (cancelled) return;
      const [, cleared] = entries[0];
      const [, opened] = entries[1];
      setClearedAt(cleared ?? null);
      setLastOpenedAt(opened ?? null);
      setPrefsHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const sinceIso = useMemo(() => lowerSinceIso(clearedAt), [clearedAt]);

  const { data: friendRequests = [], isLoading: requestsLoading } = useFriendRequests();

  const acceptQuery = useQuery({
    queryKey: [NOTIFICATION_CENTER_PREFIX, 'accepts', userId, sinceIso],
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
      return (data ?? []) as (Friendship & { addressee?: Profile | null })[];
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

  const markBellOpened = useCallback(async () => {
    if (!userId) return;
    const iso = new Date().toISOString();
    await AsyncStorage.setItem(bellOpenedKey(userId), iso);
    setLastOpenedAt(iso);
  }, [userId]);

  const clearNotificationHistory = useCallback(async () => {
    if (!userId) return;
    const iso = new Date().toISOString();
    await AsyncStorage.setItem(bellClearedKey(userId), iso);
    setClearedAt(iso);
    await queryClient.invalidateQueries({
      predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === NOTIFICATION_CENTER_PREFIX,
    });
  }, [queryClient, userId]);

  const items = useMemo((): NotificationCenterItem[] => {
    const reqItems: NotificationCenterItem[] = [...friendRequests]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
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
      rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const seenUser = new Set<string>();
      const actors: Pick<Profile, 'username' | 'display_name' | 'avatar_url'>[] = [];
      const emojis: string[] = [];
      for (const r of rows) {
        if (!seenUser.has(r.user_id)) {
          seenUser.add(r.user_id);
          actors.push(
            r.actor ?? { username: 'someone', display_name: 'Someone', avatar_url: null },
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

    const chItems: NotificationCenterItem[] =
      challengesQuery.data?.map((ev) => ({
        key: `challenge:${ev.id}`,
        kind: 'challenge' as const,
        userEvent: ev,
        sortAt: challengeSortAt(ev),
      })) ?? [];

    const merged = [...reqItems, ...accItems, ...reactionGroups, ...chItems];

    merged.sort((a, b) => {
      const priority = (k: NotificationCenterItem['kind']) => (k === 'friend_request' ? 0 : 1);
      const p = priority(a.kind) - priority(b.kind);
      if (p !== 0) return p;
      return new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime();
    });

    return merged;
  }, [friendRequests, acceptQuery.data, reactionsQuery.data, challengesQuery.data, sinceIso]);

  const unreadCount = useMemo(() => {
    const openedMs = lastOpenedAt ? new Date(lastOpenedAt).getTime() : 0;
    return items.filter((i) => new Date(i.sortAt).getTime() > openedMs).length;
  }, [items, lastOpenedAt]);

  const isLoading =
    !prefsHydrated ||
    requestsLoading ||
    acceptQuery.isLoading ||
    reactionsQuery.isLoading ||
    challengesQuery.isLoading;

  return {
    items,
    unreadCount,
    isLoading,
    markBellOpened,
    clearNotificationHistory,
    prefsHydrated,
  };
}
