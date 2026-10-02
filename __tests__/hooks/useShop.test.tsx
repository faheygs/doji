import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Profile, ShopItem } from '../../types/database';
import {
  useShopCatalog,
  useOwnedShopItems,
  usePurchaseShopItem,
  useEquipShopItem,
  isShopItemOwned,
} from '../../hooks/useShop';
import { supabase } from '../../lib/supabase';
import { executeCommand } from '../../lib/commandGateway';
import { scheduleQueryInvalidation } from '../../lib/queryInvalidationBatcher';

const mockSetProfile = jest.fn((profile: Profile | null) => {
  mockState.profile = profile;
});
const mockFetchProfile = jest.fn();
let mockState: {
  session: { user: { id: string } } | null;
  profile: Profile | null;
  setProfile: typeof mockSetProfile;
  fetchProfile: typeof mockFetchProfile;
};
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: Object.assign((select: (s: unknown) => unknown) => select(mockState), {
    getState: () => mockState,
  }),
}));
jest.mock('../../lib/supabase');
jest.mock('../../lib/commandGateway', () => ({ executeCommand: jest.fn() }));
jest.mock('../../lib/queryInvalidationBatcher', () => ({ scheduleQueryInvalidation: jest.fn() }));
const from = supabase.from as jest.Mock;
const command = jest.mocked(executeCommand);
const baseProfile = {
  id: 'member-a',
  username: 'member_a',
  sparks: 750,
  accent_theme: 'doji_orange',
  equipped_border_key: null,
  equipped_title_key: null,
} as Profile;
const item = (kind: ShopItem['kind'] = 'theme'): ShopItem => ({
  key: `test_${kind}`,
  kind,
  name: 'Test item',
  price: 500,
  sort_order: 1,
  metadata: {},
  is_active: true,
  created_at: '2026-10-01T12:00:00Z',
});
const key = ['ownedShopItems', 'member-a'];
let client: QueryClient;
function setup<T>(hook: () => T) {
  return renderHook(() => hook(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}
function query(data: unknown, error: unknown = null, status = 200) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    retry: jest.fn(),
    abortSignal: jest.fn().mockResolvedValue({ data, error, status }),
  };
  from.mockReturnValue(chain);
  return chain;
}
function deferredCommand() {
  let resolve!: (value: Awaited<ReturnType<typeof executeCommand>>) => void;
  const pending = new Promise<Awaited<ReturnType<typeof executeCommand>>>((done) => {
    resolve = done;
  });
  command.mockReturnValueOnce(pending);
  return resolve;
}
beforeEach(() => {
  jest.clearAllMocks();
  notifyManager.setScheduler((callback) => callback());
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  mockState = {
    session: { user: { id: 'member-a' } },
    profile: { ...baseProfile },
    setProfile: mockSetProfile,
    fetchProfile: mockFetchProfile,
  };
  mockFetchProfile.mockResolvedValue(undefined);
  command.mockResolvedValue({ data: { item_key: item().key, sparks: 250 }, error: null } as never);
});
afterEach(() => {
  cleanup();
  client.clear();
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
});

test.each([null, [], [item()]])(
  'catalog response %j uses bounded public fields and active ordering',
  async (data) => {
    const chain = query(data);
    const { result } = setup(useShopCatalog);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(data ?? []);
    expect(from).toHaveBeenCalledWith('shop_items');
    expect(chain.select).toHaveBeenCalledWith(
      'key, kind, name, price, sort_order, metadata, is_active, created_at',
    );
    expect(chain.eq).toHaveBeenCalledWith('is_active', true);
    expect(chain.order).toHaveBeenCalledWith('sort_order', { ascending: true });
    expect(chain.limit).toHaveBeenCalledWith(100);
    expect(chain.retry).toHaveBeenCalledWith(false);
  },
);

test.each([
  null,
  [],
  [{ user_id: 'member-a', item_key: 'test_theme', purchased_at: '2026-10-01' }],
])('ownership response %j is account scoped and bounded', async (data) => {
  const chain = query(data);
  const { result } = setup(() => useOwnedShopItems('member-a'));
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toEqual(data ?? []);
  expect(from).toHaveBeenCalledWith('user_shop_items');
  expect(chain.select).toHaveBeenCalledWith('user_id, item_key, purchased_at');
  expect(chain.eq).toHaveBeenCalledWith('user_id', 'member-a');
  expect(chain.limit).toHaveBeenCalledWith(100);
  expect(client.getQueryData(key)).toEqual(data ?? []);
});

test('ownership does not fetch without a member, including manual refresh', async () => {
  const { result } = setup(() => useOwnedShopItems(undefined));
  expect(result.current.fetchStatus).toBe('idle');
  await act(async () => {
    await result.current.refetch();
  });
  expect(result.current.data).toEqual([]);
  expect(from).not.toHaveBeenCalled();
});

test.each(['catalog', 'owned'] as const)(
  '%s failure preserves HTTP status, not empty success',
  async (kind) => {
    query(null, { message: 'unavailable' }, 504);
    const useRead = kind === 'catalog' ? useShopCatalog : () => useOwnedShopItems('member-a');
    const { result } = setup<
      ReturnType<typeof useShopCatalog> | ReturnType<typeof useOwnedShopItems>
    >(useRead);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ status: 504 });
    expect(result.current.data).toBeUndefined();
  },
);

test.each([undefined, [], [{ user_id: 'member-a', item_key: 'other', purchased_at: '' }]])(
  'ownership helper does not invent ownership for %j',
  (owned) => {
    expect(isShopItemOwned(owned, 'test_theme')).toBe(false);
  },
);
test('ownership helper matches the exact key', () => {
  expect(
    isShopItemOwned(
      [{ user_id: 'member-a', item_key: 'test_theme', purchased_at: '' }],
      'test_theme',
    ),
  ).toBe(true);
});

describe.each(['purchase', 'equip'] as const)('%s mutations', (operation) => {
  const useAction = operation === 'purchase' ? usePurchaseShopItem : useEquipShopItem;
  test.each(['theme', 'border', 'title'] as const)(
    'optimistic %s changes stay local until the atomic result',
    async (kind) => {
      const selected = item(kind);
      client.setQueryData(['shopCatalog'], [selected]);
      client.setQueryData(key, []);
      const finish = deferredCommand();
      const { result } = setup(useAction);
      let pending!: Promise<unknown>;
      await act(async () => {
        pending = result.current.mutateAsync(selected.key);
      });
      expect(mockState.profile).toMatchObject({
        [kind === 'theme'
          ? 'accent_theme'
          : kind === 'border'
            ? 'equipped_border_key'
            : 'equipped_title_key']: selected.key,
        sparks: operation === 'purchase' ? 250 : 750,
      });
      expect(client.getQueryData(key)).toEqual(
        operation === 'purchase'
          ? [{ user_id: 'member-a', item_key: selected.key, purchased_at: expect.any(String) }]
          : [],
      );
      expect(mockFetchProfile).not.toHaveBeenCalled();
      await act(async () => {
        finish({ data: { item_key: selected.key, sparks: 249 }, error: null } as never);
        await pending;
      });
      expect(command).toHaveBeenCalledTimes(1);
      expect(command).toHaveBeenCalledWith(
        `${operation}_shop_item`,
        operation === 'purchase'
          ? { p_item_key: selected.key }
          : { p_item_key: selected.key, p_idempotency_key: expect.stringMatching(/^shop-equip:/) },
      );
      expect(mockState.profile?.sparks).toBe(operation === 'purchase' ? 249 : 750);
      expect(mockFetchProfile).toHaveBeenCalledWith('member-a');
      expect(scheduleQueryInvalidation).toHaveBeenCalledWith(client, [
        'ownedShopItems',
        'profile',
        'feed',
      ]);
      expect(from).not.toHaveBeenCalled();
    },
  );

  test.each(['envelope', 'transport'] as const)(
    '%s failure restores profile and cached ownership',
    async (failure) => {
      client.setQueryData(['shopCatalog'], [item()]);
      client.setQueryData(key, []);
      if (failure === 'envelope')
        command.mockResolvedValueOnce({ data: null, error: new Error('failed') } as never);
      else command.mockRejectedValueOnce(new Error('failed'));
      const { result } = setup(useAction);
      await act(async () => {
        await expect(result.current.mutateAsync(item().key)).rejects.toThrow('failed');
      });
      expect(mockState.profile).toEqual(baseProfile);
      expect(client.getQueryData(key)).toEqual([]);
      expect(mockFetchProfile).toHaveBeenCalledWith('member-a');
    },
  );

  test.each(['catalog', 'profile'] as const)(
    'missing %s leaves optimistic state untouched',
    async (missing) => {
      if (missing === 'profile') {
        mockState.profile = null;
        client.setQueryData(['shopCatalog'], [item()]);
      }
      const { result } = setup(useAction);
      await act(async () => {
        await result.current.mutateAsync(item().key);
      });
      expect(client.getQueryData(key)).toBeUndefined();
      expect(mockState.profile).toEqual(
        missing === 'profile'
          ? null
          : { ...baseProfile, sparks: operation === 'purchase' ? 250 : 750 },
      );
    },
  );

  test('signed-out action never sends a command', async () => {
    mockState.session = null;
    mockState.profile = null;
    const { result } = setup(useAction);
    await act(async () => {
      await expect(result.current.mutateAsync(item().key)).rejects.toThrow('Not authenticated');
    });
    expect(command).not.toHaveBeenCalled();
    expect(mockFetchProfile).not.toHaveBeenCalled();
  });

  test('a stale callback cannot send a command after an account switch', async () => {
    client.setQueryData(['shopCatalog'], [item()]);
    const { result } = setup(useAction);
    mockState.session = { user: { id: 'member-b' } };
    await act(async () => {
      await expect(result.current.mutateAsync(item().key)).rejects.toThrow('Not authenticated');
    });
    expect(command).not.toHaveBeenCalled();
    expect(mockSetProfile).not.toHaveBeenCalled();
    expect(mockFetchProfile).not.toHaveBeenCalled();
  });

  test('a profile belonging to another member is not optimistically edited', async () => {
    client.setQueryData(['shopCatalog'], [item()]);
    const otherProfile = { ...baseProfile, id: 'member-b' };
    mockState.profile = otherProfile;
    const { result } = setup(useAction);
    await act(async () => {
      await result.current.mutateAsync(item().key);
    });
    expect(mockState.profile).toEqual(otherProfile);
    expect(mockSetProfile).not.toHaveBeenCalled();
    expect(client.getQueryData(key)).toBeUndefined();
  });

  test.each([true, false])(
    'late result success=%s after logout cannot restore the cleared profile',
    async (success) => {
      client.setQueryData(['shopCatalog'], [item()]);
      const finish = deferredCommand();
      const { result, rerender } = setup(useAction);
      let pending!: Promise<unknown>;
      await act(async () => {
        pending = result.current.mutateAsync(item().key).catch((error) => error);
      });
      mockState.session = null;
      mockState.profile = null;
      client.clear();
      mockSetProfile.mockClear();
      rerender({});
      await act(async () => {
        finish({
          data: success ? { item_key: item().key, sparks: 250 } : null,
          error: success ? null : new Error('failed'),
        } as never);
        await pending;
      });
      expect(mockState.profile).toBeNull();
      expect(mockSetProfile).not.toHaveBeenCalled();
      expect(mockFetchProfile).not.toHaveBeenCalled();
      expect(scheduleQueryInvalidation).not.toHaveBeenCalled();
      expect(client.getQueryData(key)).toBeUndefined();
    },
  );

  test.each([true, false])(
    'late result success=%s cannot write another account profile or refill the old cache',
    async (success) => {
      client.setQueryData(['shopCatalog'], [item()]);
      client.setQueryData(key, []);
      const finish = deferredCommand();
      const { result, rerender } = setup(useAction);
      let pending!: Promise<unknown>;
      await act(async () => {
        pending = result.current.mutateAsync(item().key).catch((error) => error);
      });
      const nextProfile = { ...baseProfile, id: 'member-b', username: 'member_b', sparks: 900 };
      mockState.session = { user: { id: 'member-b' } };
      mockState.profile = nextProfile;
      client.clear();
      mockSetProfile.mockClear();
      rerender({});
      await act(async () => {
        finish({
          data: success ? { item_key: item().key, sparks: 250 } : null,
          error: success ? null : new Error('failed'),
        } as never);
        await pending;
      });
      expect(mockState.profile).toEqual(nextProfile);
      expect(mockSetProfile).not.toHaveBeenCalled();
      expect(mockFetchProfile).not.toHaveBeenCalled();
      expect(scheduleQueryInvalidation).not.toHaveBeenCalled();
      expect(client.getQueryData(key)).toBeUndefined();
    },
  );
});

test('failed purchase with previously unknown ownership removes optimistic ownership', async () => {
  client.setQueryData(['shopCatalog'], [item()]);
  command.mockRejectedValueOnce(new Error('offline'));
  const { result } = setup(usePurchaseShopItem);
  await act(async () => {
    await expect(result.current.mutateAsync(item().key)).rejects.toThrow('offline');
  });
  expect(client.getQueryData(key)).toBeUndefined();
  expect(mockState.profile).toEqual(baseProfile);
});

test('already owned purchase never duplicates the ownership row', async () => {
  client.setQueryData(['shopCatalog'], [item()]);
  const owned = [{ user_id: 'member-a', item_key: item().key, purchased_at: '2026-10-01' }];
  client.setQueryData(key, owned);
  const { result } = setup(usePurchaseShopItem);
  await act(async () => {
    await result.current.mutateAsync(item().key);
  });
  expect(client.getQueryData(key)).toEqual(owned);
});
