import { QueryClient } from '@tanstack/react-query';
import {
  memberProfileOptions,
  friendshipOptions,
  friendshipMatchesTarget,
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
      return { maybeSingle: async () => ({ data: null, error: null }) };
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
  expect(supabase.from).toHaveBeenCalledTimes(1);
  await client.fetchQuery(memberProfileOptions('target', 'me', client));
  expect(read).toHaveBeenCalledTimes(1);
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
