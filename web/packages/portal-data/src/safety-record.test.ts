import { describe, expect, it, vi } from 'vitest';
import { createEmployeeSession } from './employee-session';
import { readSafetyRecord, safetyRecord } from './safety-record';
import { safetyReceipt, validSafetyCommand, type SafetyCommand } from './safety-command';
import { safetyActor, safetyFixture, safetyId } from '../../../tests/safety-fixture';

const input: SafetyCommand = {
  p_id: safetyId,
  p_revision: 1,
  p_command_id: safetyActor,
  p_input: { action: 'claim', note: 'Self-assigned for review.' },
};
const fullCaps = { moderation_read: true, moderation_write: true, legal_read: true };
async function setup(
  caps = fullCaps,
  handler?: (name: string, args: Record<string, unknown>) => Promise<Response>,
) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const client = createEmployeeSession(
    { independentEmployeeIdentity: true },
    {
      origin: 'https://admin.dojipro.com',
      upstream: async (url, init) => {
        if (url.endsWith('/api/session'))
          return Response.json({
            signedIn: true,
            assurance: 'aal2',
            csrf: 'c'.repeat(43),
            operator: { user_id: safetyActor, capabilities: caps },
          });
        if (url.endsWith('/auth/logout')) return Response.json({ signedIn: false });
        const call = JSON.parse(String(init?.body)) as (typeof calls)[number];
        calls.push(call);
        return handler
          ? handler(call.name, call.args)
          : Response.json(
              call.name === 'get_admin_safety_removal_v1'
                ? safetyFixture()
                : { id: safetyId, revision: 2, outcome: 'saved' },
            );
      },
    },
  );
  await client.restore();
  return { client, calls };
}
describe('employee external safety contracts', () => {
  it('projects bounded fields and rejects identity, queue and closure mismatches', () => {
    const fixture = safetyFixture();
    expect(safetyRecord({ ...fixture, token_hash: 'not-for-ui' }, safetyId)).not.toHaveProperty(
      'token_hash',
    );
    for (const change of [
      { id: safetyActor },
      { queue: 'unknown' },
      { assigned_to: undefined },
      { state: 'removed' },
      { revision: -1 },
      { history: new Array(31).fill(fixture.history[0]) },
    ])
      expect(() => safetyRecord({ ...fixture, ...change }, safetyId)).toThrow();
    expect(() => safetyRecord(fixture, safetyId, 'restricted_safety')).toThrow();
  });
  it('denies restricted reads before dispatch and filters unexpected restricted responses', async () => {
    const { client, calls } = await setup({ ...fullCaps, legal_read: false }, async () =>
      Response.json({ ...safetyFixture(), queue: 'restricted_safety' }),
    );
    await expect(
      readSafetyRecord(client, safetyId, new AbortController().signal, 'restricted_safety'),
    ).rejects.toThrow();
    expect(calls).toEqual([]);
    await expect(
      readSafetyRecord(client, safetyId, new AbortController().signal),
    ).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });
  it('uses the exact native command, not staff ownership, with no extra actor or fields', async () => {
    const { client, calls } = await setup();
    await expect(
      client.changeSafety(input, 'moderation', new AbortController().signal),
    ).resolves.toEqual({ id: safetyId, revision: 2 });
    expect(calls).toEqual([{ name: 'admin_safety_removal_command_v1', args: input }]);
    await expect(
      client.read(
        'moderation_read',
        '/safety/command',
        input,
        (x) => x,
        new AbortController().signal,
      ),
    ).rejects.toThrow();
  });
  it.each(['moderation_read', 'moderation_write', 'legal_read'] as const)(
    'denies a restricted command without %s',
    async (cap) => {
      const { client, calls } = await setup({ ...fullCaps, [cap]: false });
      await expect(
        client.changeSafety(input, 'restricted_safety', new AbortController().signal),
      ).rejects.toThrow();
      expect(calls).toEqual([]);
    },
  );
  it('requires closure response and verification evidence and forbids unrelated fields', () => {
    expect(validSafetyCommand(input)).toBe(true);
    expect(
      validSafetyCommand({
        ...input,
        p_input: { ...input.p_input, message: 'Do not send this with assignment' },
      }),
    ).toBe(false);
    expect(
      validSafetyCommand({
        ...input,
        p_input: { action: 'not_actionable', note: 'A completed review.' },
      }),
    ).toBe(false);
    expect(
      validSafetyCommand({
        ...input,
        p_input: {
          action: 'removed',
          note: 'A completed review.',
          message: 'The content was removed.',
        },
      }),
    ).toBe(false);
    expect(
      validSafetyCommand({
        ...input,
        p_input: {
          action: 'removed',
          note: 'A completed review.',
          message: 'The content was removed.',
          access_review: 'Access revocation verified against the exact content.',
        },
      }),
    ).toBe(true);
  });
  it('checks exact receipt identity, next revision and outcome', () => {
    for (const receipt of [
      { id: safetyActor, revision: 2, outcome: 'saved' },
      { id: safetyId, revision: 3, outcome: 'saved' },
      { id: safetyId, revision: 2, outcome: 'unknown' },
    ])
      expect(() => safetyReceipt(receipt, input)).toThrow();
  });
  it('rejects a late result after logout and never retries automatically', async () => {
    let release!: (response: Response) => void;
    const { client, calls } = await setup(
      fullCaps,
      async () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const result = client.changeSafety(input, 'moderation', new AbortController().signal);
    const denied = expect(result).rejects.toThrow();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const logout = client.signOut();
    release(Response.json({ id: safetyId, revision: 2, outcome: 'saved' }));
    await denied;
    await logout;
    expect(calls).toHaveLength(1);
  });
});
