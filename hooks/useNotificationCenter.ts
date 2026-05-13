import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import type { Friendship, FriendshipWithRequester, Profile, UserEvent } from '../types/database';
import { useFriendRequests } from './useProfile';

const WATERMARK_KEY = '@doit/notification-watermark';

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
      kind: 'reaction';
      reaction: { id: string; emoji: string; created_at: string; post_id: string; user_id: string };
      actor: Pick<Profile, 'username' | 'display_name' | 'avatar_url'>;
      sortAt: string;
    }
  | { key: string; kind: 'challenge'; userEvent: UserEvent; sortAt: string };

function useNotificationWatermark() {
  const [watermark, setWatermark] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(WATERMARK_KEY).then((s) => {
      if (cancelled) return;
      setWatermark(s ?? new Date().toISOString());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const markAllSeenUpToNow = useCallback(async () => {
    const iso = new Date().toISOString();
    await AsyncStorage.setItem(WATERMARK_KEY, iso);
    setWatermark(iso);
  }, []);

  return { watermark, markAllSeenUpToNow, watermarkReady: watermark !== null };
}

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

export function useNotificationCenter() {
  const userId = useAuthStore((s) => s.session?.user?.id);
  const { watermark, markAllSeenUpToNow, watermarkReady } = useNotificationWatermark();
  const { data: friendRequests = [], isLoading: requestsLoading } = useFriendRequests();

  const acceptQuery = useQuery({
    queryKey: [NOTIFICATION_CENTER_PREFIX, 'accepts', userId, watermark],
    enabled: !!userId && !!watermark,
    staleTime: 15_000,
    queryFn: async (): Promise<(Friendship & { addressee?: Profile | null })[]> => {
      if (!userId || !watermark) return [];

      const { data, error } = await supabase
        .from('friendships')
        .select('*, addressee:profiles!friendships_addressee_id_fkey(*)')
        .eq('requester_id', userId)
        .eq('status', 'accepted')
        .not('accepted_at', 'is', null)
        .gt('accepted_at', watermark)
        .order('accepted_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data ?? []) as (Friendship & { addressee?: Profile | null })[];
    },
  });

  const reactionsQuery = useQuery({
    queryKey: [NOTIFICATION_CENTER_PREFIX, 'reactions', userId, watermark],
    enabled: !!userId && !!watermark,
    staleTime: 15_000,
    queryFn: async () => {
      if (!userId || !watermark) return [];

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
        .gt('created_at', watermark)
        .order('created_at', { ascending: false })
        .limit(80);

      if (error) throw error;
      return data ?? [];
    },
  });

  const challengesQuery = useQuery({
    queryKey: [NOTIFICATION_CENTER_PREFIX, 'challenges', userId, watermark],
    enabled: !!userId && !!watermark,
    staleTime: 15_000,
    queryFn: async (): Promise<UserEvent[]> => {
      if (!userId || !watermark) return [];

      const { data, error } = await supabase
        .from('user_events')
        .select('*, daily_event:daily_events(*, challenge:challenges(*))')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('expires_at', { ascending: false })
        .limit(25);

      if (error) throw error;
      const wm = new Date(watermark).getTime();
      return (data ?? [])
        .map(mapUserEventRow)
        .filter((ev) => {
          const byCreate = new Date(ev.created_at).getTime() > wm;
          const byNotify =
            ev.notified_at != null && new Date(ev.notified_at).getTime() > wm;
          return byCreate || byNotify;
        });
    },
  });

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

    type ReactionRow = {
      id: string;
      emoji: string;
      created_at: string;
      post_id: string;
      user_id: string;
      actor: Pick<Profile, 'username' | 'display_name' | 'avatar_url'> | null;
    };

    const reactItems: NotificationCenterItem[] =
      (reactionsQuery.data as ReactionRow[] | undefined)?.map((r) => ({
        key: `reaction:${r.id}`,
        kind: 'reaction' as const,
        reaction: {
          id: r.id,
          emoji: r.emoji,
          created_at: r.created_at,
          post_id: r.post_id,
          user_id: r.user_id,
        },
        actor: r.actor ?? { username: 'someone', display_name: 'Someone', avatar_url: null },
        sortAt: r.created_at,
      })) ?? [];

    const chItems: NotificationCenterItem[] =
      challengesQuery.data?.map((ev) => ({
        key: `challenge:${ev.id}`,
        kind: 'challenge' as const,
        userEvent: ev,
        sortAt: challengeSortAt(ev),
      })) ?? [];

    const merged = [...reqItems, ...accItems, ...reactItems, ...chItems];

    merged.sort((a, b) => {
      const priority = (k: NotificationCenterItem['kind']) => (k === 'friend_request' ? 0 : 1);
      const p = priority(a.kind) - priority(b.kind);
      if (p !== 0) return p;
      return new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime();
    });

    return merged;
  }, [friendRequests, acceptQuery.data, reactionsQuery.data, challengesQuery.data]);

  const unreadCount = useMemo(() => {
    return items.length;
  }, [items]);

  const isLoading =
    !watermarkReady ||
    requestsLoading ||
    acceptQuery.isLoading ||
    reactionsQuery.isLoading ||
    challengesQuery.isLoading;

  return {
    items,
    unreadCount,
    isLoading,
    markAllSeenUpToNow,
    watermarkReady,
  };
}
