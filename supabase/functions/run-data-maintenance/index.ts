/// <reference path="../deno.d.ts" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createMediaCleanupClient, type MediaCleanupClient } from '../_shared/moderation-media-cleanup-client.ts';
import { cleanupQueued, MaintenanceProgress } from '../_shared/maintenance-progress.ts';
import { removeAccountMedia } from '../_shared/account-media-cleanup.ts';
import { observeWorkflow, schedulerLogRetention } from '../_shared/workflow-health.ts';
Deno.serve(async (request) => {
  const expectedSecret = Deno.env.get('OUTBOX_RELAY_SECRET');
  if (!expectedSecret || request.headers.get('x-outbox-secret') !== expectedSecret) {
    return new Response('Unauthorized', { status: 401 });
  }
  const database = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const rpc = (name: string, args: Record<string, unknown>) => database.rpc(name, args);
  return observeWorkflow('maintenance', rpc, async observation => {
    const totals: Record<string, number> = {};
    const progress = new MaintenanceProgress();
    const guardedEnabled = Deno.env.get('MODERATION_MEDIA_CLEANUP_ENABLED') === 'true';
    const cleanupQueue = () => guardedEnabled
      ? createMediaCleanupClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, fetch, 15000, 20) : undefined;
    let guarded: MediaCleanupClient | undefined;
    let hasMore = true;
    observation.phase = 'operational_retention';
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
    observation.phase = 'expired_media';
    guarded = cleanupQueue();
    for (let batch = 0; batch < 5; batch += 1) {
      if (guarded && !guarded.available()) { progress.defer(); observation.defer(); break; }
      const { data, error } = await database.rpc(guarded ? 'claim_media_cleanup_candidates_v1' : 'claim_expired_media_upload_intents', {
        ...(guarded ? { p_kind: 'expired' } : {}),
        p_limit: guarded ? 20 : 500,
      });
      if (error) return new Response(error.message, { status: 500 });
      const intents = (data ?? []) as Array<{
        id: string;
        bucket_id: string;
        object_path: string;
      }>;
      progress.page('expired-media', intents.length, guarded ? 20 : 500);
      if (!intents.length) break;
      const byBucket = new Map<string, typeof intents>();
      for (const intent of intents) {
        const entries = byBucket.get(intent.bucket_id) ?? [];
        entries.push(intent);
        byBucket.set(intent.bucket_id, entries);
      }
      const completedIds: string[] = [];
      for (const [bucketId, bucketIntents] of byBucket) {
        if (guarded) {
          try {
            const result = await guarded.remove(bucketId, bucketIntents.map(intent => intent.object_path));
            if (result.deferred.length) { progress.defer(); observation.defer(); }
            const completed = new Set(result.completed);
            completedIds.push(...bucketIntents.filter(intent => completed.has(intent.object_path)).map(intent => intent.id));
          } catch { progress.defer(); observation.defer(); totals.media_cleanup_deferred = (totals.media_cleanup_deferred ?? 0) + bucketIntents.length; }
          continue;
        }
        const { error: removeError } = await database.storage
          .from(bucketId)
          .remove(bucketIntents.map((intent) => intent.object_path));
        if (removeError) return new Response(removeError.message, { status: 500 });
      }
      const { data: deleted, error: deleteError } = await database.rpc(
        'delete_media_upload_intents',
        { p_ids: guarded ? completedIds : intents.map((intent) => intent.id) },
      );
      if (deleteError) return new Response(deleteError.message, { status: 500 });
      orphanedMedia += Number(deleted ?? 0);
      observation.count('orphaned_media', orphanedMedia);
      if (intents.length < (guarded ? 20 : 500)) break;
    }
    let committedMediaIntents = 0;
    observation.phase = 'committed_intents';
    for (let batch = 0; batch < 5; batch += 1) {
      const { data, error } = await database.rpc(
        'delete_stale_committed_media_upload_intents',
        { p_limit: 5000 },
      );
      if (error) return new Response(error.message, { status: 500 });
      const deleted = Number(data ?? 0);
      committedMediaIntents += deleted;
      observation.count('committed_media_intents', committedMediaIntents);
      progress.page('committed-intents', deleted, 5000);
      if (deleted < 5000) break;
    }
    let stalePushEndpoints = 0;
    observation.phase = 'push_endpoints';
    for (let batch = 0; batch < 5; batch += 1) {
      const { data, error } = await database.rpc('delete_stale_push_endpoints', {
        p_limit: 5000,
      });
      if (error) return new Response(error.message, { status: 500 });
      const deleted = Number(data ?? 0);
      stalePushEndpoints += deleted;
      observation.count('stale_push_endpoints', stalePushEndpoints);
      progress.page('push-endpoints', deleted, 5000);
      if (deleted < 5000) break;
    }
    let expiredRateLimitBuckets = 0;
    observation.phase = 'rate_limits';
    let rateLimitHasMore = false;
    for (let batch = 0; batch < 5; batch += 1) {
      const { data, error } = await database.rpc(
        'delete_expired_api_rate_limit_buckets',
        { p_limit: 5000 },
      );
      if (error) return new Response(error.message, { status: 500 });
      const deleted = Number(data ?? 0);
      expiredRateLimitBuckets += deleted;
      observation.count('expired_rate_limit_buckets', expiredRateLimitBuckets);
      rateLimitHasMore = deleted >= 5000;
      if (!rateLimitHasMore) break;
    }
    let deletedPostMedia = 0;
    observation.phase = 'post_media';
    guarded = cleanupQueue();
    for (let batch = 0; batch < 5; batch += 1) {
      if (guarded && !guarded.available()) { progress.defer(); observation.defer(); break; }
      const { data, error } = await database.rpc(guarded ? 'claim_media_cleanup_candidates_v1' : 'claim_pending_media_deletions', {
        ...(guarded ? { p_kind: 'pending' } : {}),
        p_limit: guarded ? 20 : 500,
      });
      if (error) return new Response(error.message, { status: 500 });
      const pending = (data ?? []) as Array<{
        id: string;
        bucket_id: string;
        object_path: string;
      }>;
      progress.page('post-media', pending.length, guarded ? 20 : 500);
      if (!pending.length) break;
      const byBucket = new Map<string, typeof pending>();
      for (const item of pending) {
        const entries = byBucket.get(item.bucket_id) ?? [];
        entries.push(item);
        byBucket.set(item.bucket_id, entries);
      }
      const completedIds: string[] = [];
      for (const [bucketId, entries] of byBucket) {
        if (guarded) {
          try {
            const result = await guarded.remove(bucketId, entries.map(item => item.object_path));
            if (result.deferred.length) { progress.defer(); observation.defer(); }
            const completed = new Set(result.completed);
            completedIds.push(...entries.filter(item => completed.has(item.object_path)).map(item => item.id));
          } catch { progress.defer(); observation.defer(); totals.media_cleanup_deferred = (totals.media_cleanup_deferred ?? 0) + entries.length; }
          continue;
        }
        const { error: removeError } = await database.storage
          .from(bucketId)
          .remove(entries.map((item) => item.object_path));
        if (removeError) return new Response(removeError.message, { status: 500 });
      }
      const { data: deleted, error: deleteError } = await database.rpc(
        'delete_pending_media_deletions',
        { p_ids: guarded ? completedIds : pending.map((item) => item.id) },
      );
      if (deleteError) return new Response(deleteError.message, { status: 500 });
      deletedPostMedia += Number(deleted ?? 0);
      observation.count('deleted_post_media', deletedPostMedia);
      if (pending.length < (guarded ? 20 : 500)) break;
    }
    let deletedAccountMedia = 0;
    observation.phase = 'account_media';
    guarded = cleanupQueue();
    const accountStorage = guarded ? createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: guarded.fetch },
    }) : database;
    for (let batch = 0; batch < 5; batch += 1) {
      if (guarded && !guarded.available()) { progress.defer(); observation.defer(); break; }
      const { data, error } = await database.rpc('claim_account_deletion_cleanup', {
        p_limit: guarded ? 4 : 100,
      });
      if (error) return new Response(error.message, { status: 500 });
      const claims = (data ?? []) as Array<{ user_id: string; claim_token: string }>;
      progress.page('account-media', claims.length, guarded ? 4 : 100);
      if (!claims.length) break;
      for (const claim of claims) {
        let cleanupError: string | null = null;
        try {
          await removeAccountMedia(accountStorage, claim.user_id, guarded);
          deletedAccountMedia += 1;
        } catch (claimError) {
          progress.defer(); observation.defer();
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
        observation.count('deleted_account_media', deletedAccountMedia);
      }
      if (claims.length < (guarded ? 4 : 100)) break;
    }
    observation.phase = 'queue_check';
    if (!progress.result(hasMore || rateLimitHasMore).hasMore && await cleanupQueued(database)) { progress.defer(); observation.defer(); }
    const schedulerHasMore = await schedulerLogRetention(rpc, observation);
    observation.deferred = progress.result(hasMore || rateLimitHasMore || schedulerHasMore).hasMore;
    observation.phase = 'complete';
    return Response.json({
      totals,
      orphaned_media: orphanedMedia,
      committed_media_intents: committedMediaIntents,
      stale_push_endpoints: stalePushEndpoints,
      expired_rate_limit_buckets: expiredRateLimitBuckets,
      deleted_post_media: deletedPostMedia,
      deleted_account_media: deletedAccountMedia,
      ...progress.result(hasMore || rateLimitHasMore || schedulerHasMore),
    });
  });
});
