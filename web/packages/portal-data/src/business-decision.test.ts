import { describe, expect, it, vi } from 'vitest';
import { createEmployeeSession } from './employee-session';
import { decisionReceipt, validBusinessDecision, type BusinessDecision } from './business-decision';

const id = '20000000-0000-4000-8000-000000000002';
const input: BusinessDecision = {
  p_id: id,
  p_revision: 3,
  p_action: 'approve',
  p_response: 'Welcome to the business workspace.',
  p_internal_note: 'Reviewed the supplied business information.',
  p_request_id: '30000000-0000-4000-8000-000000000003',
};
const result = {
  outcome: { id, revision: 4, state: 'approved', action: 'approve' },
  replayed: false,
  application: {
    id,
    revision: 4,
    state: 'approved',
    details: { brand_name: 'Synthetic' },
    latest_submission: { submission: 1, terms_version: 'v1', privacy_version: 'v1' },
    history: [],
    history_has_more: false,
  },
};
async function fixture(handler = async () => Response.json(result), manager = true) {
  let permitted = manager;
  const calls: { name: string; args: BusinessDecision }[] = [];
  const controller = createEmployeeSession(
    {
      independentEmployeeIdentity: true,
      staffWorkflowEnabled: true,
      businessApplicationsEnabled: true,
    },
    {
      origin: 'https://admin.dojipro.com',
      upstream: async (url, init) => {
        if (String(url).endsWith('/auth/logout')) return Response.json({ signedIn: false });
        if (String(url).endsWith('/api/session'))
          return Response.json({
            signedIn: true,
            assurance: 'aal2',
            csrf: 'c'.repeat(43),
            operator: {
              user_id: '10000000-0000-4000-8000-000000000001',
              capabilities: { business_read: true, operator_manage: permitted },
            },
          });
        calls.push(JSON.parse(String(init?.body)) as (typeof calls)[number]);
        return handler();
      },
    },
  );
  await controller.restore();
  return {
    controller,
    calls,
    signal: new AbortController().signal,
    revoke: () => {
      permitted = false;
    },
  };
}
describe('business decision transport', () => {
  it('keeps exact existing command parameters, with no generic write route', async () => {
    const f = await fixture();
    await expect(f.controller.decideBusiness(input, f.signal)).resolves.toEqual({
      id,
      revision: 4,
      action: 'approve',
      replayed: false,
    });
    expect(f.calls).toEqual([{ name: 'admin_business_application_command_v1', args: input }]);
    await expect(
      f.controller.read('business_read', '/business/command', input, (x) => x, f.signal),
    ).rejects.toThrow('Unsupported');
    await f.controller.signOut();
  });
  it('rejects insufficient permission before making any write', async () => {
    const f = await fixture(undefined, false);
    await expect(f.controller.decideBusiness(input, f.signal)).rejects.toThrow('permission');
    expect(f.calls).toEqual([]);
    await f.controller.signOut();
  });
  it('rejects invalid actions, injected fields, versions and incomplete responses', async () => {
    const f = await fixture();
    for (const patch of [
      { actor_id: id },
      { p_action: 'publish' },
      { p_revision: -1 },
      { p_revision: Number.MAX_SAFE_INTEGER },
      { p_response: '       ' },
      { p_response: '😀😀😀😀' },
      { p_response: 'a'.repeat(1001) },
      { p_internal_note: 'a'.repeat(2001) },
      { p_request_id: 'not-an-id' },
    ]) {
      const invalid = { ...input, ...patch } as BusinessDecision;
      expect(validBusinessDecision(invalid)).toBe(false);
      await expect(f.controller.decideBusiness(invalid, f.signal)).rejects.toThrow('required');
    }
    expect(f.calls).toEqual([]);
    await f.controller.signOut();
  });
  it('does not retry uncertain writes and permits explicit identical replay', async () => {
    let attempts = 0;
    const f = await fixture(async () =>
      ++attempts === 1
        ? Response.json({}, { status: 503 })
        : Response.json({ ...result, replayed: true }),
    );
    await expect(f.controller.decideBusiness(input, f.signal)).rejects.toThrow();
    expect(f.calls).toHaveLength(1);
    await expect(f.controller.decideBusiness(input, f.signal)).resolves.toMatchObject({
      replayed: true,
    });
    expect(f.calls[1]).toEqual(f.calls[0]);
    await f.controller.signOut();
  });
  it('validates receipts while allowing newer application state on idempotent replay', () => {
    expect(
      decisionReceipt(
        {
          ...result,
          replayed: true,
          application: { ...result.application, revision: 5, state: 'changes_requested' },
        },
        input,
      ),
    ).toMatchObject({ revision: 4, replayed: true });
    for (const outcome of [
      { ...result.outcome, id: input.p_request_id },
      { ...result.outcome, revision: 5 },
      { ...result.outcome, state: 'declined' },
      { ...result.outcome, action: 'decline' },
    ])
      expect(() => decisionReceipt({ ...result, outcome }, input)).toThrow('verified');
    expect(() =>
      decisionReceipt({ ...result, application: { ...result.application, revision: 3 } }, input),
    ).toThrow('verified');
    expect(() =>
      decisionReceipt(
        { ...result, application: { ...result.application, state: 'declined' } },
        input,
      ),
    ).toThrow('verified');
  });
  it('rechecks revoked decision permissions after denial without retrying', async () => {
    const f = await fixture(async () => Response.json({}, { status: 403 }));
    f.revoke();
    await expect(f.controller.decideBusiness(input, f.signal)).rejects.toThrow();
    expect(f.calls).toHaveLength(1);
    expect(f.controller.getSnapshot().operator?.capabilities.operator_manage).toBe(false);
    await expect(f.controller.decideBusiness(input, f.signal)).rejects.toThrow('permission');
    expect(f.calls).toHaveLength(1);
    await f.controller.signOut();
  });
  it('fences a successful but late response after logout', async () => {
    let release!: (value: Response) => void;
    const f = await fixture(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = f.controller.decideBusiness(input, f.signal);
    const rejection = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const logout = f.controller.signOut();
    release(Response.json(result));
    await rejection;
    await logout;
    expect(f.calls).toHaveLength(1);
    expect(f.controller.getSnapshot().cache).toBeNull();
  });
});
