import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDojiContributor } from '../../hooks/useDojiContributor';
import { readDojiContributor, type DojiContributor } from '../../lib/dojiContributor';
let mockViewer = 'viewer',
  mockEpoch = 0,
  mockEnabled = true;
jest.mock('../../lib/firstDoji', () => ({ firstDojiEnabled: () => mockEnabled }));
jest.mock('../../lib/dojiContributor', () => ({ readDojiContributor: jest.fn() }));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: (select: (state: { session: { user: { id: string } } }) => unknown) =>
    select({ session: { user: { id: mockViewer } } }),
  captureProfileAccount: () => {
    const userId = mockViewer,
      epoch = mockEpoch;
    return { userId, isCurrent: () => userId === mockViewer && epoch === mockEpoch };
  },
}));
const author: DojiContributor = {
  id: 'author',
  username: 'author',
  display_name: 'Name',
  avatar_url: null,
  equipped_border_key: null,
};
let client: QueryClient;
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
test('gates missing/hidden/mismatched scope and never borrows another event or viewer', async () => {
  jest.mocked(readDojiContributor).mockResolvedValue(author);
  const hook = renderHook(
    ({ eventId, visible }: { eventId: string | undefined; visible: boolean }) =>
      useDojiContributor(eventId, visible),
    { wrapper, initialProps: { eventId: undefined as string | undefined, visible: false } },
  );
  expect(readDojiContributor).not.toHaveBeenCalled();
  hook.rerender({ eventId: 'event', visible: true });
  await waitFor(() => expect(hook.result.current.data).toEqual(author));
  jest.mocked(readDojiContributor).mockImplementation(() => new Promise(() => {}));
  hook.rerender({ eventId: 'new', visible: true });
  expect(hook.result.current.data).toBeUndefined();
  mockViewer = 'other';
  hook.rerender({ eventId: 'event', visible: true });
  expect(hook.result.current.data).toBeUndefined();
  mockEnabled = false;
  hook.rerender({ eventId: 'event', visible: true });
  expect(hook.result.current.data).toBeNull();
  hook.unmount();
});
test('late prior-session results cannot establish attribution', async () => {
  let finish!: (value: DojiContributor) => void;
  jest.mocked(readDojiContributor).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hook = renderHook(() => useDojiContributor('event'), { wrapper });
  mockEpoch++;
  await act(async () => finish(author));
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  expect(hook.result.current.data).toBeNull();
  hook.unmount();
});
test('failed attribution hides credit without retrying or blocking the Doji', async () => {
  jest.mocked(readDojiContributor).mockRejectedValue(new Error('Read unavailable'));
  const hook = renderHook(() => useDojiContributor('event'), { wrapper });
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  expect(hook.result.current.data).toBeNull();
  expect(readDojiContributor).toHaveBeenCalledTimes(1);
  hook.unmount();
});
