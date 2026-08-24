/// <reference path="../deno.d.ts" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendExpoPushMessages } from '../_shared/expo-push.ts';
import {
  recordPushDeliveryResults,
  type PushDeliveryOutcome,
} from '../_shared/push-delivery.ts';
import { pushPreferenceEnabled } from '../_shared/notification-preferences.ts';
import { processBroadcastPush } from '../_shared/broadcast-push.ts';
import { apnsConfigured, sendApnsMessage } from '../_shared/apns-push.ts';
import { fcmConfigured, sendFcmMessage } from '../_shared/fcm-push.ts';
import {
  buildAblyMessages,
  isPushFresh,
  type DeliveryEvent,
} from '../_shared/domain-event-delivery.ts';

const MAX_TOPIC_WORKERS = 8;
const MAX_ABLY_MESSAGES_PER_REQUEST = 25;
const MAX_ABLY_BATCH_CHANNELS = 100;

async function publishAblyEvents(
  apiKey: string,
  topic: string,
  events: RelayEvent[],
): Promise<void> {
  if (events.length === 0) return;
  for (let index = 0; index < events.length; index += MAX_ABLY_MESSAGES_PER_REQUEST) {
    const chunk = events.slice(index, index + MAX_ABLY_MESSAGES_PER_REQUEST);
    const response = await fetch(
      `https://rest.ably.io/channels/${encodeURIComponent(topic)}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(apiKey)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildAblyMessages(chunk)),
      },
    );
    if (!response.ok) {
      throw new Error(`Ably publish failed (${response.status}): ${await response.text()}`);
    }
  }
}

function batchResponseFailed(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(batchResponseFailed);
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  if (typeof result.statusCode === 'number' && result.statusCode >= 400) return true;
  if (result.error) return true;
  return Object.values(result).some(batchResponseFailed);
}

async function publishFriendFanoutBatch(
  apiKey: string,
  event: RelayEvent,
  topics: string[],
): Promise<void> {
  const eventType = event.event_type === 'fanout.post_membership'
    ? 'post.created'
    : event.event_type === 'fanout.friend_completion'
      ? 'notification.friend_activity.updated'
      : event.event_type === 'fanout.community_reaction'
        ? 'notification.reaction.updated'
        : event.event_type === 'fanout.profile_presentation'
          ? 'profile.presentation.updated'
          : event.event_type === 'fanout.profile_stats'
            ? 'profile.stats.updated'
            : event.event_type === 'fanout.badge'
              ? 'badge.updated'
              : null;
  if (!eventType || topics.length === 0) return;

  for (let index = 0; index < topics.length; index += MAX_ABLY_BATCH_CHANNELS) {
    const channels = topics.slice(index, index + MAX_ABLY_BATCH_CHANNELS);
    const response = await fetch('https://main.realtime.ably.net/messages', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(apiKey)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channels,
        messages: {
          id: event.id,
          name: eventType,
          data: {
            ...event.payload,
            eventId: event.id,
            aggregateId: event.aggregate_id,
            occurredAt: event.payload?.occurredAt ?? event.created_at,
          },
        },
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || batchResponseFailed(body)) {
      throw new Error(`Ably friend fanout failed (${response.status})`);
    }
  }
}

type RelayEvent = DeliveryEvent & {
  topic: string;
  lease_id: string;
};

type NativeEndpoint = {
  installationId: string;
  token: string;
  provider: 'apns' | 'fcm';
  environment: 'sandbox' | 'production';
};

type PushProfile = {
  notification_token: string | null;
  notification_preferences: Record<string, unknown> | null;
  native_endpoints: NativeEndpoint[];
};

type ClaimedPushTarget = {
  delivery_key: string;
  target_user_id: string;
  endpoint_key: string;
};

function logRealtimeLatency(events: RelayEvent[]): void {
  if (events.length === 0) return;
  const now = Date.now();
  const delays = events.map((event) => {
    const readyAt = Math.max(Date.parse(event.created_at), Date.parse(event.available_at));
    return Math.max(0, now - readyAt);
  });
  const maxMs = Math.max(...delays);
  const record = JSON.stringify({
    metric: 'domain_realtime_publish',
    count: events.length,
    maxMs,
    topic: events[0].topic,
  });
  if (maxMs > 5_000) console.warn(record);
  else console.log(record);
}

async function runTopicWorkers(
  groups: RelayEvent[][],
  worker: (group: RelayEvent[]) => Promise<void>,
): Promise<void> {
  let next = 0;
  const run = async () => {
    while (next < groups.length) {
      const group = groups[next];
      next += 1;
      await worker(group);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(MAX_TOPIC_WORKERS, groups.length) }, () => run()),
  );
}

Deno.serve(async (request) => {
  const expectedSecret = Deno.env.get('OUTBOX_RELAY_SECRET');
  if (!expectedSecret || request.headers.get('x-outbox-secret') !== expectedSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const ablyKey = Deno.env.get('ABLY_API_KEY');
  if (!ablyKey) return new Response('Realtime service is not configured', { status: 500 });

  const database = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data: events, error } = await database.rpc('claim_domain_events_v2', {
    p_batch_size: 100,
  });
  if (error) return new Response(error.message, { status: 500 });

  const claimedEvents = (events ?? []) as RelayEvent[];
  const targetUserIds = [
    ...new Set(
      claimedEvents
        .filter((event) => event.payload?.sendPush === true && event.payload?.targetUserId)
        .map((event) => String(event.payload.targetUserId)),
    ),
  ];
  // Resolve push recipients concurrently with Ably publication. Push profile
  // reads must never sit in front of a live feed/comment/reaction invalidation.
  const profilesByIdPromise = (async () => {
    const profilesById = new Map<string, PushProfile>();
    if (targetUserIds.length === 0) return { profilesById, error: null };
    const { data: profiles, error: profilesError } = await database.rpc(
      'get_push_recipients',
      { p_user_ids: targetUserIds },
    );
    if (profilesError) return { profilesById, error: profilesError };
    for (const profile of profiles ?? []) {
      profilesById.set(String(profile.user_id), {
        notification_token: profile.notification_token,
        notification_preferences: profile.notification_preferences as Record<
          string,
          unknown
        > | null,
        native_endpoints: Array.isArray(profile.native_endpoints)
          ? profile.native_endpoints as NativeEndpoint[]
          : [],
      });
    }
    return { profilesById, error: null };
  })();

  const byTopic = new Map<string, RelayEvent[]>();
  for (const event of claimedEvents) {
    // Internal expansion jobs are independent. A unique worker key preserves
    // bounded parallelism instead of serializing the entire social graph on one
    // synthetic topic.
    const workerKey = event.topic === 'internal:friend-fanout'
      ? `${event.topic}:${event.id}`
      : event.topic;
    const group = byTopic.get(workerKey) ?? [];
    group.push(event);
    byTopic.set(workerKey, group);
  }

  let published = 0;
  let failed = 0;
  let continued = 0;
  let broadcastSent = 0;
  const processEventSideEffects = async (event: RelayEvent) => {
    try {
      const hasPush = event.payload?.sendPush === true || event.payload?.broadcastPush === true;
      if (hasPush && !isPushFresh(event)) {
        const { data: completed, error: completionError } = await database.rpc(
          'complete_domain_event',
          { p_event_id: event.id, p_lease_id: event.lease_id },
        );
        if (completionError || !completed) {
          throw completionError ?? new Error('Event lease was lost');
        }
        published += 1;
        return;
      }

      const broadcast = await processBroadcastPush(database, event);
      broadcastSent += broadcast.sent;
      if (broadcast.continued) {
        continued += 1;
        return;
      }

      if (!broadcast.handled && event.payload?.sendPush === true && event.payload?.targetUserId) {
        const targetUserId = String(event.payload.targetUserId);
        const profileState = await profilesByIdPromise;
        if (profileState.error) throw profileState.error;
        const profile = profileState.profilesById.get(targetUserId);

        const token = profile?.notification_token?.trim();
        const preferenceKey = event.payload.preferenceKey
          ? String(event.payload.preferenceKey)
          : null;
        const preferences = profile?.notification_preferences;
        const nativeEndpoints = (profile?.native_endpoints ?? []).filter((endpoint) =>
          Boolean(endpoint.token) && (
            (endpoint.provider === 'apns' && apnsConfigured()) ||
            (endpoint.provider === 'fcm' && fcmConfigured())
          )
        );
        if ((nativeEndpoints.length > 0 || token) &&
          pushPreferenceEnabled(preferences, preferenceKey)) {
          const pushTargets = nativeEndpoints.length > 0
            ? nativeEndpoints.map((endpoint) => ({
              userId: targetUserId,
              endpointKey: `native:${endpoint.installationId}`,
            }))
            : [{ userId: targetUserId, endpointKey: 'expo' }];
          const { data: claimedData, error: claimError } = await database.rpc(
            'claim_push_delivery_targets_batch',
            {
              p_event_id: event.id,
              p_targets: pushTargets,
              p_category: preferenceKey ?? event.event_type,
              p_aggregate_id: String(event.aggregate_id ?? event.id),
            },
          );
          if (claimError) throw claimError;
          const claimedTargets = (claimedData ?? []) as ClaimedPushTarget[];
          if (claimedTargets.length === 0) {
            const { data: completed, error: completionError } = await database.rpc(
              'complete_domain_event',
              { p_event_id: event.id, p_lease_id: event.lease_id },
            );
            if (completionError || !completed) {
              throw completionError ?? new Error('Event lease was lost');
            }
            published += 1;
            return;
          }

          const ttl = event.event_type === 'doji.activated' ? 120 : 300;
          const title = String(event.payload.title ?? 'Doji');
          const body = String(event.payload.body ?? '');
          const collapseKey = String(event.payload.collapseId ?? event.payload.threadId ?? event.id);
          const notificationData = {
            type: String(
              event.payload.type ??
                (event.event_type === 'doji.activated' ? 'CHALLENGE' : 'ACTIVITY'),
            ),
            eventId: event.id,
            daily_event_id: event.payload.dailyEventId
              ? String(event.payload.dailyEventId)
              : '',
            postId: event.payload.postId ? String(event.payload.postId) : '',
            voteId: event.payload.voteId ? String(event.payload.voteId) : '',
            url: event.payload.url ? String(event.payload.url) : '',
          };
          const claimedByEndpoint = new Map(
            claimedTargets.map((target) => [target.endpoint_key, target.delivery_key]),
          );
          const results: Array<{
            deliveryKey: string;
            outcome: PushDeliveryOutcome;
            providerTicketId?: string;
            error?: string;
          }> = [];
          const invalidNativeTokens: string[] = [];

          for (const endpoint of nativeEndpoints) {
            const deliveryKey = claimedByEndpoint.get(`native:${endpoint.installationId}`);
            if (!deliveryKey) continue;
            const push = endpoint.provider === 'apns'
              ? await sendApnsMessage(database, {
                token: endpoint.token,
                environment: endpoint.environment ?? 'production',
                title,
                body,
                collapseId: collapseKey,
                expiresAtEpochSeconds: Math.floor(Date.now() / 1000) + ttl,
                interruptionLevel:
                  event.payload.interruptionLevel === 'passive'
                    ? 'passive'
                    : event.payload.interruptionLevel === 'time-sensitive'
                      ? 'time-sensitive'
                      : 'active',
                data: notificationData,
              })
              : await sendFcmMessage({
                token: endpoint.token, title, body, collapseKey, ttlSeconds: ttl,
                data: notificationData,
              });
            results.push({
              deliveryKey,
              outcome: push.outcome,
              providerTicketId: push.providerId,
              error: push.error,
            });
            if (push.outcome === 'invalid_token') invalidNativeTokens.push(endpoint.token);
          }

          let invalidExpoToken = false;
          const expoDeliveryKey = claimedByEndpoint.get('expo');
          if (expoDeliveryKey && token) {
            const pushResult = await sendExpoPushMessages([{
              to: token, title, body, sound: 'default', badge: 1, ttl,
              priority: event.payload.priority === 'normal' ? 'normal' : 'high',
              interruptionLevel:
                event.payload.interruptionLevel === 'passive'
                  ? 'passive'
                  : event.payload.interruptionLevel === 'time-sensitive'
                    ? 'time-sensitive'
                    : 'active',
              threadId: event.payload.threadId ? String(event.payload.threadId) : undefined,
              collapseId: event.payload.collapseId ? String(event.payload.collapseId) : undefined,
              tag: event.payload.tag ? String(event.payload.tag) : undefined,
              data: notificationData,
            }]);
            const ticket = pushResult.tickets[0];
            invalidExpoToken = pushResult.invalidTokenIndices.includes(0);
            results.push({
              deliveryKey: expoDeliveryKey,
              outcome: invalidExpoToken
                ? 'invalid_token'
                : ticket?.status === 'ok'
                  ? 'accepted'
                  : pushResult.httpOk ? 'rejected' : 'transport_error',
              providerTicketId: ticket?.status === 'ok' ? ticket.id : undefined,
              error: ticket?.status === 'error' ? ticket.message : pushResult.transportError,
            });
          }
          await recordPushDeliveryResults(database, results);
          if (invalidExpoToken && token) {
            await database.rpc('invalidate_expo_push_token', {
              p_user_id: targetUserId,
              p_token: token,
            });
          }
          if (invalidNativeTokens.length > 0) {
            await database.rpc('invalidate_native_push_tokens', {
              p_tokens: invalidNativeTokens,
            });
          }
        }
      }

      const { data: completed, error: completionError } = await database.rpc(
        'complete_domain_event',
        { p_event_id: event.id, p_lease_id: event.lease_id },
      );
      if (completionError || !completed) {
        throw completionError ?? new Error('Event lease was lost');
      }
      published += 1;
    } catch (eventError) {
      failed += 1;
      const message = eventError instanceof Error ? eventError.message : String(eventError);
      await database.rpc('release_domain_event', {
        p_event_id: event.id,
        p_lease_id: event.lease_id,
        p_error: message,
      });
    }
  };

  const processInternalFanout = async (event: RelayEvent): Promise<void> => {
    const { data: realtimeTargets, error: targetsError } = await database.rpc(
      'get_friend_fanout_realtime_topics',
      { p_event_id: event.id },
    );
    if (targetsError) {
      failed += 1;
      await database.rpc('release_domain_event', {
        p_event_id: event.id,
        p_lease_id: event.lease_id,
        p_error: targetsError.message,
      });
      return;
    }
    try {
      await publishFriendFanoutBatch(
        ablyKey,
        event,
        ((realtimeTargets ?? []) as Array<{ topic: string }>).map((row) => row.topic),
      );
    } catch (fanoutPublishError) {
      failed += 1;
      const message = fanoutPublishError instanceof Error
        ? fanoutPublishError.message
        : String(fanoutPublishError);
      await database.rpc('release_domain_event', {
        p_event_id: event.id,
        p_lease_id: event.lease_id,
        p_error: message,
      });
      return;
    }
    if (event.payload?.realtimeOnly !== true) {
      const { error: fanoutError } = await database.rpc('process_friend_fanout_event', {
        p_event_id: event.id,
      });
      if (fanoutError) {
        failed += 1;
        await database.rpc('release_domain_event', {
          p_event_id: event.id,
          p_lease_id: event.lease_id,
          p_error: fanoutError.message,
        });
        return;
      }
    }
    await processEventSideEffects(event);
  };

  // Preserve ordering within each Ably channel, while allowing independent
  // user/public channels to drain concurrently under a bounded worker count.
  await runTopicWorkers([...byTopic.values()], async (group) => {
    if (group[0].topic === 'internal:friend-fanout') {
      for (const event of group) await processInternalFanout(event);
      return;
    }
    const unpublished = group.filter((event) => event.payload?.realtimePublished !== true);
    try {
      await publishAblyEvents(ablyKey, group[0].topic, unpublished);
      if (unpublished.length > 0) {
        const { data: marked, error: markedError } = await database.rpc(
          'mark_domain_events_realtime_published',
          {
            p_events: unpublished.map((event) => ({
              id: event.id,
              leaseId: event.lease_id,
            })),
          },
        );
        if (markedError || marked !== unpublished.length) {
          throw markedError ?? new Error('One or more event leases were lost after publish');
        }
        for (const event of unpublished) event.payload.realtimePublished = true;
        logRealtimeLatency(unpublished);
      }
    } catch (publishError) {
      failed += group.length;
      const message = publishError instanceof Error ? publishError.message : String(publishError);
      await Promise.all(
        group.map((event) =>
          database.rpc('release_domain_event', {
            p_event_id: event.id,
            p_lease_id: event.lease_id,
            p_error: message,
          }),
        ),
      );
      return;
    }

    // Realtime for the entire channel is now live. Slower push delivery may run
    // afterward without delaying a newer feed/comment/reaction invalidation.
    for (const event of group) await processEventSideEffects(event);
  });

  const { data: nextWakeData, error: nextWakeError } = await database.rpc(
    'next_domain_event_available_at',
  );
  // Allows the relay to be deployed immediately before its migration. Any
  // other database failure is terminal so a delayed alert cannot be stranded.
  if (nextWakeError && nextWakeError.code !== 'PGRST202') {
    return new Response(nextWakeError.message, { status: 500 });
  }
  const nextWakeAt = typeof nextWakeData === 'string' ? nextWakeData : null;

  return Response.json(
    {
      examined: claimedEvents.length,
      published,
      failed,
      continued,
      broadcastSent,
      hasMore: continued > 0 || claimedEvents.length >= 100,
      nextWakeAt,
    },
    { status: failed > 0 ? 503 : 200 },
  );
});
