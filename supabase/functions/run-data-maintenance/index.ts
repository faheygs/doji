/// <reference path="../deno.d.ts" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (request) => {
  const expectedSecret = Deno.env.get('OUTBOX_RELAY_SECRET');
  if (!expectedSecret || request.headers.get('x-outbox-secret') !== expectedSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const database = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const totals: Record<string, number> = {};
  let hasMore = true;

  // Hard bound protects Edge runtime. Daily close calls will keep draining
  // backlog without ever putting maintenance on the challenge critical path.
  for (let batch = 0; batch < 5 && hasMore; batch += 1) {
    const { data, error } = await database.rpc('run_operational_retention_batch', {
      p_limit: 5000,
    });
    if (error) return new Response(error.message, { status: 500 });
    const result = (data ?? {}) as Record<string, number | boolean>;
    hasMore = result.has_more === true;
    for (const [key, value] of Object.entries(result)) {
      if (typeof value === 'number') totals[key] = (totals[key] ?? 0) + value;
    }
  }

  let orphanedMedia = 0;
  for (let batch = 0; batch < 5; batch += 1) {
    const { data, error } = await database.rpc('claim_expired_media_upload_intents', {
      p_limit: 500,
    });
    if (error) return new Response(error.message, { status: 500 });
    const intents = (data ?? []) as Array<{
      id: string;
      bucket_id: string;
      object_path: string;
    }>;
    if (!intents.length) break;

    const byBucket = new Map<string, typeof intents>();
    for (const intent of intents) {
      const entries = byBucket.get(intent.bucket_id) ?? [];
      entries.push(intent);
      byBucket.set(intent.bucket_id, entries);
    }
    for (const [bucketId, bucketIntents] of byBucket) {
      const { error: removeError } = await database.storage
        .from(bucketId)
        .remove(bucketIntents.map((intent) => intent.object_path));
      if (removeError) return new Response(removeError.message, { status: 500 });
    }

    const { data: deleted, error: deleteError } = await database.rpc(
      'delete_media_upload_intents',
      { p_ids: intents.map((intent) => intent.id) },
    );
    if (deleteError) return new Response(deleteError.message, { status: 500 });
    orphanedMedia += Number(deleted ?? 0);
    if (intents.length < 500) break;
  }

  let committedMediaIntents = 0;
  for (let batch = 0; batch < 5; batch += 1) {
    const { data, error } = await database.rpc(
      'delete_stale_committed_media_upload_intents',
      { p_limit: 5000 },
    );
    if (error) return new Response(error.message, { status: 500 });
    const deleted = Number(data ?? 0);
    committedMediaIntents += deleted;
    if (deleted < 5000) break;
  }

  let stalePushEndpoints = 0;
  for (let batch = 0; batch < 5; batch += 1) {
    const { data, error } = await database.rpc('delete_stale_push_endpoints', {
      p_limit: 5000,
    });
    if (error) return new Response(error.message, { status: 500 });
    const deleted = Number(data ?? 0);
    stalePushEndpoints += deleted;
    if (deleted < 5000) break;
  }

  let expiredRateLimitBuckets = 0;
  let rateLimitHasMore = false;
  for (let batch = 0; batch < 5; batch += 1) {
    const { data, error } = await database.rpc(
      'delete_expired_api_rate_limit_buckets',
      { p_limit: 5000 },
    );
    if (error) return new Response(error.message, { status: 500 });
    const deleted = Number(data ?? 0);
    expiredRateLimitBuckets += deleted;
    rateLimitHasMore = deleted >= 5000;
    if (!rateLimitHasMore) break;
  }

  let deletedPostMedia = 0;
  for (let batch = 0; batch < 5; batch += 1) {
    const { data, error } = await database.rpc('claim_pending_media_deletions', {
      p_limit: 500,
    });
    if (error) return new Response(error.message, { status: 500 });
    const pending = (data ?? []) as Array<{
      id: string;
      bucket_id: string;
      object_path: string;
    }>;
    if (!pending.length) break;

    const byBucket = new Map<string, typeof pending>();
    for (const item of pending) {
      const entries = byBucket.get(item.bucket_id) ?? [];
      entries.push(item);
      byBucket.set(item.bucket_id, entries);
    }
    for (const [bucketId, entries] of byBucket) {
      const { error: removeError } = await database.storage
        .from(bucketId)
        .remove(entries.map((item) => item.object_path));
      if (removeError) return new Response(removeError.message, { status: 500 });
    }

    const { data: deleted, error: deleteError } = await database.rpc(
      'delete_pending_media_deletions',
      { p_ids: pending.map((item) => item.id) },
    );
    if (deleteError) return new Response(deleteError.message, { status: 500 });
    deletedPostMedia += Number(deleted ?? 0);
    if (pending.length < 500) break;
  }

  return Response.json({
    totals,
    orphaned_media: orphanedMedia,
    committed_media_intents: committedMediaIntents,
    stale_push_endpoints: stalePushEndpoints,
    expired_rate_limit_buckets: expiredRateLimitBuckets,
    deleted_post_media: deletedPostMedia,
    hasMore: hasMore || rateLimitHasMore,
  });
});
