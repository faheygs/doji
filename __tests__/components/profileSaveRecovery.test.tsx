import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ProfileSaveRecovery } from '../../components/profile/ProfileSaveRecovery';
import { useAuthStore } from '../../stores/useAuthStore';

let mockEpoch = 0;
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: require('zustand').create(() => ({ profileSaveState: 'idle', retryProfileUpdate: jest.fn() })),
  captureProfileAccount: () => {
    const epoch = mockEpoch;
    return { isCurrent: () => epoch === mockEpoch };
  },
}));
jest.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ colors: require('../../constants/theme').lightColors }) }));
const retry = jest.mocked(useAuthStore.getState().retryProfileUpdate);
beforeEach(() => {
  mockEpoch = 0;
  retry.mockReset().mockResolvedValue();
  useAuthStore.setState({ profileSaveState: 'idle' });
});

test('idle has no retry and uncertain saves never replay on mount', () => {
  const view = render(<ProfileSaveRecovery />);
  expect(view.queryByText('Retry previous save')).toBeNull();
  act(() => useAuthStore.setState({ profileSaveState: 'uncertain' }));
  expect(view.getByText('Retry previous save')).toBeTruthy();
  expect(retry).not.toHaveBeenCalled();
});

test('explicit retry reports saving then confirms once', async () => {
  const saved = jest.fn();
  let resolve!: () => void;
  retry.mockImplementation(() => {
    useAuthStore.setState({ profileSaveState: 'saving' });
    return new Promise<void>((done) => { resolve = done; });
  });
  useAuthStore.setState({ profileSaveState: 'uncertain' });
  const view = render(<ProfileSaveRecovery onSaved={saved} />);
  await act(async () => fireEvent.press(view.getByText('Retry previous save')));
  expect(view.queryByText('Retry previous save')).toBeNull();
  expect(view.getByText('Saving your profile change…')).toBeTruthy();
  await act(async () => { useAuthStore.setState({ profileSaveState: 'idle' }); resolve(); });
  expect(saved).toHaveBeenCalledTimes(1);
  expect(view.queryByText('Saving your profile change…')).toBeNull();
});

test.each(['uncertain', 'idle'] as const)('retry failure remains visible when store is %s', async (state) => {
  retry.mockImplementation(async () => {
    useAuthStore.setState({ profileSaveState: state });
    throw Error('synthetic');
  });
  useAuthStore.setState({ profileSaveState: 'uncertain' });
  const view = render(<ProfileSaveRecovery />);
  await act(async () => fireEvent.press(view.getByText('Retry previous save')));
  expect(view.getByText('The previous save was not confirmed. Check your connection and profile fields.')).toBeTruthy();
  expect(retry).toHaveBeenCalledTimes(1);
});

test.each(['account', 'unmount'] as const)('late recovery cannot navigate after %s change', async (change) => {
  let resolve!: () => void;
  retry.mockReturnValue(new Promise<void>((done) => { resolve = done; }));
  useAuthStore.setState({ profileSaveState: 'uncertain' });
  const saved = jest.fn(), view = render(<ProfileSaveRecovery onSaved={saved} />);
  await act(async () => fireEvent.press(view.getByText('Retry previous save')));
  if (change === 'account') mockEpoch += 1; else view.unmount();
  await act(async () => resolve());
  expect(saved).not.toHaveBeenCalled();
});
