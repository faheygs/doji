/// <reference path="../deno.d.ts" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { assertCronAuthorized } from '../_shared/cron-auth.ts';
import { sendExpoPushMessages, type ExpoMessage } from '../_shared/expo-push.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const BATCH_SIZE = 100;

const categoryEmojis: Record<string, string> = {
  physical: '💪',
  creative: '🎨',
  social: '🤝',
  mental: '🧠',
  wild: '🌪️',
};

async function clearNotificationTokensForUsers(userIds: string[]) {
  const unique = [...new Set(userIds)];
  for (const uid of unique) {
    await supabase.from('profiles').update({ notification_token: null }).eq('id', uid);
  }
}

type UeRow = {
  id: string;
  user_id: string;
  notified_at: string | null;
  profiles: {
    notification_token: string | null;
    notification_preferences?: Record<string, unknown> | null;
  } | null;
};

function wantsDojiPush(prefs: Record<string, unknown> | null | undefined): boolean {
  if (!prefs || typeof prefs !== 'object') return true;
  if (prefs.push_enabled === false) return false;
  if (prefs.doji_start === false) return false;
  return true;
}

function needsPush(row: UeRow): boolean {
  return !row.notified_at && Boolean(row.profiles?.notification_token?.trim());
}

async function markDispatchedIfComplete(dailyEventId: string) {
  const { data: allUE, error } = await supabase
    .from('user_events')
    .select('id, notified_at, profiles(notification_token, notification_preferences)')
    .eq('daily_event_id', dailyEventId);

  if (error) throw error;

  const rows = (allUE ?? []) as UeRow[];
  const pending = rows.filter(needsPush);
  if (pending.length === 0) {
    await supabase
      .from('daily_events')
      .update({ push_sent_at: new Date().toISOString() })
      .eq('id', dailyEventId);
    return true;
  }
  return false;
}

Deno.serve(async (req) => {
  const denied = assertCronAuthorized(req);
  if (denied) return denied;

  try {
    const nowIso = new Date().toISOString();

    const { data: dueEvents, error: dueErr } = await supabase
      .from('daily_events')
      .select('id, challenge_id, fires_at, window_minutes')
      .is('push_sent_at', null)
      .lte('fires_at', nowIso);

    if (dueErr) throw dueErr;

    if (!dueEvents || dueEvents.length === 0) {
      return new Response(JSON.stringify({ message: 'No due events for push dispatch' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const summaries: Record<string, unknown>[] = [];

    for (const ev of dueEvents as {
      id: string;
      challenge_id: string;
      fires_at: string;
      window_minutes: number;
    }[]) {
      const { data: challenge, error: chErr } = await supabase
        .from('challenges')
        .select('title, category, type, emoji, xp_reward')
        .eq('id', ev.challenge_id)
        .single();

      if (chErr || !challenge) {
        console.error('dispatch: missing challenge', ev.challenge_id, chErr);
        summaries.push({ daily_event_id: ev.id, error: 'challenge_not_found' });
        continue;
      }

      const { data: userEvents, error: ueErr } = await supabase
        .from('user_events')
        .select('id, user_id, notified_at, profiles(notification_token, notification_preferences)')
        .eq('daily_event_id', ev.id);

      if (ueErr) throw ueErr;

      const rows = (userEvents ?? []) as UeRow[];
      const candidates = rows.filter(needsPush);
      const pushRows = candidates.filter((r) => wantsDojiPush(r.profiles?.notification_preferences ?? null));
      const skippedOptOut = candidates.filter(
        (r) => !wantsDojiPush(r.profiles?.notification_preferences ?? null),
      );

      const skippedIds = skippedOptOut.map((r) => r.id);
      if (skippedIds.length > 0) {
        await supabase
          .from('user_events')
          .update({ notified_at: new Date().toISOString() })
          .in('id', skippedIds);
      }

      if (pushRows.length === 0) {
        const done = await markDispatchedIfComplete(ev.id);
        summaries.push({
          daily_event_id: ev.id,
          attempted: 0,
          note: done ? 'already_complete_no_pending' : 'pending_remains',
        });
        continue;
      }

      const expiresAt = new Date(
        new Date(ev.fires_at).getTime() + ev.window_minutes * 60 * 1000,
      ).toISOString();

      const emoji = categoryEmojis[challenge.category] ?? '⚡';
      const messages: ExpoMessage[] = pushRows.map((r) => ({
        to: r.profiles!.notification_token!.trim(),
        title: `${emoji} It's time to Doji!`,
        body: `${challenge.title} — you have ${ev.window_minutes} minutes. Go!`,
        data: {
          type: 'CHALLENGE',
          daily_event_id: ev.id,
          expires_at: expiresAt,
          url: '/(app)/challenge',
        },
        sound: 'default',
        badge: 1,
      }));

      let httpOkOverall = true;
      const okUserEventIds: string[] = [];
      const invalidUserIds: string[] = [];

      for (let i = 0; i < messages.length; i += BATCH_SIZE) {
        const batch = messages.slice(i, i + BATCH_SIZE);
        const batchRows = pushRows.slice(i, i + BATCH_SIZE);
        const { httpOk, tickets, invalidTokenIndices } = await sendExpoPushMessages(batch);

        if (!httpOk) httpOkOverall = false;

        tickets.forEach((ticket, j) => {
          if (ticket.status === 'ok') {
            okUserEventIds.push(batchRows[j].id);
          }
        });

        invalidTokenIndices.forEach((idx) => {
          const row = batchRows[idx];
          if (row) invalidUserIds.push(row.user_id);
        });
      }

      if (invalidUserIds.length > 0) {
        await clearNotificationTokensForUsers(invalidUserIds);
      }

      if (okUserEventIds.length > 0) {
        await supabase
          .from('user_events')
          .update({ notified_at: new Date().toISOString() })
          .in('id', okUserEventIds);
      }

      const completed = await markDispatchedIfComplete(ev.id);

      summaries.push({
        daily_event_id: ev.id,
        attempted: pushRows.length,
        confirmed: okUserEventIds.length,
        expo_http_ok: httpOkOverall,
        cleared_tokens: invalidUserIds.length,
        daily_event_closed: completed,
      });
    }

    return new Response(JSON.stringify({ message: 'dispatch complete', summaries }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('dispatch-challenge-pushes error:', err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
