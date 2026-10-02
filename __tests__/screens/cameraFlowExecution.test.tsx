import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ActivityIndicator, Platform } from 'react-native';
import CameraScreen from '../../app/(app)/camera';
import { useChallengeStore } from '../../stores/useChallengeStore';
import { KeyboardToolbarProvider } from '../../contexts/KeyboardToolbarContext';
import { ChallengeTimer } from '../../components/challenge/ChallengeTimer';
import { Button } from '../../components/ui/Button';
import type { UserEvent } from '../../types/database';
import type { PreparedPostImage } from '../../utils/upload';
const mockRouter = {
  back: jest.fn(),
  replace: jest.fn(),
  dismissTo: jest.fn(),
  canGoBack: () => true,
};
const mockRead = {
  data: undefined as UserEvent | undefined,
  isLoading: false,
  isFetching: false,
  refetch: jest.fn(),
};
const mockPost = { mutate: jest.fn(), isPending: false };
const mockLibraryPermission = jest.fn(),
  mockCameraPermission = jest.fn(),
  mockMicrophone = jest.fn(),
  mockLibrary = jest.fn(),
  mockCamera = jest.fn(),
  mockPrepare = jest.fn();
jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: require('../../constants/theme').lightColors }),
}));
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useFocusEffect: jest.fn() }));
jest.mock('../../hooks/useUserEvent', () => ({
  useUserEvent: () => mockRead,
  useCreatePost: () => mockPost,
}));
jest.mock('expo-camera', () => ({
  Camera: { requestMicrophonePermissionsAsync: (...args: unknown[]) => mockMicrophone(...args) },
}));
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: (...args: unknown[]) => mockCameraPermission(...args),
  requestMediaLibraryPermissionsAsync: (...args: unknown[]) => mockLibraryPermission(...args),
  launchImageLibraryAsync: (...args: unknown[]) => mockLibrary(...args),
  launchCameraAsync: (...args: unknown[]) => mockCamera(...args),
}));
jest.mock('../../utils/upload', () => ({
  preparePostImage: (...args: unknown[]) => mockPrepare(...args),
}));
jest.mock('expo-video', () => ({
  useVideoPlayer: () => ({ play: jest.fn(), pause: jest.fn() }),
  VideoView: 'VideoView',
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-keyboard-controller', () =>
  require('react-native-keyboard-controller/jest'),
);
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success' },
}));
const picture = {
  uri: 'file:///prepared.jpg',
  width: 200,
  height: 200,
  mimeType: 'image/jpeg',
} as PreparedPostImage;
const event = (photo = true, video = false, text = false) =>
  ({
    id: 'event',
    status: 'pending',
    expires_at: new Date(Date.now() + 600000).toISOString(),
    challenge: {
      id: 'challenge',
      type: 'photo',
      requires_photo: photo,
      requires_video: video,
      requires_text: text,
    },
  }) as UserEvent;
const start = () =>
  render(
    <KeyboardToolbarProvider>
      <CameraScreen />
    </KeyboardToolbarProvider>,
  );
const press = async (ui: ReturnType<typeof render>, label: string) => {
  await act(async () => fireEvent.press(ui.getByText(label)));
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.replaceProperty(Platform, 'OS', 'android');
  Object.assign(mockRead, { data: event(), isLoading: false, isFetching: false });
  mockPost.isPending = false;
  mockLibraryPermission.mockResolvedValue({ status: 'granted' });
  mockCameraPermission.mockResolvedValue({ granted: true });
  mockMicrophone.mockResolvedValue({ granted: true });
  mockLibrary
    .mockReset()
    .mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///library' }] });
  mockCamera
    .mockReset()
    .mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///camera' }] });
  mockPrepare.mockReset().mockResolvedValue(picture);
  useChallengeStore.getState().clearCaptures();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});
it.each(['loading', 'refetch', 'absent', 'wrong type'])(
  'handles %s event context without premature navigation',
  (mode) => {
    mockRead.data = undefined;
    mockRead.isLoading = mode === 'loading';
    mockRead.isFetching = mode === 'refetch';
    if (mode === 'wrong type')
      mockRead.data = { ...event(), challenge: { ...event().challenge!, type: 'task' } };
    const ui = start();
    if (mode !== 'wrong type') expect(ui.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    if (mode === 'absent') expect(mockRouter.back).toHaveBeenCalledTimes(1);
    else expect(mockRouter.back).not.toHaveBeenCalled();
    if (mode === 'wrong type') expect(mockRouter.replace).toHaveBeenCalledWith('/(app)/challenge');
  },
);
it.each(['library', 'camera'] as const)(
  'captures photo proof from %s, preserves failed submission and exits only on success',
  async (source) => {
    mockRead.data = event(true, false, true);
    const ui = start();
    await press(ui, source === 'library' ? 'Choose from library' : 'Use phone camera');
    expect(mockPrepare).toHaveBeenCalledWith({
      uri: source === 'library' ? 'file:///library' : 'file:///camera',
    });
    expect(ui.getByPlaceholderText('Add a caption (required)…')).toBeTruthy();
    await act(async () => ui.UNSAFE_getByType(Button).props.onPress());
    expect(ui.getByText('Add the required caption before sharing.')).toBeTruthy();
    expect(mockPost.mutate).not.toHaveBeenCalled();
    fireEvent.changeText(ui.getByPlaceholderText('Add a caption (required)…'), 'Proof caption');
    await press(ui, 'Share');
    expect(mockPost.mutate.mock.calls[0][0]).toEqual({
      userEventId: 'event',
      photoUri: picture,
      frontPhotoUri: null,
      videoUri: null,
      caption: 'Proof caption',
      isLate: false,
    });
    act(() => mockPost.mutate.mock.calls[0][1].onError(new Error('network request failed')));
    expect(useChallengeStore.getState().capturedPhoto).toEqual(picture);
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    act(() => mockPost.mutate.mock.calls[0][1].onSuccess());
    expect(useChallengeStore.getState().capturedPhoto).toBeNull();
    expect(mockRouter.replace).toHaveBeenCalledWith('/(app)');
  },
);
it.each([
  [true, true],
  [false, true],
  [false, false],
])('supports photo=%s/video=%s library proof and retake', async (photo, video) => {
  mockRead.data = event(photo, video);
  const ui = start();
  await press(ui, 'Choose from library');
  expect(ui.getByText('Share')).toBeTruthy();
  expect(mockLibrary).toHaveBeenCalledTimes(photo && video ? 2 : 1);
  await press(ui, 'Share');
  expect(mockPost.mutate.mock.calls[0][0].videoUri).toBe(video ? 'file:///library' : null);
  fireEvent.press(ui.getByLabelText('Retake media'));
  expect(ui.getByText('Add proof')).toBeTruthy();
  expect(useChallengeStore.getState().capturedVideoUri).toBeNull();
});
it.each([
  [true, true],
  [false, true],
  [false, false],
])('supports photo=%s/video=%s native capture', async (photo, video) => {
  mockRead.data = event(photo, video);
  const ui = start();
  await press(ui, 'Use phone camera');
  expect(mockMicrophone).toHaveBeenCalledTimes(video ? 1 : 0);
  expect(mockCamera).toHaveBeenCalledTimes(Number(photo) + Number(video));
  if (photo || video) {
    await press(ui, 'Share');
    expect(mockPost.mutate.mock.calls[0][0].videoUri).toBe(video ? 'file:///camera' : null);
  }
});
it.each(['library', 'camera', 'microphone'])('explains denied %s permission', async (source) => {
  mockRead.data = event(true, true);
  if (source === 'library') mockLibraryPermission.mockResolvedValue({ status: 'denied' });
  if (source === 'camera') mockCameraPermission.mockResolvedValue({ granted: false });
  if (source === 'microphone') mockMicrophone.mockResolvedValue({ granted: false });
  const ui = start();
  await press(ui, source === 'library' ? 'Choose from library' : 'Use phone camera');
  expect(
    ui.getByText(
      source === 'library'
        ? 'Allow photo library access to choose your proof.'
        : source === 'camera'
          ? 'Allow camera access to capture your proof, or use your library.'
          : 'Allow microphone access to record challenge video.',
    ),
  ).toBeTruthy();
  expect(mockLibrary).not.toHaveBeenCalled();
  expect(mockCamera).not.toHaveBeenCalled();
});
it.each(['library', 'camera'] as const)('handles %s preparation failures', async (source) => {
  mockPrepare.mockRejectedValue(new Error('bad image'));
  const ui = start();
  await press(ui, source === 'library' ? 'Choose from library' : 'Use phone camera');
  expect(
    ui.getByText(
      source === 'library'
        ? 'The photo could not be prepared. Try again or choose a different photo.'
        : 'The phone camera could not finish the capture. Try again or use your library.',
    ),
  ).toBeTruthy();
});
it.each([
  'library photo',
  'library video',
  'library second',
  'camera photo',
  'camera video',
  'camera second',
])('handles cancellation during %s without posting', async (kind) => {
  const video = kind.includes('video'),
    second = kind.includes('second');
  mockRead.data = event(!video, video || second);
  const picker = kind.startsWith('library') ? mockLibrary : mockCamera;
  if (second) picker.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///first' }] });
  picker.mockResolvedValueOnce({ canceled: true, assets: [] });
  const ui = start();
  await press(ui, kind.startsWith('library') ? 'Choose from library' : 'Use phone camera');
  expect(ui.getByText('Add proof')).toBeTruthy();
  expect(mockPost.mutate).not.toHaveBeenCalled();
  if (kind === 'camera second')
    expect(
      ui.getByText('Your photo is saved here. Add the required video to continue.'),
    ).toBeTruthy();
});
it('uses the library-only web affordance and reconciles timer expiry', () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  mockRead.data = { ...event(), status: 'buy_in_open' };
  const ui = start();
  expect(ui.queryByText('Use phone camera')).toBeNull();
  expect(ui.getByText(/Use your photo library/)).toBeTruthy();
  expect(ui.UNSAFE_getByType(ChallengeTimer).props.expiresAt).toBeNull();
  act(() => ui.UNSAFE_getByType(ChallengeTimer).props.onExpire());
  expect(mockRead.refetch).toHaveBeenCalledTimes(1);
  fireEvent.press(ui.getByLabelText('Close camera'));
  expect(mockRouter.back).toHaveBeenCalled();
});
it.each(['photo', 'video'])('revalidates required %s at submission', async (missing) => {
  mockRead.data = event(true, true);
  const ui = start();
  await press(ui, 'Choose from library');
  act(() => {
    if (missing === 'photo') useChallengeStore.getState().setCapturedPhoto(null);
    else useChallengeStore.getState().setCapturedVideoUri(null);
  });
  await press(ui, 'Share');
  expect(mockPost.mutate).not.toHaveBeenCalled();
  expect(ui.getByText(`Add the required ${missing} before sharing.`)).toBeTruthy();
});
