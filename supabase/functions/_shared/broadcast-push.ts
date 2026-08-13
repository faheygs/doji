import { sendExpoPushMessages, type ExpoMessage } from './expo-push.ts';

const PAGE_SIZE = 1000;
const EXPO_BATCH_SIZE = 100;
const EXPO_BATCH_DELAY_MS = 220;

type DatabaseClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
  from: (table: string) => {
    update: (values: Record<string, unknown>) => {
      in: (column: string, values: string[]) => PromiseLike<{ error: { message: string } | null }>;
    };
  };
};

type BroadcastEvent = {
  id: string;
  aggregate_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  lease_id: string;
};

type Recipient = { user_id: string; notification_token: string };

export type BroadcastResult = {
  handled: boolean;
  continued: boolean;
  sent: number;
};

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });

function messageFor(event: BroadcastEvent, token: string): ExpoMessage {
  return {
    to: token,
    title: String(event.payload.title ?? 'Doji'),
    body: String(event.payload.body ?? ''),
    sound: 'default',
    badge: 1,
    ttl: 600,
    priority: 'high',
    interruptionLevel: 'time-sensitive',
    threadId: `doji-live:${String(event.payload.dailyEventId ?? event.id)}`,
    collapseId: `doji-live:${String(event.payload.dailyEventId ?? event.id)}`,
    tag: `doji-live:${String(event.payload.dailyEventId ?? event.id)}`,
    data: {
      type: 'CHALLENGE',
      eventId: event.id,
      daily_event_id: event.payload.dailyEventId,
      url: event.payload.url,
    },
  };
}

export async function processBroadcastPush(
  database: DatabaseClient,
  event: BroadcastEvent,
): Promise<BroadcastResult> {
  if (event.payload.broadcastPush !== true) {
    return { handled: false, continued: false, sent: 0 };
  }

  const dailyEventId = String(event.payload.dailyEventId ?? '');
  if (!dailyEventId) throw new Error('Broadcast is missing dailyEventId');
  const afterUserId = typeof event.payload.broadcastAfterUserId === 'string'
    ? event.payload.broadcastAfterUserId
    : null;
  const { data, error } = await database.rpc('get_doji_push_recipients_page', {
    p_daily_event_id: dailyEventId,
    p_after_user_id: afterUserId,
    p_limit: PAGE_SIZE,
  });
  if (error) throw new Error(error.message);
  const recipients = (data ?? []) as Recipient[];

  const { data: claimedData, error: claimError } = await database.rpc(
    'claim_push_deliveries_batch',
    {
      p_event_id: event.id,
      p_target_user_ids: recipients.map((recipient) => recipient.user_id),
      p_category: String(event.payload.preferenceKey ?? event.event_type),
      p_aggregate_id: String(event.aggregate_id ?? event.id),
    },
  );
  if (claimError) throw new Error(claimError.message);
  const claimed = new Set(
    ((claimedData ?? []) as Array<{ target_user_id: string }>).map((row) => row.target_user_id),
  );
  const sendable = recipients.filter((recipient) => claimed.has(recipient.user_id));
  const chunks: Recipient[][] = [];
  for (let index = 0; index < sendable.length; index += EXPO_BATCH_SIZE) {
    chunks.push(sendable.slice(index, index + EXPO_BATCH_SIZE));
  }

  for (const chunk of chunks) {
    const result = await sendExpoPushMessages(
      chunk.map((recipient) => messageFor(event, recipient.notification_token)),
    );
    if (!result.httpOk) throw new Error('Expo push transport failed');
    const terminalUserIds: string[] = [];
    const invalidTokens: string[] = [];
    result.invalidTokenIndices.forEach((index) => {
      const token = chunk[index]?.notification_token;
      if (token) invalidTokens.push(token);
    });
    result.tickets.forEach((ticket, index) => {
      if (ticket.status === 'ok' || result.invalidTokenIndices.includes(index)) {
        const userId = chunk[index]?.user_id;
        if (userId) terminalUserIds.push(userId);
      }
    });
    if (terminalUserIds.length > 0) {
      const { error: completeError } = await database.rpc('complete_push_deliveries_batch', {
        p_event_id: event.id,
        p_target_user_ids: terminalUserIds,
      });
      if (completeError) throw new Error(completeError.message);
    }
    if (invalidTokens.length > 0) {
      const { error: clearError } = await database.from('profiles')
        .update({ notification_token: null })
        .in('notification_token', [...new Set(invalidTokens)]);
      if (clearError) throw new Error(clearError.message);
    }
    if (terminalUserIds.length !== chunk.length) {
      throw new Error('Expo rejected one or more broadcast pushes');
    }
    await wait(EXPO_BATCH_DELAY_MS);
  }

  if (recipients.length === PAGE_SIZE) {
    const lastUserId = recipients[recipients.length - 1].user_id;
    const { data: continued, error: continueError } = await database.rpc(
      'continue_domain_event_broadcast',
      { p_event_id: event.id, p_lease_id: event.lease_id, p_after_user_id: lastUserId },
    );
    if (continueError || continued !== true) {
      throw new Error(continueError?.message ?? 'Broadcast event lease was lost');
    }
    return { handled: true, continued: true, sent: sendable.length };
  }

  return { handled: true, continued: false, sent: sendable.length };
}
