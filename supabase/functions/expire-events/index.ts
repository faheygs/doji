/// <reference path="../deno.d.ts" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { assertCronAuthorized } from '../_shared/cron-auth.ts';
import { recomputeUserStreakFromEvents } from '../_shared/streak.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  const denied = assertCronAuthorized(req);
  if (denied) return denied;

  try {
    const now = new Date().toISOString();

    // Fetch demo daily_event IDs to exclude from expiry
    const { data: demoChallengeRows } = await supabase
      .from('challenges')
      .select('id')
      .eq('is_demo', true);
    const demoChallengeIds = (demoChallengeRows ?? []).map((c: { id: string }) => c.id);

    let demoDailyEventIds = new Set<string>();
    if (demoChallengeIds.length > 0) {
      const { data: demoDailyRows } = await supabase
        .from('daily_events')
        .select('id')
        .in('challenge_id', demoChallengeIds);
      demoDailyEventIds = new Set((demoDailyRows ?? []).map((e: { id: string }) => e.id));
    }

    const { data: expiredEvents, error: fetchError } = await supabase
      .from('user_events')
      .select('id, user_id, daily_event_id')
      .eq('status', 'pending')
      .lt('expires_at', now);

    if (fetchError) throw fetchError;

    const nonDemoEvents = ((expiredEvents ?? []) as { id: string; user_id: string; daily_event_id: string }[])
      .filter(e => !demoDailyEventIds.has(e.daily_event_id));

    if (!nonDemoEvents || nonDemoEvents.length === 0) {
      return new Response(JSON.stringify({ message: 'No expired events to process' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const byUser = new Map<string, string[]>();
    for (const e of nonDemoEvents) {
      const list = byUser.get(e.user_id) ?? [];
      list.push(e.id);
      byUser.set(e.user_id, list);
    }

    const shieldedEventIds: string[] = [];
    const missedEventIds: string[] = [];

    for (const [userId, eventIds] of byUser) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('streak_shields, current_streak')
        .eq('id', userId)
        .single();

      const row = profile as { streak_shields: number; current_streak: number } | null;
      const shields: number = row?.streak_shields ?? 0;
      const currentStreak: number = row?.current_streak ?? 0;

      if (shields > 0) {
        shieldedEventIds.push(...eventIds);
        await supabase
          .from('profiles')
          .update({ streak_shields: Math.max(0, shields - 1) })
          .eq('id', userId);
        await supabase
          .from('user_events')
          .update({ status: 'missed', streak_before_miss: currentStreak })
          .in('id', eventIds);
      } else {
        missedEventIds.push(...eventIds);
        await supabase
          .from('user_events')
          .update({ streak_before_miss: currentStreak })
          .in('id', eventIds);
      }
    }

    if (missedEventIds.length > 0) {
      const { error: updateError } = await supabase
        .from('user_events')
        .update({ status: 'missed' })
        .in('id', missedEventIds);

      if (updateError) throw updateError;
    }

    const affectedUserIds = [...byUser.keys()].filter((uid) => {
      const ids = byUser.get(uid) ?? [];
      return ids.some((id) => missedEventIds.includes(id));
    });

    for (const userId of affectedUserIds) {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('current_streak')
        .eq('id', userId)
        .single();
      const previousStreak = (existingProfile as { current_streak: number } | null)?.current_streak ?? 0;

      const next = await recomputeUserStreakFromEvents(supabase, userId);

      if (next.current_streak < previousStreak && previousStreak > 0) {
        await supabase.from('streak_events').insert({
          user_id: userId,
          event_type: 'break',
          streak_value: previousStreak,
        });
      }
    }

    return new Response(
      JSON.stringify({
        message: `Processed ${nonDemoEvents.length} expired events`,
        missed: missedEventIds.length,
        shielded: shieldedEventIds.length,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('expire-events error:', err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
