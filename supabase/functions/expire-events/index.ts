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

    const expiredIds = expiredEvents.map((e: { id: string }) => e.id);
    const affectedUserIds = [...new Set(expiredEvents.map((e: { user_id: string }) => e.user_id))] as string[];

    const { error: updateError } = await supabase
      .from('user_events')
      .update({ status: 'missed' })
      .in('id', expiredIds);

    if (updateError) throw updateError;

    for (const userId of affectedUserIds) {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('current_streak')
        .eq('id', userId)
        .single();
      const previousStreak = existingProfile?.current_streak ?? 0;

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
        message: `Expired ${expiredEvents.length} events, updated ${affectedUserIds.length} user streaks`,
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
