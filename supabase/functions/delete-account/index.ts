/// <reference path="../deno.d.ts" />
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createMediaCleanupClient, type MediaCleanupClient } from '../_shared/moderation-media-cleanup-client.ts';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function listObjectPaths(
  client: SupabaseClient,
  bucketId: string,
  folder: string,
): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await client.storage.from(bucketId).list(folder, {
      limit: 100,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw new Error(`${bucketId} list failed: ${error.message}`);
    if (!data?.length) break;

    for (const item of data) {
      const path = `${folder}/${item.name}`;
      if (item.id) paths.push(path);
      else paths.push(...(await listObjectPaths(client, bucketId, path)));
    }
    if (data.length < 100) break;
  }
  return paths;
}

async function removeUserStorage(client: SupabaseClient, userId: string, guarded?: MediaCleanupClient) {
  let deferred = false;
  for (const bucketId of ['avatars', 'post-media']) {
    if (guarded && !guarded.available()) throw new Error('Media cleanup deferred to durable recovery');
    const paths = await listObjectPaths(client, bucketId, userId);
    for (let index = 0; index < paths.length; index += 100) {
      if (guarded) {
        const result = await guarded.remove(bucketId, paths.slice(index, index + 100));
        deferred ||= result.deferred.length > 0;
        continue;
      }
      const { error } = await client.storage
        .from(bucketId)
        .remove(paths.slice(index, index + 100));
      if (error) throw new Error(`${bucketId} removal failed: ${error.message}`);
    }
  }
  if (deferred) throw new Error('Media cleanup deferred to durable recovery');
}

Deno.serve(async (request: Request) => {
  const requestId = crypto.randomUUID();
  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        ...JSON_HEADERS,
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    });
  }
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const authHeader = request.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json(401, { error: 'Missing auth token' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(500, { error: 'Account deletion is not configured' });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error: authError } = await userClient.auth.getUser();
  if (authError || !data.user) return json(401, { error: 'Invalid auth token' });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // Storage is not covered by auth.users cascades. Persist the cleanup intent
    // before removing the identity, so a Storage outage can never strand an
    // active account or permanently orphan its media.
    const { error: cleanupIntentError } = await admin
      .from('account_deletion_cleanup')
      .upsert({
        user_id: data.user.id,
        requested_at: new Date().toISOString(),
        retry_at: new Date().toISOString(),
        claim_token: null,
        claimed_at: null,
        last_error: null,
      }, { onConflict: 'user_id' });
    if (cleanupIntentError) {
      throw new Error(`Cleanup intent failed: ${cleanupIntentError.message}`);
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id, false);
    if (deleteError) throw new Error(`Identity deletion failed: ${deleteError.message}`);

    // Best effort keeps the common path immediate. Failure is deliberately not
    // surfaced to the deleted user; run-data-maintenance owns durable retries.
    try {
      const guarded = Deno.env.get('MODERATION_MEDIA_CLEANUP_ENABLED') === 'true'
        ? createMediaCleanupClient(supabaseUrl, serviceRoleKey, fetch, 8000, 4) : undefined;
      const storageClient = guarded ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: guarded.fetch },
      }) : admin;
      await removeUserStorage(storageClient, data.user.id, guarded);
      await admin.from('account_deletion_cleanup').delete().eq('user_id', data.user.id);
    } catch (cleanupError) {
      const cleanupMessage = cleanupError instanceof Error
        ? cleanupError.message
        : 'Storage cleanup failed';
      console.error('[delete-account-cleanup]', { userId: data.user.id, requestId, cleanupMessage });
      await admin
        .from('account_deletion_cleanup')
        .update({ last_error: cleanupMessage, retry_at: new Date().toISOString() })
        .eq('user_id', data.user.id);
    }
    return json(200, { ok: true, requestId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Account deletion failed';
    console.error('[delete-account]', { userId: data.user.id, requestId, message });
    return json(500, { error: 'Could not delete the account. Please try again.', requestId });
  }
});
