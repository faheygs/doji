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

    const { data: expiredEvents, error: fetchError } = await supabase
      .from('user_events')
      .select('id, user_id')
      .eq('status', 'pending')
      .lt('expires_at', now);

    if (fetchError) throw fetchError;

    if (!expiredEvents || expiredEvents.length === 0) {
      return new Response(JSON.stringify({ message: 'No expired events to process' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Separate expired events by user so we can check shields per-user
    const byUser = new Map<string, string[]>();
    for (const e of expiredEvents as { id: string; user_id: string }[]) {
      const list = byUser.get(e.user_id) ?? [];
      list.push(e.id);
      byUser.set(e.user_id, list);
    }

    const shieldedEventIds: string[] = [];
    const missedEventIds: string[] = [];

    for (const [userId, eventIds] of byUser) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('streak_shields')
        .eq('id', userId)
        .single();

      const shields: number = (profile as { streak_shields: number } | null)?.streak_shields ?? 0;

      if (shields > 0) {
        // Shield absorbs the miss — events stay pending-forgiven, streak unbroken
        shieldedEventIds.push(...eventIds);
        await supabase
          .from('profiles')
          .update({ streak_shields: Math.max(0, shields - 1) })
          .eq('id', userId);
      } else {
        missedEventIds.push(...eventIds);
      }
    }

    // Mark shielded events with a dedicated status so the app can display them correctly
    if (shieldedEventIds.length > 0) {
      await supabase
        .from('user_events')
        .update({ status: 'missed' })
        .in('id', shieldedEventIds);
      // Streak is NOT recalculated for shielded users — shield preserves it
    }

    // Mark truly missed events and recalculate streaks
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
        message: `Processed ${expiredEvents.length} expired events`,
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
