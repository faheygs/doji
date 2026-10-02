import { sha256 } from 'npm:@noble/hashes@1.8.0/sha256';
import { employeeServiceHeaders } from './employee-service-headers.ts';
import { MediaFailure, type AccessProbe, type MediaObject, type MediaPort } from './moderation-media.ts';

/** Service-only Storage API adapter. Never changes storage.objects through SQL.
 * Streaming hashes bound memory even for 100 MiB videos. No public URL is fetched.
 */
export function moderationStorage(baseUrl: string, serviceKey: string, upstream: typeof fetch = fetch): MediaPort {
  const base = new URL(baseUrl);
  if (base.pathname !== '/' || base.search || base.hash || base.username || base.password ||
      (base.protocol !== 'https:' && !(base.protocol === 'http:' && base.hostname === '127.0.0.1'))) {
    throw new MediaFailure('invalid_storage_origin');
  }
  const headers = employeeServiceHeaders(serviceKey);
  const objectPath = (object: MediaObject) => {
    if (!['avatars','post-media','moderation-evidence'].includes(object.bucket) ||
        !/^[a-zA-Z0-9_./-]{1,1024}$/.test(object.path) || /(^|\/)(\.|\.\.)?(\/|$)/.test(object.path)) {
      throw new MediaFailure('invalid_storage_path');
    }
    return `${object.bucket}/${object.path.split('/').map(encodeURIComponent).join('/')}`;
  };
  const call = async (path: string, init: RequestInit = {}) => {
    try {
      return await upstream(`${base.origin}/storage/v1/${path}`, {
        ...init, headers, redirect: 'error', signal: AbortSignal.timeout(20000),
      });
    } catch { throw new MediaFailure('storage_unavailable'); }
  };
  const requireSuccess = async (response: Response) => {
    if (!response.ok) { await response.body?.cancel(); throw new MediaFailure('storage_request_failed'); }
  };
  const probePath = (object: MediaObject, probe: AccessProbe) => {
    const prefix = `/object/sign/${objectPath(object)}?token=`;
    if (object.bucket === 'moderation-evidence' || typeof probe?.signedPath !== 'string' ||
        !probe.signedPath.startsWith(prefix) || probe.signedPath.length > 8192 ||
        !/^[A-Za-z0-9_.-]+$/.test(probe.signedPath.slice(prefix.length)) ||
        !Number.isFinite(Date.parse(probe.expiresAt))) throw new MediaFailure('invalid_access_probe');
    if (Date.parse(probe.expiresAt) <= Date.now() + 60000) throw new MediaFailure('access_probe_expired');
    return `${base.origin}/storage/v1${probe.signedPath}`;
  };
  const observe = async (url: string, expectAbsent: boolean) => {
    let response: Response;
    try {
      // No service credentials, redirect following, cache-busting or cache bypass:
      // this observes the same old client URL, with a bounded body even if cached.
      response = await upstream(url, {headers:{range:'bytes=0-0'},redirect:'error',signal:AbortSignal.timeout(8000)});
    } catch { throw new MediaFailure('storage_unavailable'); }
    if (!expectAbsent) {
      await response.body?.cancel();
      if (!response.ok) throw new MediaFailure('access_probe_unavailable');
      return;
    }
    if (![400,404].includes(response.status)) {
      await response.body?.cancel(); throw new MediaFailure('access_not_revoked');
    }
    // A proxy's 404, expired JWT, forbidden request or missing bucket is not proof.
    const reader = response.body?.getReader(); let size = 0; const chunks: Uint8Array[] = [];
    if (!reader) throw new MediaFailure('access_not_revoked');
    try {
      while (true) { const {value,done} = await reader.read(); if (done) break;
        size += value.byteLength; if (size > 4096) throw new MediaFailure('access_not_revoked'); chunks.push(value); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
      let body; try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new MediaFailure('access_not_revoked'); }
      if (body?.code !== 'NoSuchKey' && !(body?.error === 'not_found' && String(body?.statusCode) === '404' &&
          /object not found/i.test(body?.message ?? ''))) throw new MediaFailure('access_not_revoked');
    } finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
  };
  return {
    async prepareAccessProbe(object) {
      if (object.bucket === 'moderation-evidence') throw new MediaFailure('invalid_access_probe');
      const expiresAt = new Date(Date.now() + 86400000).toISOString();
      const response = await call(`object/sign/${objectPath(object)}`,{method:'POST',body:JSON.stringify({expiresIn:86400})});
      await requireSuccess(response); const body = await response.json();
      const probe = {signedPath:body.signedURL,expiresAt};
      await observe(probePath(object,probe),false);
      if (object.bucket === 'avatars') await observe(`${base.origin}/storage/v1/object/public/${objectPath(object)}`,false);
      return probe;
    },
    async verifyAccessProbe(object, probe) {
      await observe(probePath(object,probe),true);
      if (object.bucket === 'avatars') await observe(`${base.origin}/storage/v1/object/public/${objectPath(object)}`,true);
    },
    async assertPrivateEvidence() {
      const response = await call('bucket/moderation-evidence');
      const bucket = await response.json().catch(() => null);
      if (!response.ok || bucket?.id !== 'moderation-evidence' || bucket?.public !== false) {
        throw new MediaFailure('evidence_bucket_not_private');
      }
    },
    async inspect(object) {
      const response = await call(`object/info/authenticated/${objectPath(object)}`);
      const body = await response.json().catch(() => null);
      // Supabase versions may use HTTP 400 for NoSuchKey. Only that precise
      // Storage code is absence; 401/403/5xx or missing bucket are never absence.
      if ([400,404].includes(response.status) && body?.code === 'NoSuchKey') return null;
      if (!response.ok) throw new MediaFailure('storage_inspection_failed');
      if (body?.bucket_id !== object.bucket || body?.name !== object.path ||
          typeof body.id !== 'string' || typeof body.version !== 'string' ||
          !Number.isSafeInteger(body.size) || body.size <= 0 || typeof body.content_type !== 'string') {
        throw new MediaFailure('invalid_storage_metadata');
      }
      return { id: body.id, version: body.version, size: body.size, mime: body.content_type };
    },
    async digest(object, maximum) {
      if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 100 * 1024 * 1024) {
        throw new MediaFailure('invalid_read_bound');
      }
      const response = await call(`object/authenticated/${objectPath(object)}?cacheNonce=${crypto.randomUUID()}`);
      await requireSuccess(response);
      if (!response.body) throw new MediaFailure('empty_storage_body');
      const reader = response.body.getReader(), hash = sha256.create();
      let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maximum) throw new MediaFailure('object_too_large');
          hash.update(value);
        }
        const digest = Array.from(hash.digest(), byte => byte.toString(16).padStart(2,'0')).join('');
        return { sha256: digest, size };
      } catch (error) {
        await reader.cancel().catch(() => {});
        if (error instanceof MediaFailure) throw error;
        throw new MediaFailure('storage_read_interrupted');
      } finally { reader.releaseLock(); hash.destroy(); }
    },
    async copy(source, destination) {
      objectPath(source); objectPath(destination);
      if (source.bucket === 'moderation-evidence' ? destination.bucket === 'moderation-evidence'
          : destination.bucket !== 'moderation-evidence') throw new MediaFailure('invalid_copy_direction');
      const response = await call('object/copy', { method:'POST', body:JSON.stringify({
        bucketId:source.bucket, sourceKey:source.path,
        destinationBucket:destination.bucket, destinationKey:destination.path,
        // No x-upsert. Evidence and restored content must never overwrite anything.
      }) });
      await requireSuccess(response); await response.body?.cancel();
    },
    async remove(object) {
      objectPath(object);
      if (object.bucket === 'moderation-evidence') throw new MediaFailure('evidence_deletion_forbidden');
      const response = await call(`object/${object.bucket}`, {method:'DELETE',body:JSON.stringify({prefixes:[object.path]})});
      await requireSuccess(response); await response.body?.cancel();
    },
  };
}
