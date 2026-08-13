import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

type JsonRecord = Record<string, unknown>;

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function legacyPushDeliveryKey(input: {
  targetUserId: string;
  preferenceKey: string;
  title: string;
  body: string;
  data: JsonRecord;
}): Promise<{ key: string; aggregateId: string }> {
  const aggregateId = [
    'notificationId',
    'eventId',
    'postId',
    'commentId',
    'friendshipId',
    'voteId',
    'userEventId',
    'badgeId',
    'suggestionId',
  ].map((name) => stringValue(input.data[name])).find(Boolean);

  // Older trigger payloads do not all contain an entity id. Bucket those for
  // five minutes: retries collapse, while a genuinely new later event remains
  // deliverable. Entity-backed keys never expire or repeat.
  const fallbackBucket = Math.floor(Date.now() / 300_000).toString();
  const stableAggregate = aggregateId ?? `legacy:${fallbackBucket}`;
  const material = [
    input.targetUserId,
    input.preferenceKey,
    stableAggregate,
    input.title,
    input.body,
  ].join('\u001f');

  return {
    key: `push:${await sha256(material)}`,
    aggregateId: stableAggregate,
  };
}

export async function claimPushDelivery(
  database: SupabaseClient,
  input: {
    deliveryKey: string;
    targetUserId: string;
    category: string;
    aggregateId?: string | null;
  },
): Promise<boolean> {
  const { data, error } = await database.rpc('claim_push_delivery', {
    p_delivery_key: input.deliveryKey,
    p_target_user_id: input.targetUserId,
    p_category: input.category,
    p_aggregate_id: input.aggregateId ?? null,
  });
  if (error) throw error;
  return data === true;
}
