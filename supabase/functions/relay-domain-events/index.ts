/// <reference path="../deno.d.ts" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendExpoPushMessages } from '../_shared/expo-push.ts';
import { recordPushDeliveryResults, type PushDeliveryOutcome } from '../_shared/push-delivery.ts';
import { pushPreferenceEnabled } from '../_shared/notification-preferences.ts';
import { processBroadcastPush } from '../_shared/broadcast-push.ts';
import { apnsConfigured, sendApnsMessage } from '../_shared/apns-push.ts';
import { fcmConfigured, sendFcmMessage } from '../_shared/fcm-push.ts';
import {
  buildAblyMessages,
  getPushExpiresAtMs,
  isPushFresh,
  type DeliveryEvent,
} from '../_shared/domain-event-delivery.ts';
import { fetchWithTimeout } from '../_shared/fetch-timeout.ts';
import { assertBusinessEvent, isBusinessEvent } from '../_shared/business-realtime.ts';
import { resolvePushPolicy } from '../_shared/notification-policy.ts';
import { logRealtimeLatency } from '../_shared/realtime-latency.ts';
import {
  formatEmailTimestamp,
  humanizeEmailToken,
  renderDojiEmail,
  type DojiEmailTone,
} from '../_shared/doji-email.ts';
const MAX_TOPIC_WORKERS = 16;
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
    const response = await fetchWithTimeout(
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
  const eventType =
    event.event_type === 'fanout.post_membership'
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
    const response = await fetchWithTimeout('https://main.realtime.ably.net/messages', {
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

type EventLease = {
  id: string;
  leaseId: string;
};

type NativeEndpoint = {
  installationId: string;
  token: string;
  provider: 'apns' | 'fcm';
  environment: 'sandbox' | 'production';
  notificationContractVersion?: number;
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

type ServiceDatabase = ReturnType<typeof createClient>;

type ModerationDeliveryCopy = {
  decisionId: string;
  userId: string;
  action: 'remove_content' | 'remove_profile_photo';
  severity: 'level_1' | 'level_2' | 'level_3';
  accountAction: 'warning' | 'temporary_restriction' | 'permanent_ban';
  accountActionStartsAt: string;
  accountActionEndsAt: string | null;
  policyCode: string;
  appealEligible: boolean;
  decidedAt: string;
  title: string;
  body: string;
};

async function loadModerationDeliveryCopy(
  database: ServiceDatabase,
  event: RelayEvent,
): Promise<ModerationDeliveryCopy | null> {
  if (event.event_type !== 'moderation.status.changed') return null;
  const decisionId = String(event.payload.decisionId ?? event.aggregate_id ?? '');
  const targetUserId = String(event.payload.targetUserId ?? '');
  if (!decisionId || !targetUserId) throw new Error('Moderation delivery identifiers are missing');

  const { data: decision, error: decisionError } = await database
    .from('moderation_decisions')
    .select(
      'id, affected_user_id, action, severity, policy_code, appeal_eligible, decided_at, state, user_notice',
    )
    .eq('id', decisionId)
    .eq('affected_user_id', targetUserId)
    .maybeSingle();
  if (decisionError) throw new Error(`Moderation delivery read failed: ${decisionError.message}`);
  if (
    !decision ||
    decision.state !== 'active' ||
    !['remove_content', 'remove_profile_photo'].includes(String(decision.action)) ||
    !['level_1', 'level_2', 'level_3'].includes(String(decision.severity))
  ) {
    throw new Error('Moderation delivery is not an active finalized removal');
  }

  const { data: accountAction, error: accountActionError } = await database
    .from('moderation_account_actions')
    .select('action, starts_at, ends_at')
    .eq('decision_id', decisionId)
    .maybeSingle();
  if (accountActionError) {
    throw new Error(`Moderation account outcome read failed: ${accountActionError.message}`);
  }
  if (
    !accountAction?.action ||
    !['warning', 'temporary_restriction', 'permanent_ban'].includes(String(accountAction.action))
  ) {
    throw new Error('Moderation account outcome is missing');
  }

  const { data: notice, error: noticeError } = await database
    .from('moderation_notices')
    .select('title, body')
    .eq('decision_id', decisionId)
    .eq('user_id', targetUserId)
    .eq('kind', 'decision')
    .maybeSingle();
  if (noticeError) throw new Error(`Moderation notice read failed: ${noticeError.message}`);
  if (!notice?.title || !notice?.body) throw new Error('Moderation member notice is missing');

  return {
    decisionId,
    userId: targetUserId,
    action: decision.action as ModerationDeliveryCopy['action'],
    severity: decision.severity as ModerationDeliveryCopy['severity'],
    accountAction: accountAction.action as ModerationDeliveryCopy['accountAction'],
    accountActionStartsAt: String(accountAction.starts_at),
    accountActionEndsAt: accountAction.ends_at ? String(accountAction.ends_at) : null,
    policyCode: String(decision.policy_code),
    appealEligible: decision.appeal_eligible === true,
    decidedAt: String(decision.decided_at),
    title: String(notice.title),
    body: String(notice.body),
  };
}

async function loadModerationPushRecipient(
  database: ServiceDatabase,
  userId: string,
): Promise<PushProfile | null> {
  const { data, error } = await database.rpc('get_moderation_push_recipient', {
    p_user_id: userId,
  });
  if (error) throw new Error(`Moderation push recipient read failed: ${error.message}`);
  const recipient = Array.isArray(data) ? data[0] : null;
  if (!recipient) return null;
  return {
    notification_token: recipient.notification_token,
    notification_preferences: recipient.notification_preferences as Record<string, unknown> | null,
    native_endpoints: Array.isArray(recipient.native_endpoints)
      ? (recipient.native_endpoints as NativeEndpoint[])
      : [],
  };
}

async function deliverMemberModerationEmail(
  database: ServiceDatabase,
  event: RelayEvent,
  copy: ModerationDeliveryCopy | null,
): Promise<void> {
  if (event.payload.sendEmail !== true) return;
  if (!copy || !['level_2', 'level_3'].includes(copy.severity)) {
    throw new Error('Member email is allowed only for a finalized serious removal');
  }

  const { data: existing, error: existingError } = await database
    .from('member_moderation_email_deliveries')
    .select('status')
    .eq('decision_id', copy.decisionId)
    .maybeSingle();
  if (existingError)
    throw new Error(`Moderation email receipt read failed: ${existingError.message}`);
  if (existing?.status === 'sent' || existing?.status === 'skipped') return;

  const { data: authResult, error: authError } = await database.auth.admin.getUserById(copy.userId);
  if (authError) throw new Error(`Moderation email recipient lookup failed: ${authError.message}`);
  const recipient = authResult.user?.email_confirmed_at ? authResult.user.email?.trim() : undefined;
  if (!recipient) {
    const { error: skippedError } = await database
      .from('member_moderation_email_deliveries')
      .upsert(
        {
          event_id: event.id,
          decision_id: copy.decisionId,
          user_id: copy.userId,
          status: 'skipped',
          last_error: 'No verified email recipient',
          attempted_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        },
        { onConflict: 'decision_id' },
      );
    if (skippedError)
      throw new Error(`Moderation email skip receipt failed: ${skippedError.message}`);
    return;
  }

  const resendKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('MEMBER_FROM_EMAIL') ?? Deno.env.get('ADMIN_FROM_EMAIL');
  if (!resendKey || !from) throw new Error('Member moderation email is not configured');

  const subject =
    copy.accountAction === 'permanent_ban'
      ? 'Your Doji account has been suspended'
      : copy.accountAction === 'temporary_restriction'
        ? 'Your Doji account is temporarily restricted'
        : 'We took action on content you shared';
  const accountStatus =
    copy.accountAction === 'permanent_ban'
      ? 'Suspended'
      : copy.accountAction === 'temporary_restriction'
        ? 'Temporarily restricted'
        : 'Warning issued';
  const contentAction =
    copy.action === 'remove_profile_photo' ? 'Profile photo removed' : 'Reported content removed';
  const tone: DojiEmailTone =
    copy.accountAction === 'permanent_ban'
      ? 'critical'
      : copy.accountAction === 'temporary_restriction'
        ? 'danger'
        : 'warning';
  const template = renderDojiEmail({
    preheader: `${accountStatus}: review the decision and your options in Doji Account Status.`,
    eyebrow: 'Account status · official notice',
    title: copy.title,
    summary: copy.body,
    tone,
    statusLabel: accountStatus,
    facts: [
      { label: 'Content action', value: contentAction },
      { label: 'Account status', value: accountStatus },
      { label: 'Policy area', value: humanizeEmailToken(copy.policyCode) },
      { label: 'Decision recorded', value: formatEmailTimestamp(copy.decidedAt) },
      ...(copy.accountActionEndsAt
        ? [{ label: 'Restriction ends', value: formatEmailTimestamp(copy.accountActionEndsAt) }]
        : []),
    ],
    sections: [
      {
        heading: 'Review the full decision in Doji',
        body: 'Open Doji and go to Profile → Settings → Account Status. That private screen is the authoritative place to review the notice, account consequence, and delivery status.',
      },
      {
        heading: copy.appealEligible ? 'You can appeal this decision' : 'About this decision',
        body: copy.appealEligible
          ? 'If you believe this decision is incorrect, Account Status lets you submit one appeal with relevant context. A reviewer will evaluate the decision and your statement.'
          : 'This decision is not currently eligible for an in-app appeal. Doji Support can help with access or technical questions, but support cannot bypass a safety decision.',
        bullets: [
          'Do not reply with passwords, sign-in codes, or private media.',
          'The identity of anyone who submitted a report is never included in this notice.',
          'Keep the decision reference below if you contact support.',
        ],
      },
    ],
    actions: [
      { label: 'Open Account Status', href: 'doit://profile/account-status' },
      { label: 'Get support', href: 'https://dojipro.com/support/', kind: 'secondary' },
    ],
    reference: copy.decisionId,
    footerNote:
      'Private account notice for the verified recipient. This message never identifies a reporter or includes restricted evidence.',
  });
  const requestBody = JSON.stringify({
    from,
    to: [recipient],
    subject,
    html: template.html,
    text: template.text,
  });
  const response = await fetchWithTimeout('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `moderation-decision/${copy.decisionId}`,
    },
    body: requestBody,
  });
  const providerResult = (await response.json().catch(() => null)) as { id?: string } | null;
  if (!response.ok || !providerResult?.id) {
    await database.from('member_moderation_email_deliveries').upsert(
      {
        event_id: event.id,
        decision_id: copy.decisionId,
        user_id: copy.userId,
        status: 'failed',
        last_error: `Resend handoff failed (${response.status})`,
        attempted_at: new Date().toISOString(),
        completed_at: null,
      },
      { onConflict: 'decision_id' },
    );
    throw new Error(`Member moderation email handoff failed (${response.status})`);
  }

  const { error: receiptError } = await database.from('member_moderation_email_deliveries').upsert(
    {
      event_id: event.id,
      decision_id: copy.decisionId,
      user_id: copy.userId,
      status: 'sent',
      provider_id: providerResult.id,
      last_error: null,
      attempted_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    },
    { onConflict: 'decision_id' },
  );
  if (receiptError)
    throw new Error(`Moderation email receipt write failed: ${receiptError.message}`);
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
        .filter((event) => {
          if (isBusinessEvent(event)) return false;
          const policy = resolvePushPolicy(event);
          return policy?.mode === 'targeted' && event.payload?.targetUserId;
        })
        .map((event) => String(event.payload.targetUserId)),
    ),
  ];
  // Resolve push recipients concurrently with Ably publication. Push profile
  // reads must never sit in front of a live feed/comment/reaction invalidation.
  const profilesByIdPromise = (async () => {
    const profilesById = new Map<string, PushProfile>();
    if (targetUserIds.length === 0) return { profilesById, error: null };
    const { data: profiles, error: profilesError } = await database.rpc('get_push_recipients', {
      p_user_ids: targetUserIds,
    });
    if (profilesError) return { profilesById, error: profilesError };
    for (const profile of profiles ?? []) {
      profilesById.set(String(profile.user_id), {
        notification_token: profile.notification_token,
        notification_preferences: profile.notification_preferences as Record<
          string,
          unknown
        > | null,
        native_endpoints: Array.isArray(profile.native_endpoints)
          ? (profile.native_endpoints as NativeEndpoint[])
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
    const workerKey =
      isBusinessEvent(event) ? `business-scope:${event.topic}` :
      event.topic === 'internal:friend-fanout' ? `${event.topic}:${event.id}` : event.topic;
    const group = byTopic.get(workerKey) ?? [];
    group.push(event);
    byTopic.set(workerKey, group);
  }

  let published = 0;
  let failed = 0;
  let continued = 0;
  let broadcastSent = 0;
  const bulkCompletions: EventLease[] = [];
  const queueBulkCompletion = (event: RelayEvent) => {
    bulkCompletions.push({ id: event.id, leaseId: event.lease_id });
  };
  const processEventSideEffects = async (event: RelayEvent) => {
    try {
      const pushPolicy = resolvePushPolicy(event);
      const hasPush = pushPolicy !== null;
      const moderationCopy = await loadModerationDeliveryCopy(database, event);
      if (hasPush && !isPushFresh(event)) {
        await deliverMemberModerationEmail(database, event, moderationCopy);
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

      const broadcast =
        pushPolicy?.mode === 'broadcast'
          ? await processBroadcastPush(database, event)
          : { handled: false, continued: false, sent: 0 };
      broadcastSent += broadcast.sent;
      if (broadcast.continued) {
        continued += 1;
        return;
      }

      if (!broadcast.handled && pushPolicy?.mode === 'targeted' && event.payload?.targetUserId) {
        const targetUserId = String(event.payload.targetUserId);
        const profileState = await profilesByIdPromise;
        if (profileState.error) throw profileState.error;
        let profile = profileState.profilesById.get(targetUserId);
        if (!profile && moderationCopy?.accountAction === 'permanent_ban') {
          profile = (await loadModerationPushRecipient(database, targetUserId)) ?? undefined;
        }

        const token = profile?.notification_token?.trim();
        const preferenceKey = pushPolicy.preferenceKey;
        const preferences = profile?.notification_preferences;
        const nativeEndpoints = (profile?.native_endpoints ?? []).filter(
          (endpoint) =>
            Boolean(endpoint.token) &&
            ((endpoint.provider === 'apns' && apnsConfigured()) ||
              (endpoint.provider === 'fcm' && fcmConfigured())),
        );
        if (
          (nativeEndpoints.length > 0 || token) &&
          pushPreferenceEnabled(preferences, preferenceKey)
        ) {
          const pushTargets =
            nativeEndpoints.length > 0
              ? nativeEndpoints.map((endpoint) => ({
                  userId: targetUserId,
                  endpointKey: `native:${endpoint.installationId}`,
                }))
              : [{ userId: targetUserId, endpointKey: 'expo' }];
          const { data: claimedData, error: claimError } = await database.rpc(
            'claim_push_delivery_targets_batch_v2',
            {
              p_event_id: event.id,
              p_targets: pushTargets,
              p_category: preferenceKey ?? event.event_type,
              p_aggregate_id: String(event.aggregate_id ?? event.id),
              p_scope_kind: pushPolicy.scopeKind,
              p_scope_id: pushPolicy.scopeId,
              p_occurred_at: String(event.payload.occurredAt ?? event.created_at),
            },
          );
          if (claimError) throw claimError;
          const claimedTargets = (claimedData ?? []) as ClaimedPushTarget[];
          if (claimedTargets.length === 0) {
            await deliverMemberModerationEmail(database, event, moderationCopy);
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

          const pushExpiresAtMs = getPushExpiresAtMs(event);
          if (pushExpiresAtMs === null) throw new Error('Push expiration is invalid');
          const ttl = Math.max(1, Math.ceil((pushExpiresAtMs - Date.now()) / 1000));
          const title = moderationCopy?.title ?? String(event.payload.title ?? 'Doji');
          const body = moderationCopy?.body.slice(0, 220) ?? String(event.payload.body ?? '');
          const collapseKey = pushPolicy.collapseKey;
          const notificationData = {
            type: String(
              event.payload.type ??
                (event.event_type === 'doji.activated' ? 'CHALLENGE' : 'ACTIVITY'),
            ),
            eventId: event.id,
            daily_event_id: event.payload.dailyEventId ? String(event.payload.dailyEventId) : '',
            postId: event.payload.postId ? String(event.payload.postId) : '',
            commentId: event.payload.commentId ? String(event.payload.commentId) : '',
            voteId: event.payload.voteId ? String(event.payload.voteId) : '',
            url: event.payload.url ? String(event.payload.url) : '',
            notificationScopeKind: pushPolicy.scopeKind,
            notificationScopeId: pushPolicy.scopeId,
          };
          const expoChannelId = (profile?.native_endpoints ?? []).some(
            (endpoint) => (endpoint.notificationContractVersion ?? 1) >= 2,
          )
            ? pushPolicy.channelId
            : 'doji-alerts';
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
            const push =
              endpoint.provider === 'apns'
                ? await sendApnsMessage(database, {
                    token: endpoint.token,
                    environment: endpoint.environment ?? 'production',
                    title,
                    body,
                    collapseId: collapseKey,
                    expiresAtEpochSeconds: Math.floor(pushExpiresAtMs / 1000),
                    interruptionLevel: pushPolicy.interruptionLevel,
                    data: notificationData,
                  })
                : await sendFcmMessage({
                    token: endpoint.token,
                    title,
                    body,
                    collapseKey,
                    ttlSeconds: ttl,
                    data: notificationData,
                    channelId:
                      (endpoint.notificationContractVersion ?? 1) >= 2
                        ? pushPolicy.channelId
                        : 'doji-alerts',
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
            const pushResult = await sendExpoPushMessages([
              {
                to: token,
                title,
                body,
                sound: 'default',
                channelId: expoChannelId,
                badge: 1,
                ttl,
                priority: 'high',
                interruptionLevel: pushPolicy.interruptionLevel,
                threadId: collapseKey,
                collapseId: collapseKey,
                tag: collapseKey,
                data: notificationData,
              },
            ]);
            const ticket = pushResult.tickets[0];
            invalidExpoToken = pushResult.invalidTokenIndices.includes(0);
            results.push({
              deliveryKey: expoDeliveryKey,
              outcome: invalidExpoToken
                ? 'invalid_token'
                : ticket?.status === 'ok'
                  ? 'accepted'
                  : pushResult.httpOk
                    ? 'rejected'
                    : 'transport_error',
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
          if (results.some((result) => result.outcome === 'transport_error')) {
            // Release the event lease. Only transport-failed endpoint claims are
            // reclaimable; accepted/rejected claims remain terminal.
            throw new Error('Push provider transport failed before confirmed handoff');
          }
        }
      }

      await deliverMemberModerationEmail(database, event, moderationCopy);

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
      const message =
        fanoutPublishError instanceof Error
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
    if (resolvePushPolicy(event) === null) queueBulkCompletion(event);
    else await processEventSideEffects(event);
  };

  // Preserve ordering within each Ably channel, while allowing independent
  // user/public channels to drain concurrently under a bounded worker count.
  await runTopicWorkers([...byTopic.values()], async (group) => {
    try {
      for (const event of group) assertBusinessEvent(event, Deno.env.get('BUSINESS_REALTIME_RELAY_ENABLED') === 'true');
    } catch (error) {
      failed += group.length;
      await Promise.all(group.map(event => database.rpc('release_domain_event', {
        p_event_id: event.id, p_lease_id: event.lease_id,
        p_error: error instanceof Error ? error.message : 'Invalid business event',
      })));
      return;
    }
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

    // Realtime for the entire channel is now live. No-push events are completed
    // in one database operation after all topic workers finish. Push-bearing
    // events retain their durable, per-event delivery state machine.
    for (const event of group) {
      if (resolvePushPolicy(event) === null) queueBulkCompletion(event);
      else await processEventSideEffects(event);
    }
  });

  if (bulkCompletions.length > 0) {
    const { data: completedData, error: completionError } = await database.rpc(
      'complete_domain_events_batch',
      { p_events: bulkCompletions },
    );
    const completed = typeof completedData === 'number' ? completedData : 0;
    published += completed;
    if (completionError || completed !== bulkCompletions.length) {
      failed += bulkCompletions.length - completed;
      const message =
        completionError?.message ??
        `Completed ${completed} of ${bulkCompletions.length} event leases`;
      await database.rpc('release_domain_events_batch', {
        p_events: bulkCompletions,
        p_error: message,
      });
    }
  }

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
