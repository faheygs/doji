import {
  removeModeratedObject,
  restoreModeratedObject,
  validateMediaJob,
  type RemovalJob,
  type MediaPort,
  type ObjectIdentity,
  type Digest,
} from '../../supabase/functions/_shared/moderation-media';
import { guardedMediaCleanup } from '../../supabase/functions/_shared/moderation-media-cleanup';

const id = '11111111-1111-4111-8111-111111111111';
const original: ObjectIdentity = { id, version: 'one', size: 4, mime: 'image/png' };
const evidence = { ...original, version: 'archive' };
const digest: Digest = { sha256: 'a'.repeat(64), size: 4 };
const job = (archived = false): RemovalJob => ({
  id,
  source: { bucket: 'avatars', path: 'member/photo.png' },
  evidence: { bucket: 'moderation-evidence', path: `${id}/original` },
  original: { ...original },
  archived: archived ? { ...digest, evidenceIdentity: evidence } : null,
});
function setup(archived = false) {
  const task = job(archived);
  const objects = new Map<string, ObjectIdentity>([[task.source.path, original]]);
  if (archived) objects.set(task.evidence.path, evidence);
  const events: string[] = [];
  const port = {
    assertPrivateEvidence: jest.fn(async () => {
      events.push('private');
    }),
    inspect: jest.fn(async (o: { path: string }) => objects.get(o.path) ?? null),
    digest: jest.fn(async () => ({ ...digest })),
    copy: jest.fn(async (_s: unknown, d: { path: string }) => {
      events.push('copy');
      objects.set(d.path, evidence);
    }),
    remove: jest.fn(async (o: { path: string }) => {
      events.push('remove');
      objects.delete(o.path);
    }),
    prepareAccessProbe: jest.fn(),
    verifyAccessProbe: jest.fn(),
  } satisfies MediaPort;
  const control = {
    assertLease: jest.fn(async () => {
      events.push('lease');
    }),
    saveArchive: jest.fn(async () => {
      events.push('archive');
    }),
    saveOriginRemoval: jest.fn(async () => {
      events.push('origin');
    }),
  };
  return { task, objects, events, port, control };
}

describe('exact-object archive, removal and restoration execution', () => {
  test.each(['avatars', 'post-media'] as const)('validates %s size boundaries', (bucket) => {
    const t = job();
    t.source.bucket = bucket;
    const max = bucket === 'avatars' ? 5 * 1024 ** 2 : 100 * 1024 ** 2;
    t.original.size = max;
    expect(validateMediaJob(t)).toBe(max);
    t.original.size++;
    expect(() => validateMediaJob(t)).toThrow('object_too_large');
  });
  test.each([
    [
      'id',
      (t: RemovalJob) => {
        t.id = 'wrong';
      },
    ],
    [
      'source bucket',
      (t: RemovalJob) => {
        t.source.bucket = 'moderation-evidence';
      },
    ],
    [
      'evidence bucket',
      (t: RemovalJob) => {
        t.evidence.bucket = 'avatars';
      },
    ],
    [
      'evidence path',
      (t: RemovalJob) => {
        t.evidence.path = 'another/original';
      },
    ],
    [
      'original id',
      (t: RemovalJob) => {
        t.original.id = 'bad';
      },
    ],
    [
      'version',
      (t: RemovalJob) => {
        t.original.version = '';
      },
    ],
    [
      'zero',
      (t: RemovalJob) => {
        t.original.size = 0;
      },
    ],
    [
      'fraction',
      (t: RemovalJob) => {
        t.original.size = 1.5;
      },
    ],
  ])('rejects invalid %s before side effects', async (_label, change) => {
    const s = setup();
    (change as (t: RemovalJob) => void)(s.task);
    await expect(removeModeratedObject(s.task, s.port, s.control)).rejects.toThrow('invalid_job');
    expect(s.port.inspect).not.toHaveBeenCalled();
  });
  test.each([
    '',
    '/x',
    'x/',
    'x//y',
    '../x',
    'x/../y',
    './x',
    'x?token=secret',
    'x'.repeat(1025),
    null,
  ])('rejects unsafe source path %s', (path) => {
    const t = job();
    t.source.path = path as string;
    expect(() => validateMediaJob(t)).toThrow('invalid_job');
  });
  test.each([{ sha256: 'bad' }, { size: 3 }])('rejects malformed archive proof %j', (patch) => {
    const t = job(true);
    t.archived = { ...t.archived!, ...patch };
    expect(() => validateMediaJob(t)).toThrow('invalid_archive_proof');
  });
  test('persists byte-verified archive before deleting and acknowledges only confirmed absence', async () => {
    const s = setup();
    await removeModeratedObject(s.task, s.port, s.control);
    expect(s.events).toEqual([
      'lease',
      'private',
      'lease',
      'copy',
      'lease',
      'archive',
      'lease',
      'remove',
      'lease',
      'origin',
    ]);
    expect(s.control.saveArchive).toHaveBeenCalledWith({ ...digest, evidenceIdentity: evidence });
    expect(s.objects.has(s.task.evidence.path)).toBe(true);
    expect(s.objects.has(s.task.source.path)).toBe(false);
  });
  test('recovers an ambiguous successful copy without overwriting it', async () => {
    const s = setup();
    s.objects.set(s.task.evidence.path, evidence);
    await removeModeratedObject(s.task, s.port, s.control);
    expect(s.port.copy).not.toHaveBeenCalled();
    expect(s.control.saveArchive).toHaveBeenCalledTimes(1);
  });
  test.each([true, false])(
    'verified archive supports replay with source present=%s',
    async (present) => {
      const s = setup(true);
      if (!present) s.objects.delete(s.task.source.path);
      await removeModeratedObject(s.task, s.port, s.control);
      expect(s.port.remove).toHaveBeenCalledTimes(present ? 1 : 0);
      expect(s.control.saveArchive).not.toHaveBeenCalled();
      expect(s.control.saveOriginRemoval).toHaveBeenCalledTimes(1);
    },
  );
  test('missing source without archive is never success', async () => {
    const s = setup();
    s.objects.clear();
    await expect(removeModeratedObject(s.task, s.port, s.control)).rejects.toThrow(
      'source_missing_before_archive',
    );
    expect(s.control.saveOriginRemoval).not.toHaveBeenCalled();
  });
  test.each([{ id: 'other' }, { version: 'two' }, { size: 5 }, { mime: 'video/mp4' }])(
    'fences replacement identity %j',
    async (patch) => {
      const s = setup();
      s.objects.set(s.task.source.path, { ...original, ...patch });
      await expect(removeModeratedObject(s.task, s.port, s.control)).rejects.toThrow(
        'source_changed',
      );
      expect(s.port.remove).not.toHaveBeenCalled();
    },
  );
  test.each([null, { ...evidence, size: 5 }, { ...evidence, mime: 'other' }])(
    'requires complete archive metadata %j',
    async (identity) => {
      const s = setup();
      s.port.copy.mockImplementation(async () => {
        if (identity) s.objects.set(s.task.evidence.path, identity);
      });
      await expect(removeModeratedObject(s.task, s.port, s.control)).rejects.toThrow(
        'archive_metadata_mismatch',
      );
      expect(s.port.remove).not.toHaveBeenCalled();
    },
  );
  test.each([{ sha256: 'b'.repeat(64) }, { size: 3 }])(
    'checks both archive hash and size %j',
    async (patch) => {
      const s = setup();
      s.port.digest.mockResolvedValueOnce(digest).mockResolvedValueOnce({ ...digest, ...patch });
      await expect(removeModeratedObject(s.task, s.port, s.control)).rejects.toThrow(
        'archive_bytes_mismatch',
      );
      expect(s.port.remove).not.toHaveBeenCalled();
    },
  );
  test('detects original streamed length change', async () => {
    const s = setup();
    s.port.digest.mockResolvedValue({ ...digest, size: 9 });
    await expect(removeModeratedObject(s.task, s.port, s.control)).rejects.toThrow(
      'source_changed',
    );
  });
  test.each([null, { ...original, version: 'replacement' }])(
    'rechecks source after copy %j',
    async (replacement) => {
      const s = setup();
      s.port.copy.mockImplementation(async (_src, dest) => {
        s.objects.set(dest.path, evidence);
        if (replacement) s.objects.set(s.task.source.path, replacement);
        else s.objects.delete(s.task.source.path);
      });
      await expect(removeModeratedObject(s.task, s.port, s.control)).rejects.toThrow(
        'source_changed',
      );
      expect(s.control.saveArchive).not.toHaveBeenCalled();
    },
  );
  test('rechecks source after persisted proof', async () => {
    const s = setup();
    s.control.saveArchive.mockImplementation(async () => {
      s.objects.set(s.task.source.path, { ...original, version: 'new' });
    });
    await expect(removeModeratedObject(s.task, s.port, s.control)).rejects.toThrow(
      'source_changed',
    );
    expect(s.port.remove).not.toHaveBeenCalled();
  });
  test.each([
    null,
    { ...evidence, id: 'other' },
    { ...evidence, version: 'other' },
    { ...evidence, size: 5 },
    { ...evidence, mime: 'other' },
  ])('revalidates persisted evidence %j', async (replacement) => {
    const s = setup(true);
    if (replacement) s.objects.set(s.task.evidence.path, replacement);
    else s.objects.delete(s.task.evidence.path);
    await expect(removeModeratedObject(s.task, s.port, s.control)).rejects.toThrow(
      'archive_changed',
    );
  });
  test('recomputes persisted archive bytes', async () => {
    const s = setup(true);
    s.port.digest.mockResolvedValue({ ...digest, sha256: 'c'.repeat(64) });
    await expect(removeModeratedObject(s.task, s.port, s.control)).rejects.toThrow(
      'archive_bytes_mismatch',
    );
  });
  test('never acknowledges ineffective deletion', async () => {
    const s = setup();
    s.port.remove.mockResolvedValue(undefined);
    await expect(removeModeratedObject(s.task, s.port, s.control)).rejects.toThrow(
      'source_still_present',
    );
    expect(s.control.saveOriginRemoval).not.toHaveBeenCalled();
  });
  test.each([1, 2, 3, 4, 5])(
    'expired lease at checkpoint %i prevents completion',
    async (checkpoint) => {
      const s = setup();
      let checks = 0;
      s.control.assertLease.mockImplementation(async () => {
        if (++checks === checkpoint) throw new Error('expired');
      });
      await expect(removeModeratedObject(s.task, s.port, s.control)).rejects.toThrow('expired');
      expect(s.control.saveOriginRemoval).not.toHaveBeenCalled();
    },
  );
  test('archive persistence failure prevents deletion', async () => {
    const s = setup();
    s.control.saveArchive.mockRejectedValue(new Error('database unavailable'));
    await expect(removeModeratedObject(s.task, s.port, s.control)).rejects.toThrow(
      'database unavailable',
    );
    expect(s.port.remove).not.toHaveBeenCalled();
  });
  test.each([
    { bucket: 'post-media' as const, path: 'member/photo.png' },
    { bucket: 'avatars' as const, path: 'someone/else' },
  ])('restore destination must match exact original %j', async (destination) => {
    const s = setup();
    await expect(
      restoreModeratedObject(s.task, destination, s.port, s.control.assertLease),
    ).rejects.toThrow('invalid_restore');
    expect(s.control.assertLease).not.toHaveBeenCalled();
  });
  test('reversal before removal returns untouched source with two authorization checks', async () => {
    const s = setup();
    await expect(
      restoreModeratedObject(s.task, s.task.source, s.port, s.control.assertLease),
    ).resolves.toEqual(original);
    expect(s.control.assertLease).toHaveBeenCalledTimes(2);
    expect(s.port.copy).not.toHaveBeenCalled();
  });
  test.each([null, { ...original, version: 'changed' }])(
    'untouched reversal fails closed for %j',
    async (identity) => {
      const s = setup();
      if (identity) s.objects.set(s.task.source.path, identity);
      else s.objects.clear();
      await expect(
        restoreModeratedObject(s.task, s.task.source, s.port, s.control.assertLease),
      ).rejects.toThrow('restore_conflict');
    },
  );
  test.each([true, false])(
    'restores archived bytes without overwrite; destination present=%s',
    async (present) => {
      const s = setup(true);
      if (!present) s.objects.delete(s.task.source.path);
      await expect(
        restoreModeratedObject(s.task, s.task.source, s.port, s.control.assertLease),
      ).resolves.toEqual(present ? original : evidence);
      expect(s.port.copy).toHaveBeenCalledTimes(present ? 0 : 1);
      expect(s.port.remove).not.toHaveBeenCalled();
    },
  );
  test.each(['missing', 'identity', 'digest'])(
    'restore requires valid archive: %s',
    async (mode) => {
      const s = setup(true);
      if (mode === 'missing') s.objects.delete(s.task.evidence.path);
      if (mode === 'identity') s.objects.set(s.task.evidence.path, { ...evidence, version: 'new' });
      if (mode === 'digest') s.port.digest.mockResolvedValue({ ...digest, size: 3 });
      await expect(
        restoreModeratedObject(s.task, s.task.source, s.port, s.control.assertLease),
      ).rejects.toThrow('archive_changed');
    },
  );
  test.each(['missing', 'size', 'mime', 'hash'])(
    'restore verifies copied bytes: %s',
    async (mode) => {
      const s = setup(true);
      s.objects.delete(s.task.source.path);
      s.port.copy.mockImplementation(async (_src, dst) => {
        if (mode !== 'missing')
          s.objects.set(dst.path, {
            ...original,
            ...(mode === 'size' ? { size: 3 } : mode === 'mime' ? { mime: 'other' } : {}),
          });
      });
      if (mode === 'hash')
        s.port.digest
          .mockResolvedValueOnce(digest)
          .mockResolvedValueOnce({ ...digest, sha256: 'b'.repeat(64) });
      await expect(
        restoreModeratedObject(s.task, s.task.source, s.port, s.control.assertLease),
      ).rejects.toThrow('restore_conflict');
    },
  );
});

describe('guarded cleanup exact-object leases', () => {
  const path = 'member/photo.png';
  function cleanup(claims: unknown = [{ path, state: 'claimed', lease_id: id, original }]) {
    const s = setup();
    const rpc = jest.fn(
      async (name: string, _args: Record<string, unknown>): Promise<unknown> =>
        name === 'claim_media_cleanup_v1' ? claims : true,
    );
    return {
      ...s,
      rpc,
      run: (paths = [path]) => guardedMediaCleanup('avatars', paths, rpc, s.port),
    };
  }
  test.each([
    ['bad', [path]],
    ['avatars', []],
    ['avatars', Array(101).fill(path)],
    ['avatars', ['../private']],
    ['avatars', ['']],
    ['avatars', ['a//b']],
  ])('rejects invalid batch %s %j', async (bucket, paths) => {
    const s = cleanup();
    await expect(
      guardedMediaCleanup(bucket as string, paths as string[], s.rpc, s.port),
    ).rejects.toThrow('Invalid cleanup batch');
    expect(s.rpc).not.toHaveBeenCalled();
  });
  test.each([
    null,
    {},
    [null],
    [{ path: 'another', state: 'complete' }],
    [{ path, state: 'unknown' }],
    [{ path, state: 'claimed', original }],
    [{ path, state: 'claimed', lease_id: 'bad', original }],
    [{ path, state: 'claimed', lease_id: id }],
    [
      { path, state: 'complete' },
      { path, state: 'complete' },
    ],
  ])('validates whole claim before deleting %j', async (claims) => {
    const s = cleanup(claims);
    await expect(s.run()).rejects.toThrow('Invalid cleanup claim');
    expect(s.port.remove).not.toHaveBeenCalled();
  });
  test('deduplicates requests and returns unclaimed work as deferred', async () => {
    const s = cleanup();
    await expect(s.run([path, path, 'held/file'])).resolves.toEqual({
      completed: [path],
      deferred: ['held/file'],
    });
    expect(s.rpc).toHaveBeenCalledWith('claim_media_cleanup_v1', {
      p_bucket: 'avatars',
      p_paths: [path, 'held/file'],
    });
    expect(s.port.remove).toHaveBeenCalledTimes(1);
  });
  test('duplicate claims within batch size are rejected before any deletion', async () => {
    const s = cleanup([
      { path, state: 'complete' },
      { path, state: 'complete' },
    ]);
    await expect(s.run([path, 'other'])).rejects.toThrow('Invalid cleanup claim');
    expect(s.port.inspect).not.toHaveBeenCalled();
  });
  test.each([true, false])('completed claims require absence: present=%s', async (present) => {
    const s = cleanup([{ path, state: 'complete' }]);
    if (!present) s.objects.clear();
    if (present) await expect(s.run()).rejects.toThrow('Cleanup identity changed');
    else await expect(s.run()).resolves.toEqual({ completed: [path], deferred: [] });
    expect(s.port.remove).not.toHaveBeenCalled();
  });
  test.each([
    null,
    { ...original, id: 'new' },
    { ...original, version: 'new' },
    { ...original, size: 5 },
    { ...original, mime: 'other' },
  ])('cannot delete replacement identity against %j', async (expected) => {
    const s = cleanup([{ path, state: 'claimed', lease_id: id, original: expected }]);
    await expect(s.run()).rejects.toThrow('Cleanup identity changed');
    expect(s.port.remove).not.toHaveBeenCalled();
  });
  test('missing leased source is safely acknowledged', async () => {
    const s = cleanup();
    s.objects.clear();
    await expect(s.run()).resolves.toEqual({ completed: [path], deferred: [] });
    expect(s.port.remove).not.toHaveBeenCalled();
  });
  test.each([1, 2, 3])('lease failure at checkpoint %i prevents acknowledgement', async (at) => {
    const s = cleanup();
    let calls = 0;
    s.rpc.mockImplementation(async (name) =>
      name === 'claim_media_cleanup_v1'
        ? [{ path, state: 'claimed', lease_id: id, original }]
        : ++calls !== at,
    );
    await expect(s.run()).rejects.toThrow('Cleanup lease expired');
    expect(s.rpc.mock.calls.some(([name]) => name === 'finish_media_cleanup_v1')).toBe(false);
  });
  test('ineffective removal cannot finish', async () => {
    const s = cleanup();
    s.port.remove.mockResolvedValue(undefined);
    await expect(s.run()).rejects.toThrow('Cleanup object remains');
  });
  test('strict acknowledgement required', async () => {
    const s = cleanup();
    s.rpc.mockImplementation(async (name) =>
      name === 'claim_media_cleanup_v1'
        ? [{ path, state: 'claimed', lease_id: id, original }]
        : name === 'finish_media_cleanup_v1'
          ? { success: true }
          : true,
    );
    await expect(s.run()).rejects.toThrow('Cleanup completion unconfirmed');
  });
});
