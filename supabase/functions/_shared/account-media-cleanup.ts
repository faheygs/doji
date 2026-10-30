import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { MediaCleanupClient } from './moderation-media-cleanup-client.ts';
async function listObjectPaths(
  database: SupabaseClient,
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
export async function removeAccountMedia(
  database: SupabaseClient,
  userId: string,
  guarded?: MediaCleanupClient,
) {
  let deferred = false;
  for (const bucketId of ['avatars', 'post-media']) {
    if (guarded && !guarded.available()) throw new Error('Media cleanup deferred to durable recovery');
    const paths = await listObjectPaths(database, bucketId, userId);
    for (let index = 0; index < paths.length; index += 100) {
      if (guarded) {
        const result = await guarded.remove(bucketId, paths.slice(index, index + 100));
        deferred ||= result.deferred.length > 0;
        continue;
      }
      const { error } = await database.storage
        .from(bucketId)
        .remove(paths.slice(index, index + 100));
      if (error) throw new Error(`${bucketId} removal failed: ${error.message}`);
    }
  }
  if (deferred) throw new Error('Media cleanup deferred to durable recovery');
}
