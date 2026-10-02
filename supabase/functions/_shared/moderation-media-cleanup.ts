import { type MediaPort, type ObjectIdentity } from './moderation-media.ts';

export type CleanupRpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
type Claim = { path: string; state: 'complete' | 'claimed'; lease_id?: string; original?: ObjectIdentity | null };
const sameIdentity = (a: ObjectIdentity, b: ObjectIdentity) =>
 a.id === b.id && a.version === b.version && a.size === b.size && a.mime === b.mime;

/** Never receives the evidence bucket. A failed/partial batch must not acknowledge
 * the caller's existing durable cleanup work. No retries or additional scheduler.
 * Production callers remain on the old path until the separately gated release.
 */
export async function guardedMediaCleanup(bucket: string, paths: string[], rpc: CleanupRpc,
 port: Pick<MediaPort, 'inspect' | 'remove'>): Promise<{ completed: string[]; deferred: string[] }> {
 if (!['avatars','post-media'].includes(bucket) || paths.length < 1 || paths.length > 100 ||
  paths.some(path => !/^[a-zA-Z0-9_./-]{1,1024}$/.test(path) || /(^|\/)(\.|\.\.)?(\/|$)/.test(path))) {
  throw new Error('Invalid cleanup batch');
 }
 const requested = new Set(paths), completed: string[] = [];
 const claims = await rpc('claim_media_cleanup_v1',{ p_bucket: bucket, p_paths: [...requested] });
 if (!Array.isArray(claims) || claims.length > requested.size) throw new Error('Invalid cleanup claim');
 const seen = new Set<string>();
 // Validate the entire response before doing any deletion.
 for (const claim of claims as Claim[]) {
  if (!claim || !requested.has(claim.path) || seen.has(claim.path) || !['complete','claimed'].includes(claim.state) ||
   (claim.state === 'claimed' && (!/^[a-f0-9-]{36}$/.test(claim.lease_id || '') || claim.original === undefined))) {
   throw new Error('Invalid cleanup claim');
  }
  seen.add(claim.path);
 }
 for (const claim of claims as Claim[]) {
  const object = { bucket: bucket as 'avatars' | 'post-media', path: claim.path };
  if (claim.state === 'complete') {
   if (await port.inspect(object)) throw new Error('Cleanup identity changed');
   completed.push(claim.path); continue;
  }
  const args = { p_bucket: bucket, p_path: claim.path, p_lease: claim.lease_id };
  const authorize = async () => {
   if (await rpc('check_media_cleanup_lease_v1',args) !== true) throw new Error('Cleanup lease expired');
  };
  await authorize();
  const current = await port.inspect(object);
  if (current && (!claim.original || !sameIdentity(current,claim.original))) throw new Error('Cleanup identity changed');
  await authorize();
  if (current) await port.remove(object);
  if (await port.inspect(object)) throw new Error('Cleanup object remains');
  await authorize();
  if (await rpc('finish_media_cleanup_v1',args) !== true) throw new Error('Cleanup completion unconfirmed');
  completed.push(claim.path);
 }
 const done = new Set(completed);
 return { completed, deferred: [...requested].filter(path => !done.has(path)) };
}
