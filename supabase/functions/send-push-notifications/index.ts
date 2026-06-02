/// <reference path="../deno.d.ts" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { assertCronAuthorized } from '../_shared/cron-auth.ts';
import { sendExpoPushMessages, type ExpoMessage } from '../_shared/expo-push.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const BATCH_SIZE = 100;

async function clearNotificationTokensForUsers(userIds: string[]) {
  const unique = [...new Set(userIds)];
  for (const uid of unique) {
    await supabase.from('profiles').update({ notification_token: null }).eq('id', uid);
  }
}

// Maps notification type from push payload → user preference key.
// Each type is gated by its own preference so users get granular control.
const TYPE_TO_PREF: Record<string, string> = {
  CHALLENGE: 'doji_start',
  REACTION: 'reactions_on_my_post',
  COMMENT: 'comment',
  MENTION: 'mention',
  FRIEND_REQUEST: 'friend_request',
  FRIEND_ACCEPTED: 'friend_accepted',
  FRIEND_POST: 'friend_post',
  BADGE: 'badges',
  BADGE_EARNED: 'badges',
  SUGGESTION_APPROVED: 'suggestion',
  SUGGESTION_REJECTED: 'suggestion',
};

function wantsPushForType(
  prefs: Record<string, unknown> | null | undefined,
  type: string | undefined,
): boolean {
  if (!prefs || typeof prefs !== 'object') return true;
  const prefKey = type ? TYPE_TO_PREF[type] : undefined;
  if (!prefKey) {
    // Unknown type — fall back to sending (safe default).
    return true;
  }
  return prefs[prefKey] !== false;
}

Deno.serve(async (req) => {
  const denied = assertCronAuthorized(req);
  if (denied) return denied;

  try {
    const payload = (await req.json()) as {
      user_event_ids?: unknown;
      title?: string;
      body?: string;
      data?: unknown;
    };
    const { user_event_ids, title, body, data } = payload;

    const notifType =
      data && typeof data === 'object'
        ? ((data as Record<string, unknown>).type as string | undefined)
        : undefined;

    if (!user_event_ids || !Array.isArray(user_event_ids)) {
      return new Response(JSON.stringify({ error: 'user_event_ids array is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data: userEvents, error } = await supabase
      .from('user_events')
      .select('id, user_id, profiles(notification_token, notification_preferences)')
      .in('id', user_event_ids);

    if (error) throw error;

    type Row = {
      id: string;
      user_id: string;
      profiles: {
        notification_token: string | null;
        notification_preferences?: Record<string, unknown> | null;
      } | null;
    };

    const rows = (userEvents ?? []) as unknown as Row[];
    const withToken = rows.filter((e) => Boolean(e.profiles?.notification_token?.trim()));
    const pushRows = withToken.filter((e) => {
      const prefs = e.profiles?.notification_preferences ?? null;
      return wantsPushForType(prefs, notifType);
    });

    const dataObj =
      data && typeof data === 'object' && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};

    const notifications: ExpoMessage[] = pushRows.map((e) => ({
      to: e.profiles!.notification_token!.trim(),
      title: title ?? '⚡ Doji! Challenge Time',
      body: body ?? 'Your challenge is waiting!',
      data: { ...dataObj, user_event_id: e.id },
      sound: 'default' as const,
    }));

    if (notifications.length === 0) {
      return new Response(JSON.stringify({ message: 'No tokens to notify' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const results: unknown[] = [];
    const invalidUserIds: string[] = [];
    const confirmedUserEventIds: string[] = [];

    for (let i = 0; i < notifications.length; i += BATCH_SIZE) {
      const batch = notifications.slice(i, i + BATCH_SIZE);
      const batchRows = pushRows.slice(i, i + BATCH_SIZE);
      const { httpOk, tickets, invalidTokenIndices } = await sendExpoPushMessages(batch);
      results.push({ httpOk, tickets });

      tickets.forEach((ticket, j) => {
        if (ticket.status === 'ok') confirmedUserEventIds.push(batchRows[j].id);
      });
      invalidTokenIndices.forEach((idx) => {
        const row = batchRows[idx];
        if (row) invalidUserIds.push(row.user_id);
      });
    }

    if (invalidUserIds.length > 0) {
      await clearNotificationTokensForUsers(invalidUserIds);
    }

    if (confirmedUserEventIds.length > 0) {
      await supabase
        .from('user_events')
        .update({ notified_at: new Date().toISOString() })
        .in('id', confirmedUserEventIds);
    }

    return new Response(
      JSON.stringify({
        message: `Sent ${notifications.length} notifications; confirmed ${confirmedUserEventIds.length}`,
        results,
        cleared_invalid_tokens: invalidUserIds.length,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('send-push-notifications error:', err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
