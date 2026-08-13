/// <reference path="../deno.d.ts" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { assertCronAuthorized } from '../_shared/cron-auth.ts';
import { sendExpoPushMessages, type ExpoMessage } from '../_shared/expo-push.ts';
import { claimPushDelivery, legacyPushDeliveryKey } from '../_shared/push-delivery.ts';
import { pushPreferenceEnabled } from '../_shared/notification-preferences.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const PREF_KEYS = new Set<string>([
  'reactions_on_my_post',
  'friend_request',
  'friend_accepted',
  'badges',
  'friend_post',
  'comment',
  'mention',
  'suggestion',
  'doji_start',
  'comment_reply',
]);

Deno.serve(async (req) => {
  const denied = assertCronAuthorized(req);
  if (denied) return denied;

  try {
    const payload = (await req.json()) as {
      target_user_id?: unknown;
      title?: unknown;
      body?: unknown;
      data?: unknown;
      preference_key?: unknown;
    };

    const targetUserId =
      typeof payload.target_user_id === 'string' ? payload.target_user_id.trim() : '';
    const title = typeof payload.title === 'string' ? payload.title.trim() : '';
    const body = typeof payload.body === 'string' ? payload.body.trim() : '';
    const rawPrefKey =
      typeof payload.preference_key === 'string' ? payload.preference_key.trim() : '';
    // 'poll_vote' was consolidated into 'friend_post' — accept both so deployment
    // order (edge function vs SQL migration) never causes silent push drops.
    const preferenceKey = rawPrefKey === 'poll_vote' ? 'friend_post' : rawPrefKey;

    if (!targetUserId) {
      return new Response(JSON.stringify({ error: 'target_user_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!title || !body) {
      return new Response(JSON.stringify({ error: 'title and body are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!PREF_KEYS.has(preferenceKey)) {
      return new Response(JSON.stringify({ error: 'invalid preference_key' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const dataObj =
      payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
        ? (payload.data as Record<string, unknown>)
        : {};

    const { data: row, error } = await supabase
      .from('profiles')
      .select('id, notification_token, notification_preferences')
      .eq('id', targetUserId)
      .maybeSingle();

    if (error) throw error;
    const token = row?.notification_token?.trim();
    if (!row || !token) {
      return new Response(JSON.stringify({ message: 'No push token for user' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const prefs = row.notification_preferences as Record<string, unknown> | null;
    if (!pushPreferenceEnabled(prefs, preferenceKey)) {
      return new Response(JSON.stringify({ message: 'Skipped by notification preferences' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const delivery = await legacyPushDeliveryKey({
      targetUserId,
      preferenceKey,
      title,
      body,
      data: dataObj,
    });
    const claimed = await claimPushDelivery(supabase, {
      deliveryKey: delivery.key,
      targetUserId,
      category: preferenceKey,
      aggregateId: delivery.aggregateId,
    });
    if (!claimed) {
      return new Response(JSON.stringify({ message: 'Duplicate push skipped' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const message: ExpoMessage = {
      to: token,
      title,
      body,
      data: dataObj,
      sound: 'default' as const,
      badge: 1,
      ttl: 600,
    };

    const { httpOk, tickets, invalidTokenIndices } = await sendExpoPushMessages([message]);

    if (invalidTokenIndices.includes(0)) {
      // Match both owner and token. A concurrent account switch transfers the token,
      // so this stale response can never clear the new owner's registration.
      await supabase.from('profiles').update({ notification_token: null })
        .eq('id', targetUserId)
        .eq('notification_token', token);
    }

    return new Response(
      JSON.stringify({
        message: 'Sent',
        httpOk,
        tickets,
        stale_token: invalidTokenIndices.length > 0,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('notify-user error:', err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
