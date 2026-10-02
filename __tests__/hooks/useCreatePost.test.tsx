import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react-native';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCreatePost } from '../../hooks/useUserEvent';
import { executeCommand } from '../../lib/commandGateway';
import { filterContent } from '../../lib/contentFilter';
import { uploadPostMedia, uploadPostVideo } from '../../utils/upload';
import { getCommittedPostReceipt } from '../../lib/dojiWriteReceipt';
import { scheduleQueryInvalidation } from '../../lib/queryInvalidationBatcher';

let mockSession: { user: { id: string } } | null;
const mockFetchProfile = jest.fn();
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ session: mockSession, fetchProfile: mockFetchProfile }),
}));
jest.mock('../../lib/supabase');
jest.mock('../../utils/upload', () => ({ uploadPostMedia: jest.fn(), uploadPostVideo: jest.fn() }));
jest.mock('../../lib/commandGateway', () => ({ executeCommand: jest.fn() }));
jest.mock('../../lib/contentFilter', () => ({ filterContent: jest.fn() }));
jest.mock('../../lib/dojiWriteReceipt', () => ({ getCommittedPostReceipt: jest.fn() }));
jest.mock('../../lib/queryInvalidationBatcher', () => ({ scheduleQueryInvalidation: jest.fn() }));

const command = jest.mocked(executeCommand);
const key = ['userEvent', 'today', 'member'];
const payload = {
  userEventId: 'event',
  caption: '',
  isLate: false,
  photoUri: null,
  frontPhotoUri: null,
  videoUri: null,
};
const post = { id: 'post', user_event_id: 'event' };
let client: QueryClient;
function setup() {
  return renderHook(() => useCreatePost(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}
beforeEach(() => {
  jest.clearAllMocks();
  notifyManager.setScheduler((callback) => callback());
  mockSession = { user: { id: 'member' } };
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  command.mockResolvedValue({ data: post, error: null } as never);
  jest.mocked(filterContent).mockReturnValue({ ok: true });
  jest
    .mocked(uploadPostMedia)
    .mockImplementation(async (_event, _id, _uri, slot) => `https://media.test/${slot}`);
  jest.mocked(uploadPostVideo).mockResolvedValue('https://media.test/video');
  jest.mocked(getCommittedPostReceipt).mockResolvedValue(null);
});
afterEach(() => {
  cleanup();
  client.clear();
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
});

test.each(['open', 'buy_in_open'])(
  'submits one atomic command and reconciles %s without cancelling active reads',
  async (status) => {
    client.setQueryData(key, { id: 'event', status, completed_at: null });
    const refetch = jest.spyOn(client, 'refetchQueries');
    const cancel = jest.spyOn(client, 'cancelQueries');
    const { result } = setup();
    await act(async () => {
      expect(await result.current.mutateAsync(payload)).toEqual(post);
    });
    expect(command.mock.calls).toEqual([
      [
        'complete_doji_with_post',
        {
          p_user_event_id: 'event',
          p_post_type: 'photo',
          p_caption: '',
          p_photo_url: null,
          p_front_photo_url: null,
          p_video_url: null,
          p_visibility: 'friends',
          p_idempotency_key: 'complete-doji:occurrence:event',
        },
      ],
    ]);
    expect(client.getQueryData(key)).toEqual({
      id: 'event',
      status: status === 'buy_in_open' ? 'late' : 'completed',
      completed_at: expect.any(String),
    });
    expect(cancel).toHaveBeenCalledWith({ queryKey: key }, { revert: false, silent: true });
    expect(refetch).toHaveBeenCalledWith({ queryKey: key }, { cancelRefetch: false });
    expect(scheduleQueryInvalidation).toHaveBeenCalledWith(client, [
      'profile',
      'leaderboard',
      'feed',
    ]);
    expect(mockFetchProfile).toHaveBeenCalledWith('member');
    expect(uploadPostMedia).not.toHaveBeenCalled();
    expect(uploadPostVideo).not.toHaveBeenCalled();
  },
);
test('uploads all supplied media under the same idempotency key before completing', async () => {
  const { result } = setup();
  await act(async () => {
    await result.current.mutateAsync({
      ...payload,
      caption: 'A caption',
      commandId: 'attempt',
      photoUri: 'local:photo',
      frontPhotoUri: 'local:front',
      videoUri: 'local:video',
    });
  });
  expect(uploadPostMedia.mock.calls).toEqual([
    ['event', 'attempt', 'local:photo', 'photo'],
    ['event', 'attempt', 'local:front', 'front'],
  ]);
  expect(uploadPostVideo).toHaveBeenCalledWith('event', 'attempt', 'local:video');
  expect(command).toHaveBeenCalledWith(
    'complete_doji_with_post',
    expect.objectContaining({
      p_photo_url: 'https://media.test/photo',
      p_front_photo_url: 'https://media.test/front',
      p_video_url: 'https://media.test/video',
      p_idempotency_key: 'attempt',
      p_caption: 'A caption',
    }),
  );
  expect(filterContent).toHaveBeenCalledWith('A caption');
});
test('task completion preserves explicit post type and cannot invent a cached event', async () => {
  const { result } = setup();
  await act(async () => {
    await result.current.mutateAsync({ ...payload, postType: 'task_complete' });
  });
  expect(command).toHaveBeenCalledWith(
    'complete_doji_with_post',
    expect.objectContaining({ p_post_type: 'task_complete' }),
  );
  expect(client.getQueryData(key)).toBeUndefined();
});
test('signout rejects before uploads or writes', async () => {
  mockSession = null;
  const { result } = setup();
  await act(async () => {
    await expect(result.current.mutateAsync(payload)).rejects.toThrow('Not authenticated');
  });
  expect(command).not.toHaveBeenCalled();
  expect(mockFetchProfile).not.toHaveBeenCalled();
});
test('blocked caption restores the previous event without uploading', async () => {
  const previous = { id: 'event', status: 'open' };
  client.setQueryData(key, previous);
  jest.mocked(filterContent).mockReturnValue({ ok: false, reason: 'Blocked' });
  const { result } = setup();
  await act(async () => {
    await expect(
      result.current.mutateAsync({ ...payload, caption: 'blocked', photoUri: 'local' }),
    ).rejects.toThrow('Blocked');
  });
  expect(uploadPostMedia).not.toHaveBeenCalled();
  expect(command).not.toHaveBeenCalled();
  expect(client.getQueryData(key)).toEqual(previous);
});
test('failed upload prevents completion and restores optimistic state', async () => {
  const previous = { id: 'event', status: 'open' };
  client.setQueryData(key, previous);
  jest.mocked(uploadPostVideo).mockRejectedValue(new Error('Upload failed'));
  const { result } = setup();
  await act(async () => {
    await expect(result.current.mutateAsync({ ...payload, videoUri: 'local' })).rejects.toThrow(
      'Upload failed',
    );
  });
  expect(command).not.toHaveBeenCalled();
  expect(getCommittedPostReceipt).not.toHaveBeenCalled();
  expect(client.getQueryData(key)).toEqual(previous);
});
test('ambiguous command response checks the committed receipt, never inserts a duplicate', async () => {
  command.mockResolvedValue({ error: new Error('Gateway timeout'), data: null } as never);
  jest.mocked(getCommittedPostReceipt).mockResolvedValue(post as never);
  const { result } = setup();
  await act(async () => {
    expect(await result.current.mutateAsync(payload)).toEqual(post);
  });
  expect(getCommittedPostReceipt).toHaveBeenCalledWith('event');
  expect(command).toHaveBeenCalledTimes(1);
  expect(mockFetchProfile).toHaveBeenCalledWith('member');
});
test.each([true, false])(
  'uncommitted command failure rolls back existing cache (%s)',
  async (cached) => {
    const previous = { id: 'event', status: 'open' };
    if (cached) client.setQueryData(key, previous);
    command.mockResolvedValue({ data: null, error: new Error('Closed') } as never);
    const { result } = setup();
    await act(async () => {
      await expect(result.current.mutateAsync(payload)).rejects.toThrow('Closed');
    });
    expect(client.getQueryData(key)).toEqual(cached ? previous : undefined);
    expect(command).toHaveBeenCalledTimes(1);
    expect(scheduleQueryInvalidation).not.toHaveBeenCalled();
  },
);
test('concurrent taps share media upload and completion', async () => {
  let finish!: (value: never) => void;
  command.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result } = setup();
  await act(async () => {
    const first = result.current.mutateAsync({ ...payload, photoUri: 'local' });
    const second = result.current.mutateAsync({ ...payload, photoUri: 'local' });
    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(uploadPostMedia).toHaveBeenCalledTimes(1);
    expect(command).toHaveBeenCalledTimes(1);
    finish({ data: post, error: null } as never);
    await Promise.all([first, second]);
  });
});
