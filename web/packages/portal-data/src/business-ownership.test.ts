import { describe, expect, it } from 'vitest';
import { createEmployeeSession } from './employee-session';
import { readBusinessAssignees } from './business-assignees';
import type { BusinessOwnership } from './business-claim';

const id = '20000000-0000-4000-8000-000000000002';
const target = '40000000-0000-4000-8000-000000000004';
const input: BusinessOwnership = {
  p_kind: 'business_application',
  p_id: id,
  p_revision: 1,
  p_source_version: '3',
  p_action: 'assign',
  p_target: target,
  p_request_id: '30000000-0000-4000-8000-000000000003',
};
async function fixture(
  manager = true,
  handler?: (name: string, args: BusinessOwnership) => Response,
) {
  const calls: { name: string; args: BusinessOwnership }[] = [];
  const controller = createEmployeeSession(
    {
      independentEmployeeIdentity: true,
      staffWorkflowEnabled: true,
      businessApplicationsEnabled: true,
    },
    {
      origin: 'https://admin.dojipro.com',
      upstream: async (url, init) => {
        if (String(url).endsWith('/api/session'))
          return Response.json({
            signedIn: true,
            assurance: 'aal2',
            csrf: 'c'.repeat(43),
            operator: {
              user_id: '10000000-0000-4000-8000-000000000001',
              capabilities: { business_read: true, operator_manage: manager },
            },
          });
        if (String(url).endsWith('/auth/logout')) return Response.json({ signedIn: false });
        const call = JSON.parse(String(init?.body)) as (typeof calls)[number];
        calls.push(call);
        if (handler) return handler(call.name, call.args);
        return Response.json(
          call.name === 'get_admin_case_assignees_v1'
            ? { items: [{ id: target, label: 'Eligible reviewer' }], next_cursor: null }
            : {
                id,
                kind: 'business_application',
                revision: call.args.p_revision + 1,
                assigned_to: call.args.p_target,
                replayed: false,
              },
        );
      },
    },
  );
  await controller.restore();
  return { controller, calls, signal: new AbortController().signal };
}
describe('business ownership management', () => {
  it('uses exactly one atomic assignment with the selected target', async () => {
    const f = await fixture();
    await expect(f.controller.changeBusinessOwnership(input, f.signal)).resolves.toMatchObject({
      assignedTo: target,
      revision: 2,
    });
    expect(f.calls).toEqual([{ name: 'admin_case_ownership_command_v1', args: input }]);
    await f.controller.signOut();
  });
  it('allows a field-free release with a null target; the server checks current ownership', async () => {
    const f = await fixture(false);
    const release = { ...input, p_action: 'release', p_target: null } as const;
    await expect(f.controller.changeBusinessOwnership(release, f.signal)).resolves.toMatchObject({
      assignedTo: null,
    });
    expect(f.calls[0]?.args).toEqual(release);
    await f.controller.signOut();
  });
  it('denies non-manager reassignment and directory reads before dispatch', async () => {
    const f = await fixture(false);
    await expect(f.controller.changeBusinessOwnership(input, f.signal)).rejects.toThrow(
      'permission',
    );
    await expect(readBusinessAssignees(f.controller, id, null, f.signal)).rejects.toThrow(
      'permission',
    );
    expect(f.calls).toEqual([]);
    await f.controller.signOut();
  });
  it('rejects invalid targets, actions, caller actors and mismatched receipts', async () => {
    const f = await fixture(true, () =>
      Response.json({
        id,
        kind: 'business_application',
        revision: 2,
        assigned_to: null,
        replayed: false,
      }),
    );
    for (const patch of [
      { p_action: 'assign', p_target: null },
      { p_action: 'release', p_target: target },
      { p_action: 'delete' },
      { actor_id: target },
    ])
      await expect(
        f.controller.changeBusinessOwnership({ ...input, ...patch } as BusinessOwnership, f.signal),
      ).rejects.toThrow('Invalid');
    expect(f.calls).toHaveLength(0);
    await expect(f.controller.changeBusinessOwnership(input, f.signal)).rejects.toThrow('verified');
    expect(f.calls).toHaveLength(1);
    await f.controller.signOut();
  });
  it('reads only a bounded case-specific reviewer page', async () => {
    const f = await fixture();
    const page = await readBusinessAssignees(f.controller, id, null, f.signal);
    expect(page.items).toEqual([{ id: target, label: 'Eligible reviewer' }]);
    expect(f.calls).toEqual([
      {
        name: 'get_admin_case_assignees_v1',
        args: { p_kind: 'business_application', p_id: id, p_after_id: null, p_limit: 25 },
      },
    ]);
    await f.controller.signOut();
  });
  it('rejects repeated and non-advancing reviewer pages', async () => {
    const f = await fixture(true, () =>
      Response.json({ items: [{ id: target, label: 'Reviewer' }], next_cursor: target }),
    );
    await expect(readBusinessAssignees(f.controller, id, target, f.signal)).rejects.toThrow(
      'verified',
    );
    await f.controller.signOut();
    const duplicate = await fixture(true, () =>
      Response.json({
        items: [
          { id: target, label: 'A' },
          { id: target, label: 'B' },
        ],
        next_cursor: null,
      }),
    );
    await expect(
      readBusinessAssignees(duplicate.controller, id, null, duplicate.signal),
    ).rejects.toThrow('verified');
    await duplicate.controller.signOut();
  });
});
