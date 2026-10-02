import { employeeServiceHeaders } from './employee-service-headers.ts';
import { MediaFailure, removeModeratedObject, restoreModeratedObject, validateMediaJob, type AccessProbe, type MediaPort, type RemovalJob } from './moderation-media.ts';
import { moderationStorage } from './moderation-media-storage.ts';
type Env = { enabled: boolean; secret: string; supabaseUrl: string; serviceKey: string };
type ClaimedJob = RemovalJob & { lease_id: string; revision: number; operation?: 'remove' | 'restore' | 'cancel_restore' | 'verify'; access_probe?: AccessProbe };

// Preparation-only handler: deliberately no deployed Deno.serve entry point or
// scheduler until decision, appeal, cleanup and hosted CDN gates are qualified.
export async function moderationMediaDispatch(request: Request, env: Env,
  upstream: typeof fetch = fetch, storage?: MediaPort): Promise<Response> {
  const reply = (status: number, value: object) => Response.json(value,{status,headers:{'cache-control':'no-store'}});
  if (!env.enabled) return reply(503,{message:'Media dispatcher disabled'});
  if (!env.secret || request.headers.get('authorization') !== `Bearer ${env.secret}`) return reply(401,{message:'Unauthorized'});
  if (request.method !== 'POST') return reply(405,{message:'POST required'});
  if (!env.serviceKey || !env.supabaseUrl) return reply(503,{message:'Media dispatcher unavailable'});
  let job: ClaimedJob | null = null;
  const rpc = async (name: string,args: object) => {
    const response = await upstream(`${env.supabaseUrl.replace(/\/$/,'')}/rest/v1/rpc/${name}`,{
      method:'POST',headers:employeeServiceHeaders(env.serviceKey),body:JSON.stringify(args),
      redirect:'error',signal:AbortSignal.timeout(8000),
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error('Database unavailable'); }
    return response.json();
  };
  try {
    job = await rpc('claim_moderation_media_v1',{});
    if (!job) return reply(200,{claimed:0});
    if (!/^[a-f0-9-]{36}$/.test(job.lease_id) || !Number.isSafeInteger(job.revision) || job.revision < 1) {
      throw new MediaFailure('invalid_job');
    }
    const args = {p_id:job.id,p_lease:job.lease_id,p_revision:job.revision};
    const requireAcknowledgement = async (name: string,extra: object = {}) => {
      if (await rpc(name,{...args,...extra}) !== true) throw new Error('Lease no longer current');
    };
    const port = storage ?? moderationStorage(env.supabaseUrl,env.serviceKey,upstream);
    validateMediaJob(job);
    if (job.operation === 'cancel_restore') {
      const present = await port.inspect(job.source);
      if (present) {
        if (job.archived) {
          await port.assertPrivateEvidence();
          const digest = await port.digest(job.source,validateMediaJob(job));
          if (digest.sha256 !== job.archived.sha256 || digest.size !== job.archived.size) throw new MediaFailure('restore_conflict');
        } else if (present.id !== job.original.id || present.version !== job.original.version ||
            present.size !== job.original.size || present.mime !== job.original.mime) throw new MediaFailure('restore_conflict');
      }
      await requireAcknowledgement('finish_cancelled_media_restore_v1',{p_identity:present});
      return reply(200,{claimed:1,state:'restoration_cancelled'});
    }
    if (job.operation === 'verify') {
      if (!job.archived || !job.access_probe) throw new MediaFailure('invalid_access_probe');
      await requireAcknowledgement('check_moderation_media_lease_v1');
      await port.assertPrivateEvidence();
      const archive = await port.inspect(job.evidence);
      const expected = job.archived.evidenceIdentity;
      if (!archive || archive.id !== expected.id || archive.version !== expected.version ||
          archive.size !== expected.size || archive.mime !== expected.mime) throw new MediaFailure('archive_changed');
      if (await port.inspect(job.source)) throw new MediaFailure('source_still_present');
      await port.verifyAccessProbe(job.source,job.access_probe);
      await requireAcknowledgement('finish_moderation_media_revocation_v1');
      return reply(200,{claimed:1,state:'revoked',revocation_verified:true});
    }
    if (job.operation === 'restore') {
      const identity = await restoreModeratedObject(job,job.source,port,()=>requireAcknowledgement('check_moderation_media_lease_v1'));
      await requireAcknowledgement('finish_moderation_media_restore_v1',{p_identity:identity});
      return reply(200,{claimed:1,state:'restored'});
    }
    if (job.operation !== undefined && job.operation !== 'remove') throw new MediaFailure('invalid_job');
    if (!job.access_probe) {
      await requireAcknowledgement('check_moderation_media_lease_v1');
      job.access_probe = await port.prepareAccessProbe(job.source);
      await requireAcknowledgement('save_moderation_media_probe_v1',{p_probe:job.access_probe});
    }
    await removeModeratedObject(job,port,{
      assertLease:()=>requireAcknowledgement('check_moderation_media_lease_v1'),
      saveArchive:proof=>requireAcknowledgement('save_moderation_media_archive_v1',{p_proof:proof}),
      saveOriginRemoval:()=>requireAcknowledgement('finish_moderation_media_origin_v1'),
    });
    return reply(200,{claimed:1,state:'origin_removed',revocation_verified:false});
  } catch (error) {
    if (job) {
      const allowed = new Set(['storage_unavailable','storage_request_failed','storage_inspection_failed','storage_read_interrupted',
        'source_changed','source_missing_before_archive','archive_metadata_mismatch','archive_bytes_mismatch','archive_changed',
        'source_still_present','invalid_storage_metadata','invalid_job','invalid_archive_proof','object_too_large','evidence_bucket_not_private','invalid_restore','restore_conflict',
        'invalid_access_probe','access_probe_expired','access_probe_unavailable','access_not_revoked']);
      const code = error instanceof MediaFailure && allowed.has(error.code) ? error.code : 'unknown';
      const terminal = !['unknown','storage_unavailable','storage_request_failed','storage_inspection_failed','storage_read_interrupted','source_still_present','access_probe_unavailable','access_not_revoked'].includes(code);
      try { await rpc('fail_moderation_media_v1',{p_id:job.id,p_lease:job.lease_id,p_revision:job.revision,p_code:code,p_terminal:terminal}); }
      catch { /* Durable lease expires; no unverified success and no private error logs. */ }
    }
    return reply(503,{message:'Media operation incomplete; durable recovery or staff review required'});
  }
}
