/** Exact-object removal primitive. No scheduler, credentials, SQL writes or logging.
 * The durable coordinator must freeze the source against writes and serialize
 * decisions with this lease. A public row disappearing is NOT access revocation.
 */
export type MediaObject = { bucket: 'avatars' | 'post-media' | 'moderation-evidence'; path: string };
export type ObjectIdentity = { id: string; version: string; size: number; mime: string };
export type Digest = { sha256: string; size: number };
export type AccessProbe = { signedPath: string; expiresAt: string };
export type MediaPort = {
  assertPrivateEvidence(): Promise<void>;
  inspect(object: MediaObject): Promise<ObjectIdentity | null>;
  digest(object: MediaObject, maximum: number): Promise<Digest>;
  copy(source: MediaObject, destination: MediaObject): Promise<void>;
  remove(object: MediaObject): Promise<void>;
  prepareAccessProbe(object: MediaObject): Promise<AccessProbe>;
  verifyAccessProbe(object: MediaObject, probe: AccessProbe): Promise<void>;
};
export type RemovalJob = {
  id: string;
  source: MediaObject;
  evidence: MediaObject;
  original: ObjectIdentity;
  // Stored BEFORE deletion; a replay never infers that missing source means success.
  archived: (Digest & { evidenceIdentity: ObjectIdentity }) | null;
};
export type RemovalControl = {
  assertLease(): Promise<void>;
  saveArchive(proof: NonNullable<RemovalJob['archived']>): Promise<void>;
  // Persists origin deletion only. CDN convergence is a separate, later check.
  saveOriginRemoval(): Promise<void>;
};
export class MediaFailure extends Error {
  constructor(readonly code: string) { super(code); this.name = 'MediaFailure'; }
}
const sameIdentity = (a: ObjectIdentity, b: ObjectIdentity) =>
  a.id === b.id && a.version === b.version && a.size === b.size && a.mime === b.mime;
const sameDigest = (a: Digest, b: Digest) => a.sha256 === b.sha256 && a.size === b.size;
export function validateMediaJob(job: RemovalJob): number {
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  const safe = (path: string) => typeof path === 'string' && path.length <= 1024 &&
    /^[a-zA-Z0-9_./-]+$/.test(path) && !/(^|\/)(\.|\.\.)?(\/|$)/.test(path);
  if (!uuid.test(job.id) || !['avatars', 'post-media'].includes(job.source.bucket) ||
      job.evidence.bucket !== 'moderation-evidence' || !safe(job.source.path) ||
      job.evidence.path !== `${job.id}/original` || !uuid.test(job.original.id) ||
      !job.original.version || !Number.isSafeInteger(job.original.size) || job.original.size <= 0) {
    throw new MediaFailure('invalid_job');
  }
  const maximum = job.source.bucket === 'avatars' ? 5 * 1024 * 1024 : 100 * 1024 * 1024;
  if (job.original.size > maximum) throw new MediaFailure('object_too_large');
  if (job.archived && (!/^[a-f0-9]{64}$/.test(job.archived.sha256) ||
      job.archived.size !== job.original.size)) throw new MediaFailure('invalid_archive_proof');
  return maximum;
}

/** Copy without overwrite, verify bytes, persist proof, then delete via Storage API.
 * Callers may retry the entire operation after every ambiguous network outcome.
 * No response body, private path, signed URL, or underlying provider error is logged.
 */
export async function removeModeratedObject(job: RemovalJob, port: MediaPort, control: RemovalControl): Promise<void> {
  const maximum = validateMediaJob(job);
  await control.assertLease();
  await port.assertPrivateEvidence();
  let source = await port.inspect(job.source);
  if (source && !sameIdentity(source, job.original)) throw new MediaFailure('source_changed');
  let proof = job.archived;
  if (!proof) {
    if (!source) throw new MediaFailure('source_missing_before_archive');
    const originalDigest = await port.digest(job.source, maximum);
    if (originalDigest.size !== job.original.size) throw new MediaFailure('source_changed');
    await control.assertLease();
    if (!await port.inspect(job.evidence)) {
      // A timed-out copy may have succeeded. On the next run inspect and verify it.
      await port.copy(job.source, job.evidence);
    }
    const evidenceIdentity = await port.inspect(job.evidence);
    if (!evidenceIdentity || evidenceIdentity.size !== job.original.size ||
        evidenceIdentity.mime !== job.original.mime) throw new MediaFailure('archive_metadata_mismatch');
    const evidenceDigest = await port.digest(job.evidence, maximum);
    if (!sameDigest(originalDigest, evidenceDigest)) throw new MediaFailure('archive_bytes_mismatch');
    source = await port.inspect(job.source);
    if (!source || !sameIdentity(source, job.original)) throw new MediaFailure('source_changed');
    proof = { ...evidenceDigest, evidenceIdentity };
    await control.assertLease();
    await control.saveArchive(proof);
  } else {
    const evidenceIdentity = await port.inspect(job.evidence);
    if (!evidenceIdentity || !sameIdentity(evidenceIdentity, proof.evidenceIdentity)) {
      throw new MediaFailure('archive_changed');
    }
    // A persisted proof is not permission to trust missing or corrupted evidence.
    if (!sameDigest(await port.digest(job.evidence, maximum), proof)) throw new MediaFailure('archive_bytes_mismatch');
  }
  await control.assertLease();
  source = await port.inspect(job.source);
  if (source && !sameIdentity(source, job.original)) throw new MediaFailure('source_changed');
  if (source) await port.remove(job.source);
  if (await port.inspect(job.source)) throw new MediaFailure('source_still_present');
  await control.assertLease();
  await control.saveOriginRemoval();
}

/** Restoration is copy-only. Never overwrites another object and never erases
 * evidence. Linking it back to a member remains a separate fenced atomic command.
 */
export async function restoreModeratedObject(job: RemovalJob, destination: MediaObject,
  port: MediaPort, assertAuthorized: () => Promise<void>): Promise<ObjectIdentity> {
  const maximum = validateMediaJob(job);
  if (destination.bucket !== job.source.bucket || destination.path !== job.source.path) {
    throw new MediaFailure('invalid_restore');
  }
  await assertAuthorized();
  if (!job.archived) {
    // Reversal can precede the first removal attempt. Do not require a copy of an
    // untouched source, but never infer success from absence or a changed identity.
    const untouched = await port.inspect(destination);
    if (!untouched || !sameIdentity(untouched, job.original)) throw new MediaFailure('restore_conflict');
    await assertAuthorized();
    return untouched;
  }
  await port.assertPrivateEvidence();
  const evidence = await port.inspect(job.evidence);
  if (!evidence || !sameIdentity(evidence, job.archived.evidenceIdentity) ||
      !sameDigest(await port.digest(job.evidence, maximum), job.archived)) throw new MediaFailure('archive_changed');
  let restored = await port.inspect(destination);
  if (!restored) {
    await assertAuthorized();
    await port.copy(job.evidence, destination);
    restored = await port.inspect(destination);
  }
  if (!restored || restored.size !== job.original.size || restored.mime !== job.original.mime ||
      !sameDigest(await port.digest(destination, maximum), job.archived)) throw new MediaFailure('restore_conflict');
  await assertAuthorized();
  return restored;
}
