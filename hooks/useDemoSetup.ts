import { useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import { useDemoStore } from '../stores/useDemoStore';
import type { UserEvent, Post, ChallengeType } from '../types/database';

const DEMO_DAILY_EVENT_IDS: Record<ChallengeType, string> = {
  photo:  '11111111-1111-1111-1111-111111111111',
  poll:   '22222222-2222-2222-2222-222222222222',
  task:   '33333333-3333-3333-3333-333333333333',
  format: '44444444-4444-4444-4444-444444444444',
};

const DEMO_DAILY_EVENT_IDS_LIST = Object.values(DEMO_DAILY_EVENT_IDS);

export function useDemoSetup() {
  const userId = useAuthStore((s) => s.session?.user?.id);
  const { setDemoUserEvents, setActiveDemoUserEvent } = useDemoStore();

  const initDemoFeed = useCallback(async (): Promise<Post[]> => {
    if (!userId) return [];

    await supabase.rpc('ensure_demo_user_events', { p_user_id: userId });

    const { data, error } = await supabase
      .from('posts')
      .select('*, profile:profiles(*), daily_event:daily_events!inner(*, challenge:challenges(*))')
      .in('daily_event_id', DEMO_DAILY_EVENT_IDS_LIST)
      .eq('user_id', userId)
      .eq('is_demo', true)
      .order('created_at', { ascending: true });

    if (error || !data) return [];

    return (data as Record<string, unknown>[]).map((p) => ({
      ...p,
      challenge: (p.daily_event as { challenge?: unknown } | undefined)?.challenge ?? null,
      daily_event: undefined,
    })) as Post[];
  }, [userId]);

  const setupAndActivate = useCallback(async (type: ChallengeType) => {
    if (!userId) return null;

    // Reset all demo user_events to pending
    await supabase.rpc('ensure_demo_user_events', { p_user_id: userId });

    // Fetch all 4 demo user_events with full joins
    const { data, error } = await supabase
      .from('user_events')
      .select('*, daily_event:daily_events(*, challenge:challenges(*))')
      .eq('user_id', userId)
      .in('daily_event_id', DEMO_DAILY_EVENT_IDS_LIST);

    if (error || !data) return null;

    const mapped: Partial<Record<ChallengeType, UserEvent>> = {};
    for (const [t, dailyEventId] of Object.entries(DEMO_DAILY_EVENT_IDS) as [ChallengeType, string][]) {
      const row = (data as UserEvent[]).find((e) => e.daily_event_id === dailyEventId);
      if (row) {
        const challenge = (row as Record<string, unknown> & { daily_event?: { challenge?: unknown } }).daily_event?.challenge;
        mapped[t] = { ...row, challenge } as UserEvent;
      }
    }
    setDemoUserEvents(mapped);

    const target = mapped[type] ?? null;
    setActiveDemoUserEvent(target);
    return target;
  }, [userId, setDemoUserEvents, setActiveDemoUserEvent]);

  return { setupAndActivate, initDemoFeed };
}
