/// <reference path="../deno.d.ts" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { assertCronAuthorized } from '../_shared/cron-auth.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const WINDOW_MINUTES = 10;

/** IANA zone for the shared challenge drop window (matches `profiles.timezone` default). */
const SCHEDULE_TZ = 'America/Denver';
const WINDOW_START_HOUR = 8;
const WINDOW_END_HOUR = 20;

function zonedParts(d: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const p = f.formatToParts(d);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? '0');
  return { y: g('year'), mo: g('month'), day: g('day'), h: g('hour'), mi: g('minute') };
}

/** Wall time in `timeZone` → UTC `Date` (handles DST). */
function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const target =
    year * 1e8 +
    month * 1e6 +
    day * 1e4 +
    hour * 100 +
    minute;
  let lo = Date.UTC(year, month - 1, day - 1, 10, 0, 0, 0);
  let hi = Date.UTC(year, month - 1, day + 1, 14, 0, 0, 0);
  for (let i = 0; i < 60; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const q = zonedParts(new Date(mid), timeZone);
    const key = q.y * 1e8 + q.mo * 1e6 + q.day * 1e4 + q.h * 100 + q.mi;
    if (key < target) lo = mid + 1;
    else hi = mid;
  }
  return new Date(hi);
}

/** Random instant in [08:00, 20:00) on the current calendar day in `SCHEDULE_TZ`, or tomorrow if none left. */
function randomFiresAt(now: Date): Date {
  const parts = zonedParts(now, SCHEDULE_TZ);
  let windowStart = zonedWallTimeToUtc(
    parts.y,
    parts.mo,
    parts.day,
    WINDOW_START_HOUR,
    0,
    SCHEDULE_TZ,
  );
  let windowEnd = zonedWallTimeToUtc(
    parts.y,
    parts.mo,
    parts.day,
    WINDOW_END_HOUR,
    0,
    SCHEDULE_TZ,
  );
  let spanMs = windowEnd.getTime() - windowStart.getTime();
  if (spanMs <= 0) spanMs = 12 * 60 * 60 * 1000;

  let firesAt = new Date(
    windowStart.getTime() + Math.floor(Math.random() * spanMs),
  );

  if (firesAt.getTime() <= now.getTime()) {
    const nextProbe = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const nx = zonedParts(nextProbe, SCHEDULE_TZ);
    windowStart = zonedWallTimeToUtc(nx.y, nx.mo, nx.day, WINDOW_START_HOUR, 0, SCHEDULE_TZ);
    windowEnd = zonedWallTimeToUtc(nx.y, nx.mo, nx.day, WINDOW_END_HOUR, 0, SCHEDULE_TZ);
    spanMs = windowEnd.getTime() - windowStart.getTime();
    if (spanMs <= 0) spanMs = 12 * 60 * 60 * 1000;
    firesAt = new Date(
      windowStart.getTime() + Math.floor(Math.random() * spanMs),
    );
  }

  return firesAt;
}

Deno.serve(async (req) => {
  const denied = assertCronAuthorized(req);
  if (denied) return denied;

  try {
    const { error: purgeErr } = await supabase.rpc('purge_posts_older_than_24h');
    if (purgeErr) {
      console.error('purge_posts_older_than_24h:', purgeErr);
    }

    const utcNow = new Date();
    const y = utcNow.getUTCFullYear();
    const mo = utcNow.getUTCMonth();
    const da = utcNow.getUTCDate();
    const utcDayStart = new Date(Date.UTC(y, mo, da, 0, 0, 0, 0));
    const utcDayEnd = new Date(Date.UTC(y, mo, da + 1, 0, 0, 0, 0));

    const { data: alreadyToday } = await supabase
      .from('daily_events')
      .select('id, fires_at')
      .gte('created_at', utcDayStart.toISOString())
      .lt('created_at', utcDayEnd.toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    if (alreadyToday && alreadyToday.length > 0) {
      const row = alreadyToday[0] as { id: string; fires_at: string };
      return new Response(
        JSON.stringify({
          message: 'Daily event already scheduled for this UTC day',
          skipped: true,
          daily_event_id: row.id,
          fires_at: row.fires_at,
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
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

    // Random fire slot 8 AM – 8 PM (America/Denver), one instant for all users / same daily_event.
    const now = new Date();
    const firesAt = randomFiresAt(now);

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
