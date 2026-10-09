import { describe, expect, it } from 'vitest';
import { createEmployeeSession } from './employee-session';
import { privacyCase, privacyPage, readPrivacyPage, readPrivacyRecord } from './privacy-record';
import { assertEmployeeRead } from './employee-read-policy';
import {
  privacyId,
  privacyAccount,
  privacyActor,
  privacyFixture,
  privacyOwnership,
} from '../../../tests/privacy-fixture';
const signal = () => new AbortController().signal;
async function fixture(caps = { legal_read: true, operator_manage: true }, enabled = true) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  let item = privacyFixture(),
    owner = privacyOwnership();
  let gate: (() => Promise<void>) | undefined;
  const controller = createEmployeeSession(
    {
      independentEmployeeIdentity: true,
      staffWorkflowEnabled: true,
      businessPrivacyEnabled: enabled,
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
        return Response.json(
          call.name === 'get_admin_case_ownership_v1'
            ? owner
            : call.name === 'get_admin_business_privacy_page_v1'
              ? [item]
              : item,
        );
      },
    },
  );
  await controller.restore();
  return {
    controller,
    calls,
    change: (value: typeof item) => {
      item = value;
    },
    owner: (value: typeof owner) => {
      owner = value;
    },
    delay: (value: () => Promise<void>) => {
      gate = value;
    },
  };
}
describe('employee privacy reads', () => {
  it('retains only bounded case fields and validates hold/history identity', () => {
    const item = privacyFixture();
    const parsed = privacyCase(
      { ...item, cleanup_email: 'must-not-retain', arbitrary: 'discard' },
      privacyId,
    );
    expect(parsed).not.toHaveProperty('cleanup_email');
    expect(parsed).not.toHaveProperty('arbitrary');
    expect(parsed.nextRevision).toBe(30);
    expect(privacyCase(privacyFixture(30), privacyId, 30).nextRevision).toBeNull();
    for (const patch of [
      { id: privacyAccount },
      { revision: 0 },
      { history: [...item.history, item.history[0]] },
      { history: [item.history[1], item.history[0]] },
      { hold: { reference: 'held', case_id: 'invalid' } },
      { history: [], history_has_more: true },
      { state: 'other' },
    ])
      expect(() => privacyCase({ ...item, ...patch }, privacyId)).toThrow('verified');
    expect(
      privacyCase({ ...item, hold: { reference: null, case_id: null } }, privacyId).hold,
    ).toBeNull();
  });
  it('checks server filter, stable microsecond cursor order, duplicates and bounds', () => {
    const item = privacyFixture(),
      later = { ...item, id: privacyAccount, due_at: '2026-10-20T12:00:00.123457+00:00' };
    expect(privacyPage([later], 'open', { id: item.id, due: item.due_at }).items).toHaveLength(1);
    for (const rows of [
      [item, item],
      [later, item],
      Array(26).fill(item),
      [{ ...item, state: 'completed' }],
    ])
      expect(() => privacyPage(rows, 'open', null)).toThrow('verified');
    expect(() => privacyPage([item], 'open', { id: item.id, due: item.due_at })).toThrow(
      'verified',
    );
  });
  it('uses exact existing reads and matches the ownership source revision', async () => {
    const f = await fixture();
    const result = await readPrivacyRecord(f.controller, privacyId, 0, signal());
    expect(result.owner.assignedTo).toBe(privacyActor);
    expect(f.calls).toEqual([
      {
        name: 'get_admin_business_privacy_case_v1',
        args: { p_case_id: privacyId, p_after_revision: 0 },
      },
      {
        name: 'get_admin_case_ownership_v1',
        args: { p_kind: 'business_privacy', p_id: privacyId },
      },
    ]);
    f.owner(privacyOwnership(33));
    await expect(readPrivacyRecord(f.controller, privacyId, 0, signal())).rejects.toThrow(
      'verified',
    );
    await readPrivacyPage(f.controller, 'open', null, signal());
    expect(f.calls.at(-1)).toMatchObject({
      name: 'get_admin_business_privacy_page_v1',
      args: { p_state: 'open', p_after_due: null, p_after_id: null },
    });
    await f.controller.signOut();
  });
  it('requires both legal and management permissions and respects the runtime gate', async () => {
    for (const caps of [
      { legal_read: true, operator_manage: false },
      { legal_read: false, operator_manage: true },
    ]) {
      const f = await fixture(caps);
      await expect(readPrivacyRecord(f.controller, privacyId, 0, signal())).rejects.toThrow(
        'permission',
      );
      expect(() => readPrivacyPage(f.controller, 'open', null, signal())).toThrow('permission');
      expect(f.calls).toEqual([]);
      await f.controller.signOut();
    }
    const f = await fixture(undefined, false);
    await expect(readPrivacyPage(f.controller, 'open', null, signal())).rejects.toThrow(
      'not enabled',
    );
    expect(f.calls).toEqual([]);
    await f.controller.signOut();
    for (const path of ['/business-privacy/open', '/business-privacy/command'])
      expect(() => assertEmployeeRead(path, true)).toThrow();
  });
  it('discards late private results after logout', async () => {
    const f = await fixture();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.delay(() => gate);
    const result = readPrivacyRecord(f.controller, privacyId, 0, signal());
    const denied = expect(result).rejects.toThrow();
    await f.controller.signOut();
    release();
    await denied;
    expect(f.controller.getSnapshot().cache).toBeNull();
  });
});
