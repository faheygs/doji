/// <reference path="../deno.d.ts" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendExpoPushMessages, type ExpoMessage } from '../_shared/expo-push.ts';
import {
  recordPushDeliveryResults,
  type PushDeliveryOutcome,
} from '../_shared/push-delivery.ts';
import { apnsConfigured, sendApnsMessage } from '../_shared/apns-push.ts';
import { fcmConfigured, sendFcmMessage } from '../_shared/fcm-push.ts';

const PAGE_SIZE = 500;
const EXPO_BATCH_SIZE = 100;

type Recipient = {
  user_id: string;
  notification_token: string | null;
  native_endpoints: NativeEndpoint[];
};
type NativeEndpoint = {
  installationId: string;
  token: string;
  provider: 'apns' | 'fcm';
  environment: 'sandbox' | 'production';
};
type NativeTarget = {
  recipient: Recipient;
  endpoint: NativeEndpoint;
  deliveryKey: string;
};
type ExpoTarget = { recipient: Recipient; deliveryKey: string };
type Claim = {
  state: 'claimed' | 'busy' | 'done';
  lease_id?: string;
  after_user_id?: string | null;
  push_expires_at?: string;
  title?: string;
  body?: string;
  retry_after_seconds?: number;
};

function messageFor(
  recipient: Recipient,
  dailyEventId: string,
  title: string,
  body: string,
  ttl: number,
): ExpoMessage {
  const collapseKey = `doji-live:${dailyEventId}`;
  return {
    to: recipient.notification_token!,
    title,
    body,
    sound: 'default',
    badge: 1,
    ttl,
    priority: 'high',
    interruptionLevel: 'time-sensitive',
    threadId: collapseKey,
    collapseId: collapseKey,
    tag: collapseKey,
    data: {
      type: 'CHALLENGE',
      daily_event_id: dailyEventId,
      url: '/(app)/challenge',
    },
  };
}

async function mapConcurrent<T, R>(
  values: T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await operation(values[index]);
    }
  }));
  return results;
}

Deno.serve(async (request) => {
  const startedAt = Date.now();
  const expectedSecret = Deno.env.get('OUTBOX_RELAY_SECRET');
  if (!expectedSecret || request.headers.get('x-outbox-secret') !== expectedSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { dailyEventId, shard } = await request.json() as {
    dailyEventId?: string;
    shard?: number;
  };
  if (!dailyEventId || !Number.isInteger(shard) || shard! < 0 || shard! > 127) {
    return new Response('Invalid fanout partition', { status: 400 });
  }

  const database = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data: claimData, error: claimError } = await database.rpc(
    'claim_doji_push_fanout_shard',
    { p_daily_event_id: dailyEventId, p_shard: shard },
  );
  if (claimError) return new Response(claimError.message, { status: 500 });

  const claim = claimData as Claim;
  if (claim.state === 'busy') {
    return Response.json(
      { continued: true, busy: true, retryAfterSeconds: claim.retry_after_seconds ?? 5 },
      { status: 409 },
    );
  }
  if (claim.state === 'done') return Response.json({ continued: false, sent: 0 });

  const leaseId = claim.lease_id;
  if (!leaseId || !claim.push_expires_at) {
    return new Response('Invalid fanout lease', { status: 500 });
  }

  try {
    const remainingSeconds = Math.floor(
      (Date.parse(claim.push_expires_at) - Date.now()) / 1000,
    );
    if (remainingSeconds <= 0) {
      const { error } = await database.rpc('advance_doji_push_fanout_shard', {
        p_daily_event_id: dailyEventId,
        p_shard: shard,
        p_lease_id: leaseId,
        p_after_user_id: claim.after_user_id ?? null,
        p_has_more: false,
        p_claimed_count: 0,
        p_accepted_count: 0,
      });
      if (error) throw error;
      return Response.json({ continued: false, sent: 0, expired: true });
    }

    const { data: recipientData, error: recipientError } = await database.rpc(
      'get_doji_push_recipients_shard_page',
      {
        p_daily_event_id: dailyEventId,
        p_shard: shard,
        p_after_user_id: claim.after_user_id ?? null,
        p_limit: PAGE_SIZE,
      },
    );
    if (recipientError) throw recipientError;
    const recipients = ((recipientData ?? []) as Recipient[]).map((recipient) => ({
      ...recipient,
      native_endpoints: Array.isArray(recipient.native_endpoints)
        ? recipient.native_endpoints
        : [],
    }));

    const useApns = apnsConfigured();
    const useFcm = fcmConfigured();
    const readyEndpoints = new Map<string, NativeEndpoint[]>();
    for (const recipient of recipients) {
      readyEndpoints.set(
        recipient.user_id,
        recipient.native_endpoints.filter((endpoint) =>
          Boolean(endpoint.token) && (
            (endpoint.provider === 'apns' && useApns) ||
            (endpoint.provider === 'fcm' && useFcm)
          )
        ),
      );
    }
    const targets = recipients.flatMap((recipient) => {
      const endpoints = readyEndpoints.get(recipient.user_id) ?? [];
      if (endpoints.length > 0) {
        return endpoints.map((endpoint) => ({
          userId: recipient.user_id,
          endpointKey: `native:${endpoint.installationId}`,
        }));
      }
      return recipient.notification_token
        ? [{ userId: recipient.user_id, endpointKey: 'expo' }]
        : [];
    });
    const { data: claimedData, error: deliveryClaimError } = await database.rpc(
      'claim_push_delivery_targets_batch',
      {
        p_event_id: dailyEventId,
        p_targets: targets,
        p_category: 'doji_start',
        p_aggregate_id: dailyEventId,
      },
    );
    if (deliveryClaimError) throw deliveryClaimError;
    const claimedTargets = new Map(
      ((claimedData ?? []) as Array<{
        delivery_key: string;
        target_user_id: string;
        endpoint_key: string;
      }>).map((row) => [
        `${row.target_user_id}:${row.endpoint_key}`,
        row.delivery_key,
      ]),
    );
    const claimedUserCount = new Set(
      ((claimedData ?? []) as Array<{ target_user_id: string }>).map(
        (row) => row.target_user_id,
      ),
    ).size;
    const nativeTargets: NativeTarget[] = recipients.flatMap((recipient) =>
      (readyEndpoints.get(recipient.user_id) ?? []).flatMap((endpoint) => {
        const deliveryKey = claimedTargets.get(
          `${recipient.user_id}:native:${endpoint.installationId}`,
        );
        return deliveryKey ? [{ recipient, endpoint, deliveryKey }] : [];
      })
    );
    const apnsTargets = nativeTargets.filter((target) => target.endpoint.provider === 'apns');
    const fcmTargets = nativeTargets.filter((target) => target.endpoint.provider === 'fcm');
    const expoTargets: ExpoTarget[] = recipients.flatMap((recipient) => {
      const deliveryKey = claimedTargets.get(`${recipient.user_id}:expo`);
      return deliveryKey && recipient.notification_token ? [{ recipient, deliveryKey }] : [];
    });

    const apnsResults = await mapConcurrent(apnsTargets, 50, async (target) => {
      const push = await sendApnsMessage(database, {
        token: target.endpoint.token,
        environment: target.endpoint.environment ?? 'production',
        title: claim.title ?? 'It\'s time to Doji!',
        body: claim.body ?? 'You have 10 minutes.',
        collapseId: `doji-live:${dailyEventId}`,
        expiresAtEpochSeconds: Math.floor(Date.parse(claim.push_expires_at!) / 1000),
        data: {
          type: 'CHALLENGE',
          daily_event_id: dailyEventId,
          url: '/(app)/challenge',
        },
      });
      return { target, push };
    });
    if (apnsResults.length > 0) {
      await recordPushDeliveryResults(database, apnsResults.map(({ target, push }) => ({
        deliveryKey: target.deliveryKey,
        outcome: push.outcome,
        providerTicketId: push.providerId,
        error: push.error,
      })));
    }

    const fcmResults = await mapConcurrent(fcmTargets, 50, async (target) => {
      const push = await sendFcmMessage({
        token: target.endpoint.token,
        title: claim.title ?? 'It\'s time to Doji!',
        body: claim.body ?? 'You have 10 minutes.',
        collapseKey: `doji-live:${dailyEventId}`,
        ttlSeconds: Math.max(1, remainingSeconds),
        data: {
          type: 'CHALLENGE',
          daily_event_id: dailyEventId,
          url: '/(app)/challenge',
        },
      });
      return { target, push };
    });
    if (fcmResults.length > 0) {
      await recordPushDeliveryResults(database, fcmResults.map(({ target, push }) => ({
        deliveryKey: target.deliveryKey,
        outcome: push.outcome,
        providerTicketId: push.providerId,
        error: push.error,
      })));
    }

    const batches: ExpoTarget[][] = [];
    for (let index = 0; index < expoTargets.length; index += EXPO_BATCH_SIZE) {
      batches.push(expoTargets.slice(index, index + EXPO_BATCH_SIZE));
    }

    const results = await Promise.all(
      batches.map(async (batch) => {
        const push = await sendExpoPushMessages(
          batch.map(({ recipient }) =>
            messageFor(
              recipient,
              dailyEventId,
              claim.title ?? 'It\'s time to Doji!',
              claim.body ?? 'You have 10 minutes.',
              Math.max(1, remainingSeconds),
            ),
          ),
        );
        const invalidTokens = push.invalidTokenIndices
          .map((index) => batch[index]?.recipient.notification_token)
          .filter((token): token is string => Boolean(token));
        await recordPushDeliveryResults(
          database,
          batch.map(({ deliveryKey }, index) => {
            const ticket = push.tickets[index];
            const invalidToken = push.invalidTokenIndices.includes(index);
            const outcome: PushDeliveryOutcome = invalidToken
              ? 'invalid_token'
              : ticket?.status === 'ok'
                ? 'accepted'
                : push.httpOk
                  ? 'rejected'
                  : 'transport_error';
            return {
              deliveryKey,
              outcome,
              providerTicketId: ticket?.status === 'ok' ? ticket.id : undefined,
              error: ticket?.status === 'error' ? ticket.message : push.transportError,
            };
          }),
        );
        return {
          accepted: push.tickets.filter((ticket) => ticket.status === 'ok').length,
          invalidTokens,
        };
      }),
    );

    const invalidTokens = [...new Set(results.flatMap((result) => result.invalidTokens))];
    if (invalidTokens.length > 0) {
      const { error } = await database.rpc('invalidate_expo_push_tokens', {
        p_tokens: invalidTokens,
      });
      if (error) throw error;
    }
    const invalidNativeTokens = [...apnsResults, ...fcmResults]
      .filter(({ push }) => push.outcome === 'invalid_token')
      .map(({ target }) => target.endpoint.token)
      .filter(Boolean);
    if (invalidNativeTokens.length > 0) {
      const { error } = await database.rpc('invalidate_native_push_tokens', {
        p_tokens: invalidNativeTokens,
      });
      if (error) throw error;
    }

    const hasMore = recipients.length === PAGE_SIZE;
    const lastUserId = recipients.at(-1)?.user_id ?? claim.after_user_id ?? null;
    const { data: advanced, error: advanceError } = await database.rpc(
      'advance_doji_push_fanout_shard',
      {
        p_daily_event_id: dailyEventId,
        p_shard: shard,
        p_lease_id: leaseId,
        p_after_user_id: lastUserId,
        p_has_more: hasMore,
        p_claimed_count: claimedUserCount,
        p_accepted_count: results.reduce((sum, result) => sum + result.accepted, 0) +
          [...apnsResults, ...fcmResults]
            .filter(({ push }) => push.outcome === 'accepted').length,
      },
    );
    if (advanceError || advanced !== true) {
      throw advanceError ?? new Error('Fanout lease was lost');
    }

    const response = {
      continued: hasMore,
      sent: claimedTargets.size,
      examined: recipients.length,
      apns: apnsTargets.length,
      fcm: fcmTargets.length,
      expoFallback: expoTargets.length,
      durationMs: Date.now() - startedAt,
    };
    console.log(JSON.stringify({
      metric: 'doji_push_fanout_page',
      dailyEventId,
      shard,
      ...response,
      remainingSeconds,
    }));
    return Response.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await database.rpc('release_doji_push_fanout_shard', {
      p_daily_event_id: dailyEventId,
      p_shard: shard,
      p_lease_id: leaseId,
      p_error: message,
    });
    console.error(JSON.stringify({
      metric: 'doji_push_fanout_failure',
      dailyEventId,
      shard,
      durationMs: Date.now() - startedAt,
      message,
    }));
    return new Response(message, { status: 500 });
  }
});
