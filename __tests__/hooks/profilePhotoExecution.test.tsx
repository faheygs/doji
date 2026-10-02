import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Picker from 'expo-image-picker';
import { Image } from 'expo-image';
import Toast from 'react-native-toast-message';
import { useProfilePhotoPicker } from '../../hooks/useProfilePhotoPicker';
import { useChangeProfilePhoto } from '../../hooks/useChangeProfilePhoto';
import type { AppDialogOptions } from '../../components/ui/AppDialog';

const mockShowDialog = jest.fn();
const mockUpload = jest.fn();
const mockRemove = jest.fn();
const mockUpdate = jest.fn();
let mockUser: string | undefined;
let mockAvatar: string | null;
jest.mock('../../contexts/DialogContext', () => ({
  useAppDialog: () => ({ showDialog: mockShowDialog }),
}));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: (select: (state: unknown) => unknown) =>
    select({
      session: mockUser ? { user: { id: mockUser } } : null,
      profile: { avatar_url: mockAvatar },
      updateProfile: mockUpdate,
    }),
}));
jest.mock('../../utils/upload', () => ({
  uploadAvatar: (...args: unknown[]) => mockUpload(...args),
  removePublicStorageObject: (...args: unknown[]) => mockRemove(...args),
}));
jest.mock('expo-image-picker', () => ({
  getPendingResultAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-image', () => ({ Image: { prefetch: jest.fn() } }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
const originalOS = Platform.OS;
let client: QueryClient;
function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
const picked: Picker.ImagePickerResult = {
  canceled: false,
  assets: [{ uri: 'file:///selected.jpg', width: 100, height: 100 }],
};
const cancelled: Picker.ImagePickerResult = { canceled: true, assets: null };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
}
const choose = (label: string) => {
  const dialog = mockShowDialog.mock.calls.at(-1)?.[0] as AppDialogOptions;
  expect(dialog.title).toBe('Profile photo');
  expect(dialog.layout).toBe('stacked');
  dialog.actions?.find((action) => action.label === label)?.onPress?.();
};
beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'ios';
  mockUser = 'member';
  mockAvatar = 'https://assets.test/old.jpg';
  mockUpload.mockReset().mockResolvedValue('https://assets.test/new.jpg');
  mockRemove.mockReset().mockResolvedValue(undefined);
  mockUpdate.mockReset().mockResolvedValue(undefined);
  jest.mocked(Picker.getPendingResultAsync).mockReset().mockResolvedValue(null);
  jest.mocked(Picker.launchCameraAsync).mockReset().mockResolvedValue(picked);
  jest.mocked(Picker.launchImageLibraryAsync).mockReset().mockResolvedValue(picked);
  const granted = {
    status: 'granted',
    granted: true,
    canAskAgain: true,
    expires: 'never',
  } as Picker.MediaLibraryPermissionResponse;
  jest.mocked(Picker.requestMediaLibraryPermissionsAsync).mockReset().mockResolvedValue(granted);
  jest.mocked(Picker.requestCameraPermissionsAsync).mockReset().mockResolvedValue(granted);
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
});
afterEach(() => {
  cleanup();
  client.clear();
  Platform.OS = originalOS;
  jest.restoreAllMocks();
});

test.each(['ios', 'android', 'web'] as const)(
  'profile picker selects library media on %s with platform-appropriate permission',
  async (platform) => {
    Platform.OS = platform;
    const onSelected = jest.fn();
    const { result } = renderHook(() => useProfilePhotoPicker(onSelected));
    await act(async () => {
      result.current();
      if (platform !== 'web') choose('Select a photo');
    });
    expect(onSelected).toHaveBeenCalledWith('file:///selected.jpg');
    expect(Picker.requestMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(
      platform === 'android' ? 0 : 1,
    );
    expect(Picker.launchImageLibraryAsync).toHaveBeenCalledWith({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
      mediaTypes: ['images'],
    });
  },
);
test.each(['Take a picture', 'Select a photo'])(
  'profile picker handles denied permission for %s without launching',
  async (action) => {
    const onSelected = jest.fn();
    const onError = jest.fn();
    const denied = {
      status: 'denied',
      granted: false,
      canAskAgain: false,
      expires: 'never',
    } as Picker.MediaLibraryPermissionResponse;
    jest.mocked(Picker.requestMediaLibraryPermissionsAsync).mockResolvedValue(denied);
    jest.mocked(Picker.requestCameraPermissionsAsync).mockResolvedValue(denied);
    const { result } = renderHook(() => useProfilePhotoPicker(onSelected, onError));
    await act(async () => {
      result.current();
      choose(action);
    });
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('Allow'));
    expect(onSelected).not.toHaveBeenCalled();
    expect(Picker.launchCameraAsync).not.toHaveBeenCalled();
    expect(Picker.launchImageLibraryAsync).not.toHaveBeenCalled();
  },
);
test.each(['Take a picture', 'Select a photo'])(
  'profile picker cancellation from %s preserves the existing photo',
  async (action) => {
    jest.mocked(Picker.launchCameraAsync).mockResolvedValue(cancelled);
    jest.mocked(Picker.launchImageLibraryAsync).mockResolvedValue(cancelled);
    const onSelected = jest.fn();
    const { result } = renderHook(() => useProfilePhotoPicker(onSelected));
    await act(async () => {
      result.current();
      choose(action);
    });
    expect(onSelected).not.toHaveBeenCalled();
  },
);
test('camera picker passes the cropped square to its caller', async () => {
  const onSelected = jest.fn();
  const { result } = renderHook(() => useProfilePhotoPicker(onSelected));
  await act(async () => {
    result.current();
    choose('Take a picture');
  });
  expect(Picker.launchCameraAsync).toHaveBeenCalledWith({
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.85,
    mediaTypes: ['images'],
  });
  expect(onSelected).toHaveBeenCalledWith('file:///selected.jpg');
});
test.each([picked, cancelled, null])(
  'Android picker recovers only an actual pending photo (%j)',
  async (pending) => {
    Platform.OS = 'android';
    jest.mocked(Picker.getPendingResultAsync).mockResolvedValue(pending);
    const onSelected = jest.fn();
    renderHook(() => useProfilePhotoPicker(onSelected));
    await act(async () => {});
    expect(onSelected).toHaveBeenCalledTimes(pending === picked ? 1 : 0);
  },
);
test.each([false, true])('pending picker failure respects disposal (%s)', async (disposed) => {
  Platform.OS = 'android';
  const pending = deferred<Picker.ImagePickerResult | null>();
  jest.mocked(Picker.getPendingResultAsync).mockReturnValue(pending.promise);
  const onError = jest.fn();
  const onSelected = jest.fn();
  const { unmount } = renderHook(() => useProfilePhotoPicker(onSelected, onError));
  if (disposed) unmount();
  await act(async () => pending.reject(new Error('native recovery failed')));
  expect(onError).toHaveBeenCalledTimes(disposed ? 0 : 1);
});
test('recovered picker result after unmount is discarded', async () => {
  Platform.OS = 'android';
  const pending = deferred<Picker.ImagePickerResult | null>();
  jest.mocked(Picker.getPendingResultAsync).mockReturnValue(pending.promise);
  const onSelected = jest.fn();
  const { unmount } = renderHook(() => useProfilePhotoPicker(onSelected));
  unmount();
  await act(async () => pending.resolve(picked));
  expect(onSelected).not.toHaveBeenCalled();
});

test.each(['ios', 'android', 'web'] as const)(
  'profile update on %s commits before deleting the old avatar and refreshing views',
  async (platform) => {
    Platform.OS = platform;
    client.setQueryData(['feed'], []);
    client.setQueryData(['friends'], []);
    client.setQueryData(['post', 'one'], {});
    client.setQueryData(['unrelated'], {});
    const update = deferred<void>();
    mockUpdate.mockReturnValue(update.promise);
    const { result } = renderHook(useChangeProfilePhoto, { wrapper: Wrapper });
    await act(async () => {
      result.current.openChangePhotoDialog();
      if (platform !== 'web') choose('Select a photo');
    });
    expect(result.current.uploading).toBe(true);
    expect(mockUpload).toHaveBeenCalledWith('member', 'file:///selected.jpg');
    expect(mockRemove).not.toHaveBeenCalled();
    await act(async () => update.resolve());
    expect(mockUpdate).toHaveBeenCalledWith({ avatar_url: 'https://assets.test/new.jpg' });
    expect(mockRemove).toHaveBeenCalledWith('avatars', 'https://assets.test/old.jpg');
    expect(Image.prefetch).toHaveBeenCalledWith('https://assets.test/new.jpg');
    expect(result.current).toMatchObject({ uploading: false, error: '' });
    expect(Toast.show).toHaveBeenCalledWith({ type: 'success', text1: 'Profile photo updated!' });
    for (const key of [['feed'], ['friends'], ['post', 'one']])
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(['unrelated'])?.isInvalidated).toBe(false);
  },
);
test.each([null, 'https://assets.test/new.jpg'])(
  'profile update does not remove an absent or unchanged avatar (%s)',
  async (avatar) => {
    mockAvatar = avatar;
    const { result } = renderHook(useChangeProfilePhoto, { wrapper: Wrapper });
    await act(async () => {
      result.current.openChangePhotoDialog();
      choose('Take a picture');
    });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockRemove).not.toHaveBeenCalled();
  },
);
test.each([new Error('upload failed'), 'opaque failure'])(
  'upload failures retain the old photo and show a bounded error (%j)',
  async (failure) => {
    mockUpload.mockRejectedValue(failure);
    const { result } = renderHook(useChangeProfilePhoto, { wrapper: Wrapper });
    await act(async () => {
      result.current.openChangePhotoDialog();
      choose('Select a photo');
    });
    expect(result.current).toMatchObject({
      uploading: false,
      error: failure instanceof Error ? failure.message : 'Could not upload photo',
    });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
    expect(Toast.show).not.toHaveBeenCalled();
    act(() => result.current.clearError());
    expect(result.current.error).toBe('');
  },
);
test('failed profile commit removes only the newly uploaded orphan', async () => {
  mockUpdate.mockRejectedValue(new Error('profile write failed'));
  const { result } = renderHook(useChangeProfilePhoto, { wrapper: Wrapper });
  await act(async () => {
    result.current.openChangePhotoDialog();
    choose('Take a picture');
  });
  expect(mockRemove).toHaveBeenCalledTimes(1);
  expect(mockRemove).toHaveBeenCalledWith('avatars', 'https://assets.test/new.jpg');
  expect(result.current.error).toBe('profile write failed');
  expect(Image.prefetch).not.toHaveBeenCalled();
});
test.each(['Take a picture', 'Select a photo'])(
  'update handles %s permission denial and cancel',
  async (action) => {
    const denied = {
      status: 'denied',
      granted: false,
      canAskAgain: false,
      expires: 'never',
    } as Picker.MediaLibraryPermissionResponse;
    jest.mocked(Picker.requestMediaLibraryPermissionsAsync).mockResolvedValueOnce(denied);
    jest.mocked(Picker.requestCameraPermissionsAsync).mockResolvedValueOnce(denied);
    const { result } = renderHook(useChangeProfilePhoto, { wrapper: Wrapper });
    await act(async () => {
      result.current.openChangePhotoDialog();
      choose(action);
    });
    expect(result.current.error).toContain('Allow');
    jest.mocked(Picker.launchCameraAsync).mockResolvedValue(cancelled);
    jest.mocked(Picker.launchImageLibraryAsync).mockResolvedValue(cancelled);
    await act(async () => {
      result.current.openChangePhotoDialog();
      choose(action);
    });
    expect(result.current.error).toBe('');
    expect(mockUpload).not.toHaveBeenCalled();
  },
);
test('signed-out avatar change never uploads', async () => {
  mockUser = undefined;
  const { result } = renderHook(useChangeProfilePhoto, { wrapper: Wrapper });
  await act(async () => {
    result.current.openChangePhotoDialog();
    choose('Select a photo');
  });
  expect(mockUpload).not.toHaveBeenCalled();
  expect(result.current.uploading).toBe(false);
});
test.each([picked, cancelled])(
  'Android avatar update consumes a recovered selection only when valid (%j)',
  async (pending) => {
    Platform.OS = 'android';
    jest.mocked(Picker.getPendingResultAsync).mockResolvedValue(pending);
    const { result } = renderHook(useChangeProfilePhoto, { wrapper: Wrapper });
    await act(async () => {});
    expect(mockUpload).toHaveBeenCalledTimes(pending === picked ? 1 : 0);
    expect(result.current.error).toBe('');
  },
);
test.each(['success', 'failure'] as const)(
  'unmounted avatar hook discards pending native recovery %s',
  async (outcome) => {
    Platform.OS = 'android';
    const pending = deferred<Picker.ImagePickerResult | null>();
    jest.mocked(Picker.getPendingResultAsync).mockReturnValue(pending.promise);
    const { unmount } = renderHook(useChangeProfilePhoto, { wrapper: Wrapper });
    unmount();
    await act(async () => {
      if (outcome === 'success') pending.resolve(picked);
      else pending.reject(new Error('native'));
    });
    expect(mockUpload).not.toHaveBeenCalled();
  },
);
test('active Android recovery failure is surfaced to the user', async () => {
  Platform.OS = 'android';
  jest.mocked(Picker.getPendingResultAsync).mockRejectedValue(new Error('native'));
  const { result } = renderHook(useChangeProfilePhoto, { wrapper: Wrapper });
  await waitFor(() =>
    expect(result.current.error).toBe('The cropped photo could not be opened. Please try again.'),
  );
});
