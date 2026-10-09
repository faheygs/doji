import { describe, it, expect, vi } from 'vitest';
import { createEmployeeSession } from './employee-session';
import { prepareAnnouncement, emptyAnnouncement } from '../../../apps/admin/src/announcement';
import { announcementFixture, announcementId } from '../../../tests/announcement-fixture';

const actor = '10000000-0000-4000-8000-000000000001';
const key = '10000000-0000-4000-8000-000000000002';
const intent = () =>
  prepareAnnouncement(
    { ...emptyAnnouncement, title: 'Hello', message: 'World', end: Date.parse('2035-01-01') },
    'publish',
    Date.now(),
    null,
    key,
  );
function setup(
  handler: (body: { name: string; args: Record<string, unknown> }) => Promise<Response>,
  enabled = true,
  manage = true,
) {
  const upstream = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/auth/logout')) return Response.json({ signedIn: false });
    if (url.endsWith('/api/session'))
      return Response.json({
        signedIn: true,
        assurance: 'aal2',
        csrf: 'c'.repeat(43),
        operator: {
          user_id: actor,
          display_name: 'Synthetic',
          capabilities: { operations_read: true, operator_manage: manage },
        },
      });
    return handler(JSON.parse(String(init?.body)));
  });
  return {
    upstream,
    client: createEmployeeSession(
      { independentEmployeeIdentity: true, announcementComposeEnabled: enabled },
      { origin: 'https://admin.dojipro.com', upstream },
    ),
  };
}
const receipt = () => ({
  item: null,
  replayed: false,
  command: {
    id: announcementId,
    action: 'publish',
    request_id: key,
    version: 'b'.repeat(32),
    state: 'published',
    display_state: 'live',
  },
});
describe('announcement command session flow', () => {
  it('is default-off even for an authorized writer', async () => {
    const { client, upstream } = setup(async () => Response.json({}), false);
    await client.restore();
    expect(() => client.getAnnouncementFlow()).toThrow('unavailable');
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it('keeps one immutable request across an uncertain response and duplicate clicks', async () => {
    const calls: unknown[] = [];
    const { client } = setup(async (body) => {
      calls.push(body);
      return calls.length === 1 ? Response.json({}, { status: 503 }) : Response.json(receipt());
    });
    await client.restore();
    const flow = client.getAnnouncementFlow();
    flow.prepare(intent());
    await Promise.all([flow.submit(), flow.submit()]);
    expect(calls).toHaveLength(1);
    expect(flow.getSnapshot().phase).toBe('uncertain');
    flow.prepare({ ...intent(), p_request_id: crypto.randomUUID() });
    flow.dismiss();
    expect(client.getAnnouncementFlow()).toBe(flow);
    await flow.submit();
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(calls[1]);
    expect(flow.getSnapshot().phase).toBe('complete');
    expect(flow.getSnapshot().outcome?.id).toBe(announcementId);
  });
  it('rejects incorrect receipts as uncertain, without automatic retry', async () => {
    const { client, upstream } = setup(async () =>
      Response.json({
        ...receipt(),
        command: { ...receipt().command, request_id: crypto.randomUUID() },
      }),
    );
    await client.restore();
    const flow = client.getAnnouncementFlow();
    flow.prepare(intent());
    await flow.submit();
    expect(flow.getSnapshot().phase).toBe('uncertain');
    expect(upstream).toHaveBeenCalledTimes(2);
  });
  it('accepts an original publication receipt whose current record was later cancelled', async () => {
    const { client } = setup(async () =>
      Response.json({
        ...receipt(),
        replayed: true,
        item: { ...announcementFixture(), state: 'cancelled', display_state: 'cancelled' },
      }),
    );
    await client.restore();
    const flow = client.getAnnouncementFlow();
    flow.prepare(intent());
    await flow.submit();
    expect(flow.getSnapshot().phase).toBe('complete');
    expect(flow.getSnapshot().message).not.toMatch(/\blive\b/i);
  });
  it('blocks stale-version rejection from blind retry', async () => {
    const { client, upstream } = setup(async () => Response.json({}, { status: 409 }));
    await client.restore();
    const flow = client.getAnnouncementFlow();
    flow.prepare(intent());
    await flow.submit();
    await flow.submit();
    expect(flow.getSnapshot().phase).toBe('rejected');
    expect(upstream).toHaveBeenCalledTimes(2);
  });
  it('denies read-only employees before a write', async () => {
    const { client, upstream } = setup(async () => Response.json(receipt()), true, false);
    await client.restore();
    const flow = client.getAnnouncementFlow();
    flow.prepare(intent());
    await flow.submit();
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it('clears pending intent on sign-out and prevents late success from crossing sessions', async () => {
    let release!: (value: Response) => void;
    const { client } = setup(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    await client.restore();
    const flow = client.getAnnouncementFlow();
    flow.prepare(intent());
    const pending = flow.submit();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const logout = client.signOut();
    release(Response.json(receipt()));
    await Promise.all([pending, logout]);
    expect(flow.getSnapshot().intent).toBeNull();
    expect(flow.getSnapshot().outcome).toBeNull();
    expect(() => client.getAnnouncementFlow()).toThrow();
  });
  it('cancels with the exact existing audited command and an explicit reason', async () => {
    const calls: unknown[] = [];
    const { client } = setup(async (body) => {
      calls.push(body);
      return Response.json({
        ...announcementFixture(),
        state: 'cancelled',
        display_state: 'cancelled',
      });
    });
    await client.restore();
    const flow = client.getAnnouncementFlow();
    expect(() =>
      flow.prepare({
        p_action: 'cancel',
        p_id: announcementId,
        p_version: 'a'.repeat(32),
        p_request_id: key,
        p_reason: '',
      }),
    ).toThrow();
    flow.prepare({
      p_action: 'cancel',
      p_id: announcementId,
      p_version: 'a'.repeat(32),
      p_request_id: key,
      p_reason: 'Scheduled in error.',
    });
    await flow.submit();
    expect(calls).toEqual([
      {
        name: 'admin_editorial_command_v1',
        args: {
          p_kind: 'announcements',
          p_action: 'cancel',
          p_id: announcementId,
          p_version: 'a'.repeat(32),
          p_input: {},
          p_reason: 'Scheduled in error.',
          p_idempotency_key: key,
        },
      },
    ]);
    expect(flow.getSnapshot().phase).toBe('complete');
  });
});
