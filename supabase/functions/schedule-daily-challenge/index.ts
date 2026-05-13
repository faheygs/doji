/// <reference path="../deno.d.ts" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { assertCronAuthorized } from '../_shared/cron-auth.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const WINDOW_MINUTES = 10;

Deno.serve(async (req) => {
  const denied = assertCronAuthorized(req);
  if (denied) return denied;

  try {
    const { error: purgeErr } = await supabase.rpc('purge_posts_older_than_24h');
    if (purgeErr) {
      console.error('purge_posts_older_than_24h:', purgeErr);
    }

    const { data: recentEvents } = await supabase
      .from('daily_events')
      .select('challenge_id')
      .order('created_at', { ascending: false })
      .limit(10);

    const recentIds = (recentEvents ?? []).map((e: { challenge_id: string }) => e.challenge_id);

    let query = supabase.from('challenges').select('*').eq('is_active', true);
    if (recentIds.length > 0) {
      query = query.not('id', 'in', `(${recentIds.join(',')})`);
    }

    const { data: challenges, error: challengeError } = await query;

    let pool: Record<string, unknown>[] = [...(challenges ?? [])];

    if (challengeError || pool.length === 0) {
      const { data: fallback } = await supabase
        .from('challenges')
        .select('*')
        .eq('is_active', true)
        .limit(20);
      pool = [...(fallback ?? [])];
    }

    if (pool.length === 0) {
      return new Response(JSON.stringify({ error: 'No active challenges in database' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const challenge = pool[Math.floor(Math.random() * pool.length)] as {
      id: string;
      title: string;
      category: string;
      type: string;
      emoji: string | null;
      xp_reward: number;
    };

    // Random fire slot between 2 PM – 10 PM US Central (UTC-6).
    // 2 PM CT = 20:00 UTC, 10 PM CT = 04:00 UTC next day → 8-hour window.
    const now = new Date();
    const firesAt = new Date(now);
    firesAt.setUTCHours(20, 0, 0, 0);
    const offsetMs = Math.floor(Math.random() * 8 * 60) * 60 * 1000;
    firesAt.setTime(firesAt.getTime() + offsetMs);
    if (firesAt <= now) firesAt.setUTCDate(firesAt.getUTCDate() + 1);

    const expiresAt = new Date(firesAt.getTime() + WINDOW_MINUTES * 60 * 1000);

    const { data: dailyEvent, error: eventError } = await supabase
      .from('daily_events')
      .insert({
        challenge_id: challenge.id,
        fires_at: firesAt.toISOString(),
        window_minutes: WINDOW_MINUTES,
      })
      .select()
      .single();

    if (eventError) throw eventError;

    const { data: profiles, error: profilesError } = await supabase.from('profiles').select('id');

    if (profilesError) throw profilesError;

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({
          message: 'Daily event created; no profiles to fan out.',
          challenge: challenge.title,
          fires_at: firesAt.toISOString(),
          note: 'Pushes are sent by dispatch-challenge-pushes when fires_at is reached.',
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }

    const userEventInserts = profiles.map((p: { id: string }) => ({
      user_id: p.id,
      daily_event_id: dailyEvent.id,
      status: 'pending',
      expires_at: expiresAt.toISOString(),
    }));

    const { error: userEventsError } = await supabase.from('user_events').insert(userEventInserts);

    if (userEventsError) throw userEventsError;

    return new Response(
      JSON.stringify({
        message: `Scheduled challenge for ${profiles.length} users; push will dispatch at fires_at`,
        challenge: challenge.title,
        fires_at: firesAt.toISOString(),
        daily_event_id: dailyEvent.id,
        note: 'Run dispatch-challenge-pushes on a short interval (e.g. every 1–5 minutes) so notifications align with fires_at.',
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('schedule-daily-challenge error:', err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
