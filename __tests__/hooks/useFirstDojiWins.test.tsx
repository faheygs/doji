import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFirstDojiWins } from '../../hooks/useFirstDojiWins';
import { supabase } from '../../lib/supabase';
import { runMemberRead } from '../../lib/runMemberRead';

let mockViewer: string | undefined = 'viewer',
  mockEpoch = 0;
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: jest.fn(() => ({})) } }));
jest.mock('../../lib/runMemberRead', () => ({ runMemberRead: jest.fn() }));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: (select: (state: { session: { user: { id: string } } | null }) => unknown) =>
    select({ session: mockViewer ? { user: { id: mockViewer } } : null }),
  captureProfileAccount: () => {
    const userId = mockViewer,
      epoch = mockEpoch;
    return { userId, isCurrent: () => userId === mockViewer && epoch === mockEpoch };
  },
}));
let client: QueryClient;
const read = runMemberRead as jest.MockedFunction<() => Promise<{ data: unknown; error: null }>>;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  jest.clearAllMocks();
  mockViewer = 'viewer';
  mockEpoch = 0;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  read.mockResolvedValue({ data: 9, error: null });
});
afterEach(() => client.clear());

test('does not call a missing backend and reads only the signed-in member when installed', async () => {
  const hook = renderHook(({ installed }: { installed: boolean }) => useFirstDojiWins(installed), {
    wrapper,
    initialProps: { installed: false },
  });
  expect(supabase.rpc).not.toHaveBeenCalled();
  expect(hook.result.current.data).toBeUndefined();
  hook.rerender({ installed: true });
  await waitFor(() => expect(hook.result.current.data).toBe(9));
  expect(supabase.rpc).toHaveBeenCalledWith('get_my_first_doji_wins_v1');
  expect(read).toHaveBeenCalledWith(expect.anything(), expect.any(AbortSignal));
  hook.rerender({ installed: false });
  expect(hook.result.current.data).toBeUndefined();
  hook.unmount();
});
test('signed-out and different-account views never borrow a cached count', async () => {
  const hook = renderHook(() => useFirstDojiWins(true), { wrapper });
  await waitFor(() => expect(hook.result.current.data).toBe(9));
  mockViewer = undefined;
  hook.rerender({});
  expect(hook.result.current.data).toBeUndefined();
  expect(read).toHaveBeenCalledTimes(1);
  mockViewer = 'other';
  read.mockResolvedValue({ data: 0, error: null });
  hook.rerender({});
  await waitFor(() => expect(hook.result.current.data).toBe(0));
  hook.unmount();
});
test('late account-lifetime responses cannot be published', async () => {
  let finish!: (value: { data: number; error: null }) => void;
  read.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hook = renderHook(() => useFirstDojiWins(true), { wrapper });
  mockEpoch++;
  await act(async () => finish({ data: 100, error: null }));
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  expect(hook.result.current.data).toBeUndefined();
  hook.unmount();
});
test.each([-1, 1.2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null, '10'])(
  'rejects invalid count %s without retry or false zero',
  async (value) => {
    read.mockResolvedValue({ data: value, error: null });
    const hook = renderHook(() => useFirstDojiWins(true), { wrapper });
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(hook.result.current.data).toBeUndefined();
    expect(read).toHaveBeenCalledTimes(1);
    hook.unmount();
  },
);
test('badge invalidation refreshes intermediate wins and a failed refresh stays unknown', async () => {
  const hook = renderHook(() => useFirstDojiWins(true), { wrapper });
  await waitFor(() => expect(hook.result.current.data).toBe(9));
  read.mockResolvedValue({ data: 10, error: null });
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['userBadgeProgress'] });
  });
  await waitFor(() => expect(hook.result.current.data).toBe(10));
  read.mockRejectedValue(new Error('Unavailable'));
  await act(async () => {
    await hook.result.current.refetch();
  });
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  expect(hook.result.current.data).toBeUndefined();
  hook.unmount();
});
