import { describe, expect, it } from 'vitest';
import { createEmployeeSession } from './employee-session';
import { privacyChoices, validPrivacyInput, type PrivacyInput } from './privacy-command';
import { readPrivacyRecord } from './privacy-record';
import {
  privacyActor,
  privacyId,
  privacyAccount,
  privacyFixture,
  privacyOwnership,
} from '../../../tests/privacy-fixture';
const signal = () => new AbortController().signal;
const input = (action: PrivacyInput['action'] = 'complete'): PrivacyInput => ({
  id: privacyId,
  key: '90000000-0000-4000-8000-000000000009',
  revision: 32,
  ownerRevision: 2,
  state: 'open',
  action,
  reference: ['claim', 'release'].includes(action) ? '' : 'support-ref-001',
});
async function fixture(caps = { legal_read: true, operator_manage: true }, enabled = true) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  let result: unknown = { id: privacyId, revision: 33, state: 'completed' };
  let status = 200,
    gate: (() => Promise<void>) | undefined;
  const controller = createEmployeeSession(
    {
      independentEmployeeIdentity: true,
      businessPrivacyEnabled: enabled,
      staffWorkflowEnabled: true,
    },
    {
      origin: 'https://admin.dojipro.com',
      upstream: async (url, init) => {
        if (url.endsWith('/api/session'))
          return Response.json({
            signedIn: true,
            assurance: 'aal2',
            csrf: 'c'.repeat(43),
            operator: { user_id: privacyActor, capabilities: caps },
          });
        if (url.endsWith('/auth/logout')) return Response.json({ signedIn: false });
        const call = JSON.parse(String(init?.body)) as (typeof calls)[number];
        calls.push(call);
        await gate?.();
        if (call.name === 'get_admin_business_privacy_case_v1')
          return Response.json(privacyFixture());
        if (call.name === 'get_admin_case_ownership_v1') return Response.json(privacyOwnership());
        return Response.json(result, { status });
      },
    },
  );
  await controller.restore();
  return {
    controller,
    calls,
    response: (body: unknown, code = 200) => {
      result = body;
      status = code;
    },
    delay: (value: () => Promise<void>) => {
      gate = value;
    },
  };
}
describe('privacy commands', () => {
  it('sends one existing command and preserves exact replay input without extra data', async () => {
    const f = await fixture();
    await f.controller.changePrivacy(input(), signal());
    await f.controller.changePrivacy(input(), signal());
    expect(f.calls).toHaveLength(2);
    expect(f.calls[0]).toEqual(f.calls[1]);
    expect(f.calls[0]).toMatchObject({
      name: 'admin_business_privacy_command_v1',
      args: {
        p_case_id: privacyId,
        p_revision: 32,
        p_action: 'complete',
        p_reference: 'support-ref-001',
        p_request_id: input().key,
      },
    });
    expect(f.calls[0]!.args).not.toHaveProperty('ownerRevision');
    expect(f.calls[0]!.args).not.toHaveProperty('p_details');
    await f.controller.signOut();
  });
  it('claims and releases ownership without outcome fields, and checks exact receipts', async () => {
    const f = await fixture();
    for (const action of ['claim', 'release'] as const) {
      f.response({
        kind: 'business_privacy',
        id: privacyId,
        revision: 3,
        assigned_to: action === 'claim' ? privacyActor : null,
        replayed: false,
      });
      await f.controller.changePrivacy(input(action), signal());
      expect(f.calls.at(-1)).toMatchObject({
        name: 'admin_case_ownership_command_v1',
        args: {
          p_kind: 'business_privacy',
          p_revision: 2,
          p_source_version: '32',
          p_action: action,
          p_target: null,
        },
      });
      expect(f.calls.at(-1)!.args).not.toHaveProperty('p_reference');
    }
    f.response({
      kind: 'business_privacy',
      id: privacyId,
      revision: 3,
      assigned_to: privacyAccount,
      replayed: true,
    });
    await expect(f.controller.changePrivacy(input('claim'), signal())).rejects.toThrow('verified');
    await f.controller.signOut();
  });
  it('rejects wrong IDs, revisions, states and overbroad input', async () => {
    const f = await fixture();
    for (const body of [
      { id: privacyAccount, revision: 33, state: 'completed' },
      { id: privacyId, revision: 32, state: 'completed' },
      { id: privacyId, revision: 33, state: 'open' },
    ]) {
      f.response(body);
      await expect(f.controller.changePrivacy(input(), signal())).rejects.toThrow('verified');
    }
    for (const patch of [
      { reference: 'email@example.com' },
      { action: 'execute_erasure' },
      { revision: Infinity },
      { ownerRevision: -1 },
      { arbitrary: true },
      { action: 'claim', reference: 'not-empty' },
    ])
      expect(validPrivacyInput({ ...input(), ...patch } as PrivacyInput)).toBe(false);
    await f.controller.signOut();
  });
  it('reassigns to the exact eligible-directory target without decision fields', async () => {
    const f = await fixture();
    const assign: PrivacyInput = { ...input('assign'), reference: '', target: privacyAccount };
    f.response({
      kind: 'business_privacy',
      id: privacyId,
      revision: 3,
      assigned_to: privacyAccount,
      replayed: false,
    });
    await f.controller.changePrivacy(assign, signal());
    expect(f.calls[0]).toMatchObject({
      name: 'admin_case_ownership_command_v1',
      args: { p_target: privacyAccount, p_action: 'assign' },
    });
    const missingTarget = { ...assign };
    delete missingTarget.target;
    expect(validPrivacyInput(missingTarget)).toBe(false);
    expect(validPrivacyInput({ ...input('claim'), target: privacyAccount })).toBe(false);
    f.response({
      kind: 'business_privacy',
      id: privacyId,
      revision: 3,
      assigned_to: privacyActor,
      replayed: false,
    });
    await expect(f.controller.changePrivacy(assign, signal())).rejects.toThrow('verified');
    await f.controller.signOut();
  });
  it('requires both capabilities, runtime gate and current session before accepting outcomes', async () => {
    for (const caps of [
      { legal_read: false, operator_manage: true },
      { legal_read: true, operator_manage: false },
    ]) {
      const f = await fixture(caps);
      await expect(f.controller.changePrivacy(input(), signal())).rejects.toThrow('permission');
      expect(f.calls).toEqual([]);
      await f.controller.signOut();
    }
    const disabled = await fixture(undefined, false);
    await expect(disabled.controller.changePrivacy(input(), signal())).rejects.toThrow(
      'not enabled',
    );
    expect(disabled.calls).toEqual([]);
    await disabled.controller.signOut();
    const f = await fixture();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.delay(() => gate);
    const pending = f.controller.changePrivacy(input(), signal());
    const denied = expect(pending).rejects.toThrow();
    // Wait until dispatch so this checks late-result fencing, not only preflight.
    while (!f.calls.length)
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    const signedOut = f.controller.signOut();
    release();
    await Promise.all([signedOut, denied]);
  });
  it('keeps erasure preparation separate from execution and honors hold ownership', async () => {
    const f = await fixture();
    const item = await readPrivacyRecord(f.controller, privacyId, 0, signal());
    expect(privacyChoices({ ...item, kind: 'erasure' })).toEqual([
      'hold',
      'prepare_erasure',
      'deny',
    ]);
    expect(
      privacyChoices({
        ...item,
        kind: 'erasure',
        hold: { caseId: privacyAccount, reference: 'hold-ref' },
      }),
    ).toEqual(['deny']);
    expect(privacyChoices({ ...item, kind: 'erasure', state: 'executing' })).toEqual([]);
    expect(privacyChoices({ ...item, kind: 'erasure', state: 'primary_erased' })).toEqual([
      'complete',
    ]);
    expect(privacyChoices({ ...item, kind: 'correction' })).not.toContain('complete');
    expect(
      privacyChoices({
        ...item,
        state: 'denied',
        hold: { caseId: privacyId, reference: 'hold-ref' },
      }),
    ).toEqual(['release_hold']);
    await f.controller.signOut();
  });
});
