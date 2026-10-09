import { describe, expect, it } from 'vitest';
import { createEmployeeSession } from './employee-session';
import { readEmployeeQueue, readEmployeeOverview } from './employee-queues';

const id = '10000000-0000-4000-8000-000000000001';
const caseId = '20000000-0000-4000-8000-000000000002';
const at = '2026-10-08T12:00:00Z';
const item = {
  kind: 'report',
  id: caseId,
  key: 'report:' + caseId,
  subject: 'Synthetic report',
  at,
  assigned_to: id,
  work_state: 'ready',
  due_at: null,
  ownership_model: 'existing_report',
  origin: 'in_app',
  status: 'received',
};
async function setup(capabilities: Record<string, boolean>, row = item) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const client = createEmployeeSession(
    { independentEmployeeIdentity: true, staffWorkflowEnabled: true },
    {
      origin: 'https://admin.dojipro.com',
      upstream: async (url, init) => {
        if (url.endsWith('/api/session'))
          return Response.json({
            signedIn: true,
            assurance: 'aal2',
            csrf: 'c'.repeat(43),
            operator: { user_id: id, capabilities },
          });
        if (url.endsWith('/auth/logout')) return Response.json({ signedIn: false });
        const input = JSON.parse(String(init?.body)) as {
          name: string;
          args: Record<string, unknown>;
        };
        calls.push(input);
        return Response.json({
          scope: input.args.p_queue ? 'staff_safety_v1' : 'staff_inbox_v1',
          order: 'oldest_first',
          items: [row],
          authorized_queues: ['report'],
          next_cursor: { at, key: row.key },
          ...(input.args.p_queue ? { queue: input.args.p_queue, closed: input.args.p_closed } : {}),
        });
      },
    },
  );
  await client.restore();
  return { client, calls };
}
describe('employee queue adapter', () => {
  it('overview uses one authorized 25-row team snapshot, not personal scope or per-queue fanout', async () => {
    const { client, calls } = await setup({ moderation_read: true });
    await readEmployeeOverview(client, new AbortController().signal);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toEqual({
      p_kind: 'all',
      p_filter: 'all',
      p_limit: 25,
      p_after_at: null,
      p_after_key: null,
      p_state: 'all',
    });
    await client.signOut();
  });
  it('overview cannot read without an authorized intake capability', async () => {
    const { client, calls } = await setup({ operator_manage: true });
    await expect(readEmployeeOverview(client, new AbortController().signal)).rejects.toThrow(
      'permission',
    );
    expect(calls).toHaveLength(0);
    await client.signOut();
  });
  it('uses server-owned closed safety filtering and cannot close-filter the personal inbox', async () => {
    const { client, calls } = await setup(
      { moderation_read: true },
      { ...item, work_state: 'closed' },
    );
    await readEmployeeQueue(client, 'trust-safety', null, new AbortController().signal, true);
    expect(calls[0]?.args).toMatchObject({ p_queue: 'moderation', p_closed: true });
    await expect(
      readEmployeeQueue(client, 'my-work', null, new AbortController().signal, true),
    ).rejects.toThrow('Unsupported');
    expect(calls).toHaveLength(1);
    await client.signOut();
  });
  it('rejects an open record returned in the closed view', async () => {
    const { client } = await setup({ moderation_read: true });
    await expect(
      readEmployeeQueue(client, 'trust-safety', null, new AbortController().signal, true),
    ).rejects.toThrow();
    await client.signOut();
  });
  it('sends personal ownership filtering to the server and preserves the cursor', async () => {
    const { client, calls } = await setup({ moderation_read: true });
    const page = await readEmployeeQueue(client, 'my-work', null, new AbortController().signal);
    await readEmployeeQueue(client, 'my-work', page.next_cursor, new AbortController().signal);
    expect(calls[0]?.args).toMatchObject({
      p_filter: 'mine',
      p_limit: 25,
      p_after_at: null,
      p_after_key: null,
    });
    expect(calls[1]?.args).toMatchObject({ p_after_at: at, p_after_key: item.key });
    await client.signOut();
  });
  it('requires both restricted-safety capabilities before a request', async () => {
    const { client, calls } = await setup({ moderation_read: true });
    await expect(
      readEmployeeQueue(client, 'restricted-safety', null, new AbortController().signal),
    ).rejects.toThrow('permission');
    expect(calls).toHaveLength(0);
    await client.signOut();
  });
  it('uses the existing unified safety contract, not a merged client-side queue', async () => {
    const { client, calls } = await setup({ moderation_read: true, legal_read: true });
    await readEmployeeQueue(client, 'restricted-safety', null, new AbortController().signal);
    expect(calls[0]).toMatchObject({
      name: 'get_admin_safety_work_page_v1',
      args: { p_queue: 'restricted_safety', p_closed: false },
    });
    await client.signOut();
  });
  it('rejects an out-of-scope personal row and commands passed as queries', async () => {
    const { client, calls } = await setup(
      { moderation_read: true },
      { ...item, assigned_to: caseId },
    );
    await expect(
      readEmployeeQueue(client, 'my-work', null, new AbortController().signal),
    ).rejects.toThrow('Personal queue');
    await expect(
      client.read(
        'moderation_read',
        '/staff-workflow/command',
        {},
        (x) => x,
        new AbortController().signal,
      ),
    ).rejects.toThrow('Unsupported');
    expect(calls).toHaveLength(1);
    await client.signOut();
  });
});
