/// <reference path="../deno.d.ts" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

async function listObjectPaths(
  database: ReturnType<typeof createClient>,
  bucketId: string,
  folder: string,
): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await database.storage.from(bucketId).list(folder, {
      limit: 100,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw new Error(`${bucketId} list failed: ${error.message}`);
    if (!data?.length) break;
    for (const item of data) {
      const path = `${folder}/${item.name}`;
      if (item.id) paths.push(path);
      else paths.push(...(await listObjectPaths(database, bucketId, path)));
    }
    if (data.length < 100) break;
  }
  return paths;
}

async function removeAccountMedia(
  database: ReturnType<typeof createClient>,
  userId: string,
) {
  for (const bucketId of ['avatars', 'post-media']) {
    const paths = await listObjectPaths(database, bucketId, userId);
    for (let index = 0; index < paths.length; index += 100) {
      const { error } = await database.storage
        .from(bucketId)
        .remove(paths.slice(index, index + 100));
      if (error) throw new Error(`${bucketId} removal failed: ${error.message}`);
    }
  }
}

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

  let deletedAccountMedia = 0;
  for (let batch = 0; batch < 5; batch += 1) {
    const { data, error } = await database.rpc('claim_account_deletion_cleanup', {
      p_limit: 100,
    });
    if (error) return new Response(error.message, { status: 500 });
    const claims = (data ?? []) as Array<{ user_id: string; claim_token: string }>;
    if (!claims.length) break;
    for (const claim of claims) {
      let cleanupError: string | null = null;
      try {
        await removeAccountMedia(database, claim.user_id);
        deletedAccountMedia += 1;
      } catch (claimError) {
        cleanupError = claimError instanceof Error ? claimError.message : 'Storage cleanup failed';
      }
      const { error: finishError } = await database.rpc(
        'finish_account_deletion_cleanup',
        {
          p_user_id: claim.user_id,
          p_claim_token: claim.claim_token,
          p_error: cleanupError,
        },
      );
      if (finishError) return new Response(finishError.message, { status: 500 });
    }
    if (claims.length < 100) break;
  }

  return Response.json({
    totals,
    orphaned_media: orphanedMedia,
    committed_media_intents: committedMediaIntents,
    stale_push_endpoints: stalePushEndpoints,
    expired_rate_limit_buckets: expiredRateLimitBuckets,
    deleted_post_media: deletedPostMedia,
    deleted_account_media: deletedAccountMedia,
    hasMore: hasMore || rateLimitHasMore,
  });
});
