import React, { useEffect } from 'react';
import { Pressable, Text } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider, useInfiniteQuery } from '@tanstack/react-query';
import { ReportFlowProvider, useReportFlow } from '../../contexts/ReportFlowContext';
import { executeCommand } from '../../lib/commandGateway';

const mockSession = { session: { user: { id: 'viewer' } } };
jest.mock('../../stores/useAuthStore', () => ({ useAuthStore: Object.assign(
  (selector: any) => selector(mockSession), { getState: () => mockSession }) }));
jest.mock('../../lib/commandGateway', () => ({ executeCommand: jest.fn() }));
jest.mock('../../lib/queryInvalidationBatcher', () => ({ scheduleQueryInvalidation: jest.fn() }));
const mockBlockReset = jest.fn();
jest.mock('../../hooks/useBlockUser', () => ({ useBlockUser: () => ({ mutate: jest.fn(), reset: mockBlockReset }), useIsBlockedByMe: () => ({ data: false }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('react-native-toast-message', () => ({ show: jest.fn() }));
jest.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ colors: {} }) }));
jest.mock('../../components/ui/Text', () => ({ Text: require('react-native').Text }));
jest.mock('../../components/icons/Icons', () => ({ IconCheck: () => null, IconShield: () => null, IconChevronRight: () => null }));
jest.mock('../../components/ui/Button', () => {
  const { Pressable, Text } = require('react-native');
  return { Button: ({ onPress, children, disabled }: any) => <Pressable onPress={onPress} disabled={disabled}><Text>{children}</Text></Pressable> };
});
jest.mock('../../components/ui/InlineFeedback', () => {
  const { Text } = require('react-native');
  return { InlineFeedback: ({ message }: any) => <Text>{message}</Text> };
});
// Mock only native presentation. The report sheet, flow host, hook and cache are real.
jest.mock('../../components/ui/KeyboardSafeSheet', () => {
  const { View, Pressable, Text } = require('react-native');
  return { KeyboardSafeSheet: ({ visible, children, footer, onClose }: any) => visible ?
    <View><Pressable onPress={onClose}><Text>Close report</Text></Pressable>{children}{footer}</View> : null };
});

function harness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  const unmount = jest.fn();
  function Card() {
    const open = useReportFlow();
    useEffect(() => unmount, []);
    return <Pressable onPress={() => open({ reportedUserId: 'author', postId: 'post-1' })}><Text>Report post</Text></Pressable>;
  }
  function Feed() {
    const query = useInfiniteQuery({ queryKey: ['feed', 'viewer'], enabled: false, queryFn: async () => [],
      initialPageParam: null, getNextPageParam: () => undefined,
      initialData: { pages: [[{ id: 'post-1' }]], pageParams: [null] } });
    return <>{query.data?.pages.flat().map(post => <Card key={post.id} />)}</>;
  }
  const view = render(<QueryClientProvider client={client}><ReportFlowProvider><Feed /></ReportFlowProvider></QueryClientProvider>);
  const start = () => {
    fireEvent.press(view.getByText('Report post'));
    fireEvent.press(view.getByText('Scam, fraud or spam'));
    fireEvent.press(view.getByText('Spam'));
  };
  return { view, client, unmount, start, cleanup: () => { view.unmount(); client.clear(); } };
}

beforeEach(() => { jest.clearAllMocks(); mockSession.session.user.id = 'viewer'; });

test('removing the owning feed row preserves pending feedback and confirmed completion', async () => {
  let finish!: (value: unknown) => void;
  (executeCommand as jest.Mock).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const h = harness(); h.start();
  await waitFor(() => expect(h.unmount).toHaveBeenCalledTimes(1));
  expect(h.view.getByText('Sending your report…')).toBeTruthy();
  fireEvent.press(h.view.getByText('Close report'));
  expect(h.view.getByText('Sending your report…')).toBeTruthy();
  await act(async () => finish({ error: null, data: { id: 'receipt' } }));
  expect(h.view.getByText('Thanks for letting us know')).toBeTruthy();
  expect(h.view.getByText('Block this account')).toBeTruthy();
  fireEvent.press(h.view.getByText('Done'));
  expect(h.view.queryByText('Thanks for letting us know')).toBeNull();
  h.cleanup();
});

test('ambiguous failure restores the row, keeps error visible and replays the same receipt key', async () => {
  (executeCommand as jest.Mock).mockResolvedValueOnce({ error: { message: 'timeout' } }).mockResolvedValue({ error: null });
  const h = harness(); h.start();
  await waitFor(() => expect(h.view.getByText('Could not submit this report. Please try again.')).toBeTruthy());
  expect(h.view.getByText('Report post')).toBeTruthy();
  fireEvent.press(h.view.getByText('Spam'));
  await waitFor(() => expect(h.view.getByText('Thanks for letting us know')).toBeTruthy());
  const calls = (executeCommand as jest.Mock).mock.calls;
  expect(calls).toHaveLength(2);
  expect(calls[1][1].p_idempotency_key).toBe(calls[0][1].p_idempotency_key);
  h.cleanup();
});

test('late failed report cannot restore the previous account feed after sign-out', async () => {
  let finish!: (value: unknown) => void;
  (executeCommand as jest.Mock).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const h = harness(); h.start();
  await waitFor(() => expect(executeCommand).toHaveBeenCalledTimes(1));
  mockSession.session.user.id = 'different-member';
  h.client.clear();
  await act(async () => finish({ error: { message: 'timeout' } }));
  expect(h.client.getQueryData(['feed', 'viewer'])).toBeUndefined();
  h.cleanup();
});

test('closing and reopening after an ambiguous response reuses the same receipt key', async () => {
  (executeCommand as jest.Mock).mockResolvedValueOnce({ error: { message: 'timeout' } }).mockResolvedValue({ error: null });
  const h = harness(); h.start();
  await waitFor(() => expect(h.view.getByText('Could not submit this report. Please try again.')).toBeTruthy());
  fireEvent.press(h.view.getByText('Close report'));
  h.start();
  await waitFor(() => expect(h.view.getByText('Thanks for letting us know')).toBeTruthy());
  const calls = (executeCommand as jest.Mock).mock.calls;
  expect(calls).toHaveLength(2);
  expect(calls[1][1].p_idempotency_key).toBe(calls[0][1].p_idempotency_key);
  h.cleanup();
});

test('a failed report never overwrites newer feed data with an old snapshot', async () => {
  let finish!: (value: unknown) => void;
  (executeCommand as jest.Mock).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const h = harness(); h.start();
  await waitFor(() => expect(executeCommand).toHaveBeenCalledTimes(1));
  const newer = { pages: [[{ id: 'new-post' }]], pageParams: [null] };
  act(() => h.client.setQueryData(['feed', 'viewer'], newer));
  await act(async () => finish({ error: { message: 'timeout' } }));
  expect(h.client.getQueryData(['feed', 'viewer'])).toEqual(newer);
  h.cleanup();
});
