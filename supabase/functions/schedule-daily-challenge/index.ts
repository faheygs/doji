/// <reference path="../deno.d.ts" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const WINDOW_MINUTES = Number(Deno.env.get('CHALLENGE_WINDOW_MINUTES') ?? '10');

async function registerDurableAlarm(dailyEventId: string, firesAt: string) {
  const orchestratorUrl = Deno.env.get('DOJI_ORCHESTRATOR_URL');
  const orchestratorSecret = Deno.env.get('DOJI_ORCHESTRATOR_SECRET');
  if (!orchestratorUrl || !orchestratorSecret) {
    throw new Error('Durable Doji orchestrator is not configured');
  }
  const response = await fetch(
    `${orchestratorUrl.replace(/\/$/, '')}/events/${dailyEventId}/alarm`,
    {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${orchestratorSecret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ dailyEventId, firesAt, phase: 'prelive' }),
    },
  );
  if (!response.ok) {
    throw new Error(`Durable alarm registration failed: ${response.status} ${await response.text()}`);
  }
}

/** Continental US drop window: 10:00 Pacific → 22:00 Eastern (same Eastern calendar day). */
const TZ_PACIFIC = 'America/Los_Angeles';
const TZ_EASTERN = 'America/New_York';
const WINDOW_ANCHOR_TZ = TZ_EASTERN; // which zone’s calendar date defines “today” for the slot
const WINDOW_START_HOUR_PACIFIC = 10;
const WINDOW_START_MINUTE_PACIFIC = 0;
const WINDOW_END_HOUR_EASTERN = 22;
const WINDOW_END_MINUTE_EASTERN = 0;

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

/** Random instant inside [10:00 Pacific, 22:00 Eastern] on the anchor calendar day, or next day if none left. */
function randomFiresAt(now: Date, forceNextDay = false): Date {
  const anchor = forceNextDay
    ? new Date(now.getTime() + 24 * 60 * 60 * 1000)
    : now;
  const parts = zonedParts(anchor, WINDOW_ANCHOR_TZ);
  let windowStart = zonedWallTimeToUtc(
    parts.y,
    parts.mo,
    parts.day,
    WINDOW_START_HOUR_PACIFIC,
    WINDOW_START_MINUTE_PACIFIC,
    TZ_PACIFIC,
  );
  let windowEnd = zonedWallTimeToUtc(
    parts.y,
    parts.mo,
    parts.day,
    WINDOW_END_HOUR_EASTERN,
    WINDOW_END_MINUTE_EASTERN,
    TZ_EASTERN,
  );
  let spanMs = windowEnd.getTime() - windowStart.getTime();
  if (spanMs <= 0) spanMs = 12 * 60 * 60 * 1000;

  let firesAt = new Date(
    windowStart.getTime() + Math.floor(Math.random() * spanMs),
  );

  if (!forceNextDay && firesAt.getTime() <= now.getTime()) {
    const nextProbe = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const nx = zonedParts(nextProbe, WINDOW_ANCHOR_TZ);
    windowStart = zonedWallTimeToUtc(
      nx.y,
      nx.mo,
      nx.day,
      WINDOW_START_HOUR_PACIFIC,
      WINDOW_START_MINUTE_PACIFIC,
      TZ_PACIFIC,
    );
    windowEnd = zonedWallTimeToUtc(
      nx.y,
      nx.mo,
      nx.day,
      WINDOW_END_HOUR_EASTERN,
      WINDOW_END_MINUTE_EASTERN,
      TZ_EASTERN,
    );
    spanMs = windowEnd.getTime() - windowStart.getTime();
    if (spanMs <= 0) spanMs = 12 * 60 * 60 * 1000;
    firesAt = new Date(
      windowStart.getTime() + Math.floor(Math.random() * spanMs),
    );
  }

  return firesAt;
}

Deno.serve(async (req) => {
  const expectedOrchestratorSecret = Deno.env.get('DOJI_ORCHESTRATOR_SECRET');
  const orchestratorAuthorized = Boolean(expectedOrchestratorSecret) &&
    req.headers.get('x-orchestrator-secret') === expectedOrchestratorSecret;
  if (!orchestratorAuthorized) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const requestBody = await req.json().catch(() => ({})) as { forceNextDay?: boolean };
    const forceNextDay = requestBody.forceNextDay === true;

    const proposedFiresAt = randomFiresAt(new Date(), forceNextDay);
    const { data: prepared, error: preparationError } = await supabase.rpc(
      'prepare_next_daily_event',
      {
        p_proposed_fires_at: proposedFiresAt.toISOString(),
        p_window_minutes: WINDOW_MINUTES,
      },
    );
    if (preparationError) throw preparationError;
    if (!prepared?.daily_event_id || !prepared?.fires_at) {
      throw new Error('Database did not return a prepared daily event');
    }

    await registerDurableAlarm(prepared.daily_event_id, prepared.fires_at);

    return new Response(
      JSON.stringify({
        message: prepared.already_prepared
          ? 'Current or future Doji alarm confirmed'
          : 'Next Doji prepared atomically and alarm registered',
        daily_event_id: prepared.daily_event_id,
        challenge_id: prepared.challenge_id,
        fires_at: prepared.fires_at,
        skipped: prepared.already_prepared,
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
