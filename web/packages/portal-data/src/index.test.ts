import { describe, expect, it } from 'vitest';
import {
  createPortalQueryClient,
  disposePortalCache,
  invalidatePortalAreas,
  isCurrentSession,
  portalKey,
  type PortalSession,
} from './index';

const employee: PortalSession = { realm: 'employee', subject: 'employee-one', epoch: '1' };
describe('portal cache isolation', () => {
  it('does not poll or blindly retry commands or refetch on browser focus', () => {
    const options = createPortalQueryClient().getDefaultOptions();
    expect(options.queries?.refetchInterval).toBe(false);
    expect(options.queries?.retry).toBe(false);
    expect(options.queries?.refetchOnWindowFocus).toBe(false);
    expect(options.mutations?.retry).toBe(false);
  });
  it('targets only the exact realm, subject, epoch and area', async () => {
    const client = createPortalQueryClient();
    const keys = [
      portalKey(employee, 'work', { cursor: 'a' }),
      portalKey(employee, 'work', { cursor: 'b' }),
      portalKey(employee, 'audit'),
      portalKey({ ...employee, realm: 'business' }, 'work'),
      portalKey({ ...employee, subject: 'another-employee' }, 'work'),
      portalKey({ ...employee, epoch: '2' }, 'work'),
    ];
    for (const key of keys) client.setQueryData(key, { id: 'unchanged' });
    await invalidatePortalAreas(client, employee, ['work', 'work']);
    expect(keys.map((key) => client.getQueryState(key)?.isInvalidated)).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(client.getQueryData(keys[0]!)).toEqual({ id: 'unchanged' });
    await disposePortalCache(client);
  });
  it('rejects stale and cross-account sessions', () => {
    expect(isCurrentSession(employee, { ...employee })).toBe(true);
    expect(isCurrentSession(null, employee)).toBe(false);
    for (const other of [
      { ...employee, epoch: '2' },
      { ...employee, subject: 'two' },
      { ...employee, realm: 'business' as const },
    ])
      expect(isCurrentSession(other, employee)).toBe(false);
  });
  it('aborts inflight reads and removes both read and mutation data on disposal', async () => {
    const client = createPortalQueryClient();
    let aborted = false;
    const pending = client
      .fetchQuery({
        queryKey: portalKey(employee, 'work'),
        queryFn: ({ signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              aborted = true;
              reject(new Error('aborted'));
            });
          }),
      })
      .catch(() => undefined);
    client.getMutationCache().build(client, { mutationFn: async () => 'test' });
    await disposePortalCache(client);
    await pending;
    expect(aborted).toBe(true);
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(client.getMutationCache().getAll()).toHaveLength(0);
  });
});
