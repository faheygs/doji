import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFirstDoji } from '../../hooks/useFirstDoji';
import { readFirstDoji, type FirstDoji } from '../../lib/firstDoji';
let mockViewer = 'viewer',
  mockEpoch = 0,
  mockEnabled = true;
jest.mock('../../lib/firstDoji', () => ({
  firstDojiEnabled: () => mockEnabled,
  readFirstDoji: jest.fn(),
}));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: (select: (state: { session: { user: { id: string } } }) => unknown) =>
    select({ session: { user: { id: mockViewer } } }),
  captureProfileAccount: () => {
    const userId = mockViewer,
      epoch = mockEpoch;
    return { userId, isCurrent: () => userId === mockViewer && epoch === mockEpoch };
  },
}));
let client: QueryClient;
const winner: FirstDoji = {
  daily_event_id: 'event',
  audience: 'everyone',
  completed_at: '2026-11-10T00:00:00Z',
  profile: {
    id: 'first',
    username: 'first',
    display_name: '',
    avatar_url: null,
    equipped_border_key: null,
  },
};
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  mockViewer = 'viewer';
  mockEpoch = 0;
  mockEnabled = true;
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(() => client.clear());
test('reads only the unlocked enabled occurrence and never borrows another audience', async () => {
  jest.mocked(readFirstDoji).mockResolvedValue(winner);
  const hook = renderHook(
    ({ unlocked, audience }: { unlocked: boolean; audience: 'friends' | 'everyone' }) =>
      useFirstDoji('event', audience, unlocked),
    { wrapper, initialProps: { unlocked: false, audience: 'everyone' } },
  );
  expect(readFirstDoji).not.toHaveBeenCalled();
  hook.rerender({ unlocked: true, audience: 'everyone' });
  await waitFor(() => expect(hook.result.current.data).toEqual(winner));
  jest.mocked(readFirstDoji).mockImplementation(() => new Promise(() => {}));
  hook.rerender({ unlocked: true, audience: 'friends' });
  expect(hook.result.current.data).toBeUndefined();
  mockEnabled = false;
  hook.rerender({ unlocked: true, audience: 'everyone' });
  expect(hook.result.current.data).toBeNull();
  hook.unmount();
});
test('late account results are rejected, including switching back', async () => {
  let finish!: (value: FirstDoji) => void;
  jest.mocked(readFirstDoji).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hook = renderHook(() => useFirstDoji('event', 'everyone', true), { wrapper });
  mockEpoch++;
  await act(async () => finish(winner));
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  expect(hook.result.current.data).toBeNull();
  hook.unmount();
});
test('a failed refresh never displays a now-unverified winner or retries automatically', async () => {
  jest.mocked(readFirstDoji).mockResolvedValue(winner);
  const hook = renderHook(() => useFirstDoji('event', 'everyone', true), { wrapper });
  await waitFor(() => expect(hook.result.current.data).toEqual(winner));
  jest.mocked(readFirstDoji).mockRejectedValue(new Error('Read unavailable'));
  await act(async () => {
    await hook.result.current.refetch();
  });
  await waitFor(() => expect(hook.result.current.data).toBeNull());
  expect(readFirstDoji).toHaveBeenCalledTimes(2);
  hook.unmount();
});
