import { describe, expect, it, vi } from 'vitest';
import { createEmployeeSession } from './employee-session';
import { businessApplication, readBusinessRecord } from './business-record';

const id = '20000000-0000-4000-8000-000000000002';
const actor = '10000000-0000-4000-8000-000000000001';
const application = {
  id,
  revision: 3,
  state: 'pending',
  details: { brand_name: 'Synthetic business', website: 'https://example.com' },
  latest_submission: { submission: 1, terms_version: 'v1', privacy_version: 'v1' },
  history: [],
  history_has_more: false,
};
const ownership = {
  id,
  kind: 'business_application',
  revision: 0,
  source_version: '3',
  owner_label: 'Unassigned',
  assigned_to: null,
  can_claim: true,
  can_release: false,
  can_assign: false,
  can_decide: false,
  actionable: true,
};
const input = {
  p_id: id,
  p_kind: 'business_application',
  p_revision: 0,
  p_source_version: '3',
  p_action: 'claim',
  p_target: null,
  p_request_id: '30000000-0000-4000-8000-000000000003',
} as const;
async function fixture(handler?: (name: string) => Promise<Response>, business = true) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const upstream = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/auth/logout')) return Response.json({ signedIn: false });
    if (url.endsWith('/api/session'))
      return Response.json({
        signedIn: true,
        assurance: 'aal2',
        csrf: 'c'.repeat(43),
        operator: { user_id: actor, capabilities: { business_read: business } },
      });
    const body = JSON.parse(String(init?.body)) as (typeof calls)[number];
    calls.push(body);
    if (handler) return handler(body.name);
    return Response.json(
      body.name === 'get_admin_business_application_v1'
        ? application
        : body.name === 'get_admin_case_ownership_v1'
          ? ownership
          : { id, kind: 'business_application', revision: 1, assigned_to: actor, replayed: false },
    );
  });
  const controller = createEmployeeSession(
    {
      independentEmployeeIdentity: true,
      staffWorkflowEnabled: true,
      businessApplicationsEnabled: true,
    },
    { origin: 'https://admin.dojipro.com', upstream },
  );
  await controller.restore();
  return { controller, calls, upstream, signal: new AbortController().signal };
}
describe('connected business record boundaries', () => {
  it('projects only display fields and rejects mismatched identity and malformed history', () => {
    expect(
      businessApplication({ ...application, applicant_id: 'not-for-this-view' }, id),
    ).not.toHaveProperty('applicant_id');
    expect(() => businessApplication({ ...application, id: actor }, id)).toThrow();
    expect(() => businessApplication({ ...application, history: [{}] }, id)).toThrow();
    expect(() =>
      businessApplication({ ...application, details: { brand_name: {} } }, id),
    ).toThrow();
  });
  it('reads exact source and ownership without dispatching a command', async () => {
    const f = await fixture();
    const result = await readBusinessRecord(f.controller, id, f.signal);
    expect(result.owner.owner_label).toBe('Unassigned');
    expect(f.calls.map((call) => call.name)).toEqual([
      'get_admin_business_application_v1',
      'get_admin_case_ownership_v1',
    ]);
    await f.controller.signOut();
  });
  it('rejects snapshots from different source revisions', async () => {
    const f = await fixture(async (name) =>
      Response.json(
        name === 'get_admin_business_application_v1'
          ? application
          : { ...ownership, source_version: '4' },
      ),
    );
    await expect(readBusinessRecord(f.controller, id, f.signal)).rejects.toThrow('verified');
    await f.controller.signOut();
  });
  it('denies unauthorized reads and claims without any RPC', async () => {
    const f = await fixture(undefined, false);
    await expect(readBusinessRecord(f.controller, id, f.signal)).rejects.toThrow('permission');
    await expect(f.controller.claimBusiness(input, f.signal)).rejects.toThrow('permission');
    expect(f.calls).toEqual([]);
    await f.controller.signOut();
  });
  it('dispatches exactly one existing atomic command with no caller-supplied actor', async () => {
    const f = await fixture();
    await expect(f.controller.claimBusiness(input, f.signal)).resolves.toMatchObject({
      assignedTo: actor,
      revision: 1,
    });
    expect(f.calls).toEqual([{ name: 'admin_case_ownership_command_v1', args: input }]);
    await expect(
      f.controller.read('business_read', '/staff-workflow/command', input, (x) => x, f.signal),
    ).rejects.toThrow('Unsupported');
    await expect(
      f.controller.claimBusiness({ ...input, actor_id: actor } as typeof input, f.signal),
    ).rejects.toThrow('Invalid');
    expect(f.calls).toHaveLength(1);
    await f.controller.signOut();
  });
  it('does not retry an uncertain response automatically', async () => {
    const f = await fixture(async () => Response.json({ message: 'Unavailable' }, { status: 503 }));
    await expect(f.controller.claimBusiness(input, f.signal)).rejects.toThrow('Unavailable');
    expect(f.calls).toHaveLength(1);
    await f.controller.signOut();
  });
  it('rejects incorrect command receipts', async () => {
    const f = await fixture(async () =>
      Response.json({
        id,
        kind: 'business_application',
        revision: 2,
        assigned_to: actor,
        replayed: false,
      }),
    );
    await expect(f.controller.claimBusiness(input, f.signal)).rejects.toThrow('verified');
    await f.controller.signOut();
  });
  it('fences late command results after logout; cancellation does not claim server rollback', async () => {
    let release!: (value: Response) => void;
    const f = await fixture(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const result = f.controller.claimBusiness(input, f.signal);
    const rejection = expect(result).rejects.toThrow();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const logout = f.controller.signOut();
    release(
      Response.json({
        id,
        kind: 'business_application',
        revision: 1,
        assigned_to: actor,
        replayed: false,
      }),
    );
    await rejection;
    await logout;
    expect(f.controller.getSnapshot().cache).toBeNull();
    expect(f.calls).toHaveLength(1);
  });
});
