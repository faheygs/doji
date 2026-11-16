import { act, cleanup, renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';
import {
  dismissNotificationPresentations,
  useNotificationPresentation,
} from '../../hooks/useNotificationPresentation';

const originalOS = Platform.OS;
beforeEach(() => {
  jest.useFakeTimers();
  Platform.OS = 'android';
});
afterEach(() => {
  cleanup();
  jest.useRealTimers();
  Platform.OS = originalOS;
});

test('no mounted or visible presentation does not block navigation', async () => {
  await dismissNotificationPresentations();
  const close = jest.fn();
  renderHook(() => useNotificationPresentation(false, close));
  await dismissNotificationPresentations();
  expect(close).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test.each(['android', 'ios'] as const)(
  '%s closes the current inbox before navigation',
  async (os) => {
    const clear = jest.spyOn(global, 'clearTimeout');
    Platform.OS = os;
    const close = jest.fn(),
      complete = jest.fn();
    const { rerender, result } = renderHook(
      ({ visible }: { visible: boolean }) => useNotificationPresentation(visible, close),
      { initialProps: { visible: true } },
    );
    const pending = dismissNotificationPresentations().then(complete);
    expect(close).toHaveBeenCalledTimes(1);
    expect(complete).not.toHaveBeenCalled();
    rerender({ visible: false });
    await act(async () => {});
    if (os === 'ios') {
      expect(complete).not.toHaveBeenCalled();
      act(() => result.current());
    }
    await pending;
    expect(complete).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledWith(expect.anything());
    clear.mockRestore();
  },
);

test('iOS also waits for a dismissal already started by the member', async () => {
  Platform.OS = 'ios';
  const close = jest.fn(),
    complete = jest.fn();
  const { rerender, result } = renderHook(
    ({ visible }: { visible: boolean }) => useNotificationPresentation(visible, close),
    { initialProps: { visible: true } },
  );
  rerender({ visible: false });
  const pending = dismissNotificationPresentations().then(complete);
  await act(async () => {});
  expect(close).not.toHaveBeenCalled();
  expect(complete).not.toHaveBeenCalled();
  act(() => result.current());
  await pending;
});

test('concurrent responses share dismissal and unmount releases the wait', async () => {
  const close = jest.fn();
  const { unmount } = renderHook(() => useNotificationPresentation(true, close));
  const first = dismissNotificationPresentations(),
    second = dismissNotificationPresentations();
  expect(close).toHaveBeenCalledTimes(1);
  unmount();
  await Promise.all([first, second]);
  await dismissNotificationPresentations();
  expect(close).toHaveBeenCalledTimes(1);
});

test('reopening uses the latest close callback', async () => {
  const oldClose = jest.fn(),
    close = jest.fn();
  const { rerender } = renderHook(
    (props: { visible: boolean; close: () => void }) =>
      useNotificationPresentation(props.visible, props.close),
    { initialProps: { visible: false, close: oldClose } },
  );
  rerender({ visible: true, close });
  const pending = dismissNotificationPresentations();
  rerender({ visible: false, close });
  await pending;
  expect(oldClose).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledTimes(1);
});

test('a failed close rejects without fabricating navigation readiness', async () => {
  renderHook(() =>
    useNotificationPresentation(true, () => {
      throw new Error('cannot close');
    }),
  );
  await expect(dismissNotificationPresentations()).rejects.toThrow('cannot close');
});

test('missing native dismissal has a bounded failure, not a forced success', async () => {
  Platform.OS = 'ios';
  const { rerender, result } = renderHook(
    ({ visible }: { visible: boolean }) => useNotificationPresentation(visible, jest.fn()),
    { initialProps: { visible: true } },
  );
  const pending = expect(dismissNotificationPresentations()).rejects.toThrow(
    'Notification dismissal unavailable',
  );
  rerender({ visible: false });
  await act(async () => jest.advanceTimersByTime(5000));
  await pending;
  act(() => result.current());
  await dismissNotificationPresentations();
});
