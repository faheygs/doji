/// <reference path="../deno.d.ts" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendExpoPushMessages } from '../_shared/expo-push.ts';
import {
  claimPushDelivery,
  recordPushDeliveryResults,
  type PushDeliveryOutcome,
} from '../_shared/push-delivery.ts';
import { pushPreferenceEnabled } from '../_shared/notification-preferences.ts';
import { processBroadcastPush } from '../_shared/broadcast-push.ts';
import {
  buildAblyMessages,
  isPushFresh,
  type DeliveryEvent,
} from '../_shared/domain-event-delivery.ts';

const MAX_TOPIC_WORKERS = 8;
const MAX_ABLY_MESSAGES_PER_REQUEST = 25;

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

type RelayEvent = DeliveryEvent & {
  topic: string;
  lease_id: string;
};

type PushProfile = {
  notification_token: string | null;
  notification_preferences: Record<string, unknown> | null;
};

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
  const profilesById = new Map<string, PushProfile>();
  if (targetUserIds.length > 0) {
    const { data: profiles, error: profilesError } = await database
      .from('profiles')
      .select('id, notification_token, notification_preferences')
      .in('id', targetUserIds);
    if (profilesError) return new Response(profilesError.message, { status: 500 });
    for (const profile of profiles ?? []) {
      profilesById.set(String(profile.id), {
        notification_token: profile.notification_token,
        notification_preferences: profile.notification_preferences as Record<
          string,
          unknown
        > | null,
      });
    }
  }

  const byTopic = new Map<string, RelayEvent[]>();
  for (const event of claimedEvents) {
    const group = byTopic.get(event.topic) ?? [];
    group.push(event);
    byTopic.set(event.topic, group);
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
        const profile = profilesById.get(targetUserId);

        const token = profile?.notification_token?.trim();
        const preferenceKey = event.payload.preferenceKey
          ? String(event.payload.preferenceKey)
          : null;
        const preferences = profile?.notification_preferences;
        if (token && pushPreferenceEnabled(preferences, preferenceKey)) {
          const deliveryKey = `outbox-push:${event.id}:${targetUserId}`;
          const claimed = await claimPushDelivery(database, {
            deliveryKey,
            targetUserId,
            category: preferenceKey ?? event.event_type,
            aggregateId: String(event.aggregate_id ?? event.id),
          });
          if (!claimed) {
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

          const pushResult = await sendExpoPushMessages([
            {
              to: token,
              title: String(event.payload.title ?? 'Doji'),
              body: String(event.payload.body ?? ''),
              sound: 'default',
              badge: 1,
              ttl: event.event_type === 'doji.activated' ? 120 : 300,
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
              data: {
                type: String(
                  event.payload.type ??
                    (event.event_type === 'doji.activated' ? 'CHALLENGE' : 'ACTIVITY'),
                ),
                eventId: event.id,
                daily_event_id: event.payload.dailyEventId,
                postId: event.payload.postId,
                voteId: event.payload.voteId,
                url: event.payload.url,
              },
            },
          ]);
          const ticket = pushResult.tickets[0];
          const invalidToken = pushResult.invalidTokenIndices.includes(0);
          const outcome: PushDeliveryOutcome = invalidToken
            ? 'invalid_token'
            : ticket?.status === 'ok'
              ? 'accepted'
              : pushResult.httpOk
                ? 'rejected'
                : 'transport_error';
          await recordPushDeliveryResults(database, [
            {
              deliveryKey,
              outcome,
              providerTicketId: ticket?.status === 'ok' ? ticket.id : undefined,
              error: ticket?.status === 'error' ? ticket.message : pushResult.transportError,
            },
          ]);
          if (invalidToken) {
            await database
              .from('profiles')
              .update({ notification_token: null })
              .eq('id', targetUserId)
              .eq('notification_token', token);
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

  // Preserve ordering within each Ably channel, while allowing independent
  // user/public channels to drain concurrently under a bounded worker count.
  await runTopicWorkers([...byTopic.values()], async (group) => {
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
