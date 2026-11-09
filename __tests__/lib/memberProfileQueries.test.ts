import { QueryClient } from '@tanstack/react-query';
import {
  memberProfileOptions,
  friendshipOptions,
  friendshipMatchesTarget,
  blockStatusOptions,
} from '../../lib/memberProfileQueries';
import { prepareProfileHref } from '../../lib/profileNavigation';
import { fetchPublicProfileView } from '../../lib/profileQueries';
import { supabase } from '../../lib/supabase';
import type { Friendship } from '../../types/database';

jest.mock('../../lib/profileQueries', () => ({ fetchPublicProfileView: jest.fn() }));
jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: {
    getState: () => ({ session: { user: { id: 'me' } }, profile: { username: 'self' } }),
  },
}));
const read = jest.mocked(fetchPublicProfileView);
let client: QueryClient;
const profile = { id: 'target', username: 'target', display_name: 'Test Member' };
beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  (supabase.from as jest.Mock).mockImplementation((table: string) => ({
    select() {
      return this;
    },
    or() {
      return this;
    },
    eq() {
      return this;
    },
    retry() {
      return this;
    },
    abortSignal() {
      return table === 'blocks'
        ? Promise.resolve({ count: 0, error: null })
        : { maybeSingle: async () => ({ data: null, error: null }) };
    },
  }));
});
afterEach(() => client.clear());

test('navigation begins the authorized profile read without waiting, and route entry shares it', async () => {
  let finish!: (value: unknown) => void;
  read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  expect(String(prepareProfileHref(' TARGET ', '/feed', client))).toContain('/member/target');
  expect(read).toHaveBeenCalledTimes(1);
  const routeRead = client.fetchQuery(memberProfileOptions('target', 'me', client));
  finish({ status: 'visible', profile });
  await routeRead;
  expect(read).toHaveBeenCalledTimes(1);
  expect(supabase.from).toHaveBeenCalledWith('friendships');
  await client.fetchQuery(friendshipOptions('me', 'target'));
  await client.fetchQuery(blockStatusOptions('me', 'target'));
  expect(supabase.from).toHaveBeenCalledTimes(2);
  await client.fetchQuery(memberProfileOptions('target', 'me', client));
  expect(read).toHaveBeenCalledTimes(1);
});

test('fresh profile navigation still warms missing privacy and stale relationship reads', async () => {
  read.mockResolvedValueOnce({ status: 'visible', profile });
  await client.fetchQuery(memberProfileOptions('target', 'me', client));
  await Promise.all([
    client.fetchQuery(friendshipOptions('me', 'target')),
    client.fetchQuery(blockStatusOptions('me', 'target')),
  ]);
  client.removeQueries({ queryKey: blockStatusOptions('me', 'target').queryKey, exact: true });
  client.setQueryData(friendshipOptions('me', 'target').queryKey, null, { updatedAt: 1 });
  jest.clearAllMocks();
  prepareProfileHref('target', '/feed', client);
  await Promise.all([
    client.fetchQuery(friendshipOptions('me', 'target')),
    client.fetchQuery(blockStatusOptions('me', 'target')),
  ]);
  expect(read).not.toHaveBeenCalled();
  expect(supabase.from).toHaveBeenCalledWith('blocks');
  expect(supabase.from).toHaveBeenCalledWith('friendships');
  expect(supabase.from).toHaveBeenCalledTimes(2);
});

test('a failed friendship read rejects instead of caching an authoritative none', async () => {
  (supabase.from as jest.Mock).mockImplementation(() => ({
    select() {
      return this;
    },
    or() {
      return this;
    },
    retry() {
      return this;
    },
    abortSignal() {
      return {
        maybeSingle: async () => ({
          data: null,
          error: { message: 'synthetic unavailable', code: 'XX000' },
          status: 500,
        }),
      };
    },
  }));
  await expect(client.fetchQuery(friendshipOptions('me', 'target'))).rejects.toBeDefined();
  expect(client.getQueryData(friendshipOptions('me', 'target').queryKey)).toBeUndefined();
});

test('privacy warming remains viewer/target scoped and skips incomplete identities', async () => {
  expect(blockStatusOptions('me', 'alice').queryKey).not.toEqual(
    blockStatusOptions('other', 'alice').queryKey,
  );
  expect(blockStatusOptions('me', 'alice').queryKey).not.toEqual(
    blockStatusOptions('me', 'bob').queryKey,
  );
  expect(await client.fetchQuery(blockStatusOptions(undefined, 'alice'))).toBe(false);
  expect(supabase.from).not.toHaveBeenCalled();
});

test.each(['blocked_by_user', 'not_found'])(
  'denied %s profiles never prefetch a relationship',
  async (status) => {
    read.mockResolvedValue({ status, profile });
    const result = await client.fetchQuery(memberProfileOptions('target', 'me', client));
    expect(result.profile).toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  },
);

test('different viewers cannot reuse a visibility result', async () => {
  read
    .mockResolvedValueOnce({ status: 'visible', profile })
    .mockResolvedValueOnce({ status: 'blocked_by_user' });
  await client.fetchQuery(memberProfileOptions('target', 'me', client));
  const result = await client.fetchQuery(memberProfileOptions('target', 'other', client));
  expect(read).toHaveBeenCalledTimes(2);
  expect(result.profile).toBeNull();
});

test('cancelled navigation cannot seed dependent relationship reads', async () => {
  let finish!: (value: unknown) => void;
  read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = client.prefetchQuery(memberProfileOptions('target', 'me', client));
  await client.cancelQueries({ queryKey: ['profile', 'target', 'me'] });
  finish({ status: 'visible', profile });
  await pending;
  expect(supabase.from).not.toHaveBeenCalled();
  expect(client.getQueryData(['profile', 'target', 'me'])).toBeUndefined();
});

test('signed-out/missing routes do not read, and own-profile navigation does not prefetch', async () => {
  await client.fetchQuery(memberProfileOptions('target', undefined, client));
  await client.fetchQuery(memberProfileOptions('', 'me', client));
  expect(prepareProfileHref('', '/feed', client)).toBeNull();
  expect(String(prepareProfileHref('self', '/feed', client))).toContain('profile');
  expect(read).not.toHaveBeenCalled();
});

test('relationship readiness distinguishes unknown from authoritative none and validates both parties', () => {
  const relation = (requester: string, addressee: string) =>
    ({ requester_id: requester, addressee_id: addressee }) as Friendship;
  expect(friendshipMatchesTarget(undefined, 'me', 'target')).toBe(false);
  expect(friendshipMatchesTarget(null, 'me', 'target')).toBe(true);
  expect(friendshipMatchesTarget(relation('me', 'target'), 'me', 'target')).toBe(true);
  expect(friendshipMatchesTarget(relation('target', 'me'), 'me', 'target')).toBe(true);
  expect(friendshipMatchesTarget(relation('old', 'me'), 'me', 'target')).toBe(false);
  expect(friendshipMatchesTarget(relation('target', 'other'), 'me', 'target')).toBe(false);
});
