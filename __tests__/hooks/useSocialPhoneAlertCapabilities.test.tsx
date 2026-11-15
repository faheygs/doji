import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSocialPhoneAlertCapabilities } from '../../hooks/useSocialPhoneAlertCapabilities';

let mockViewer: string | undefined = 'viewer', mockEpoch = 0;
const mockRead = jest.fn();
const mockAbort = jest.fn();
jest.mock('../../lib/supabase', () => ({ supabase: {
  rpc: (...args: unknown[]) => { mockRead(...args); return { abortSignal: mockAbort }; },
} }));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: (select: (state: unknown) => unknown) => select({
    session: mockViewer ? { user: { id: mockViewer } } : null,
  }),
  captureProfileAccount: () => {
    const userId = mockViewer, epoch = mockEpoch;
    return { userId, isCurrent: () => userId === mockViewer && epoch === mockEpoch };
  },
}));
let client: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  mockViewer = 'viewer'; mockEpoch = 0;
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(() => client.clear());

test('does not read capabilities without an account', () => {
  mockViewer = undefined;
  const hook = renderHook(() => useSocialPhoneAlertCapabilities(), { wrapper });
  expect(mockRead).not.toHaveBeenCalled(); hook.unmount();
});
test.each([true, false])('reads the explicit capability %s with abort support', async (enabled) => {
  mockAbort.mockResolvedValue({ data: { enabled }, error: null });
  const hook = renderHook(() => useSocialPhoneAlertCapabilities(), { wrapper });
  await waitFor(() => expect(hook.result.current.data).toBe(enabled));
  expect(mockRead).toHaveBeenCalledWith('get_social_phone_alert_capabilities_v1');
  expect(mockAbort.mock.calls[0][0]).toBeDefined(); hook.unmount();
});
test('treats only the missing additive RPC as disabled, not arbitrary read failures', async () => {
  mockAbort.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
  const hook = renderHook(() => useSocialPhoneAlertCapabilities(), { wrapper });
  await waitFor(() => expect(hook.result.current.data).toBe(false));
  expect(hook.result.current.isError).toBe(false);
  mockAbort.mockResolvedValue({ data: null, error: { code: '503' } });
  await act(async () => { await hook.result.current.refetch(); });
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  expect(mockRead).toHaveBeenCalledTimes(2); hook.unmount();
});
test.each([true, false])('uses settings availability %s independently of delivery activation', async (settingsAvailable) => {
  mockAbort.mockResolvedValue({ data: { enabled: !settingsAvailable, settingsAvailable }, error: null });
  const hook = renderHook(() => useSocialPhoneAlertCapabilities(), { wrapper });
  await waitFor(() => expect(hook.result.current.data).toBe(settingsAvailable)); hook.unmount();
});
test('rejects a malformed settings capability rather than treating it as enabled', async () => {
  mockAbort.mockResolvedValue({ data: { enabled: true, settingsAvailable: 'true' }, error: null });
  const hook = renderHook(() => useSocialPhoneAlertCapabilities(), { wrapper });
  await waitFor(() => expect(hook.result.current.isError).toBe(true)); hook.unmount();
});
test('rejects malformed responses', async () => {
  mockAbort.mockResolvedValue({ data: { enabled: 'true' }, error: null });
  const hook = renderHook(() => useSocialPhoneAlertCapabilities(), { wrapper });
  await waitFor(() => expect(hook.result.current.isError).toBe(true)); hook.unmount();
});
test('rejects a late response from a previous session, including switching back', async () => {
  let finish!: (value: unknown) => void;
  mockAbort.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const hook = renderHook(() => useSocialPhoneAlertCapabilities(), { wrapper });
  mockEpoch++;
  await act(async () => finish({ data: { enabled: true }, error: null }));
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  expect(hook.result.current.data).toBeUndefined(); hook.unmount();
});
