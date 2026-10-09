import { record, uuid } from '../../../../website/admin-portal/workflow-contracts.mts';
import type { createBusinessOwnership } from './business-claim';

export type EvidenceReference = Readonly<{
  slot: string;
  kind: 'image' | 'video';
  availability: string;
  bucket: string | null;
  path: string | null;
}>;
export function validEvidenceReference(bucket: unknown, path: unknown): boolean {
  return (
    typeof bucket === 'string' &&
    ['post-media', 'avatars', 'moderation-evidence'].includes(bucket) &&
    typeof path === 'string' &&
    path.length > 0 &&
    path.length <= 1024 &&
    !/[\x00-\x1f\x7f%?#\\]/.test(path) &&
    !path.split('/').some((part) => !part || part === '.' || part === '..') &&
    (bucket !== 'moderation-evidence' ||
      (path.endsWith('/original') && uuid(path.split('/')[0]) && path.split('/').length === 2))
  );
}
export function evidenceReferences(value: unknown): EvidenceReference[] {
  if (!Array.isArray(value) || value.length > 3) throw Error('Invalid evidence manifest.');
  return value.map((asset) => {
    if (
      !record(asset) ||
      !['image', 'video'].includes(String(asset.kind)) ||
      typeof asset.slot !== 'string' ||
      asset.slot.length > 80 ||
      typeof asset.availability !== 'string' ||
      asset.availability.length > 80
    )
      throw Error('Invalid evidence reference.');
    const available = asset.availability === 'available';
    if (available && !validEvidenceReference(asset.bucket, asset.path))
      throw Error('Invalid evidence reference.');
    return {
      slot: asset.slot,
      kind: asset.kind as 'image' | 'video',
      availability: asset.availability,
      bucket: available ? String(asset.bucket) : null,
      path: available ? String(asset.path) : null,
    };
  });
}
export function preservedReferences(value: unknown, decisionId: string) {
  if (value == null) return [];
  if (
    !record(value) ||
    value.source !== 'preserved_decision_media' ||
    value.decision_id !== decisionId ||
    value.historical_snapshot !== true
  )
    throw Error('Invalid preserved evidence.');
  const refs = evidenceReferences(value.items);
  if (refs.some((ref) => ref.bucket && ref.bucket !== 'moderation-evidence'))
    throw Error('Invalid preserved bucket.');
  return refs;
}
export function verifiedEvidenceUrl(value: unknown, ref: EvidenceReference) {
  if (typeof value !== 'string' || value.length > 8192) throw Error('Invalid evidence response.');
  const url = new URL(value);
  const expected =
    '/storage/v1/object/sign/' +
    ref.bucket +
    '/' +
    ref.path!.split('/').map(encodeURIComponent).join('/');
  // The existing server additionally enforces the configured project origin and exact object.
  if (
    !/^https:\/\/[a-z]{20}\.supabase\.co$/.test(url.origin) ||
    url.pathname !== expected ||
    url.username ||
    url.password ||
    url.hash ||
    !url.searchParams.get('token')
  )
    throw Error('Invalid evidence destination.');
  return url.href;
}
export function createEvidenceRead(options: Parameters<typeof createBusinessOwnership>[0]) {
  return async (ref: EvidenceReference, restricted: boolean, signal: AbortSignal) => {
    ref = Object.freeze({ ...ref });
    if (ref.availability !== 'available' || !validEvidenceReference(ref.bucket, ref.path))
      throw Error('Evidence is unavailable.');
    const captured = options.state();
    const current = () => {
      signal.throwIfAborted();
      const state = options.state();
      if (
        !captured.session ||
        state.phase !== 'ready' ||
        state.session !== captured.session ||
        !state.operator?.capabilities.moderation_read ||
        (restricted && !state.operator.capabilities.legal_read)
      )
        throw Error('Employee evidence permission required.');
      options.transport.assertSessionFresh();
    };
    current();
    const expiresAt = Date.now() + 270_000;
    const value = await options.transport
      .signEvidence(ref.bucket!, ref.path!)
      .catch(async (error: unknown) => {
        if (record(error) && error.status === 403 && options.state().session === captured.session)
          await options.restore();
        throw error;
      });
    current();
    if (Date.now() >= expiresAt) throw Error('Evidence authorization expired.');
    options.touch();
    return { url: verifiedEvidenceUrl(value, ref), expiresAt };
  };
}
